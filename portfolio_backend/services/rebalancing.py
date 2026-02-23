"""
Rebalancing Service - Portfolio rebalancing recommendations engine.
"""
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from portfolio_backend.database.models import Goal, User
from portfolio_backend.services.portfolio_service import PortfolioService
from portfolio_backend.services.market_data import MarketDataService
from portfolio_backend.config import settings


class RebalancingService:
    """Service for generating portfolio rebalancing recommendations."""
    
    # Thresholds
    MAX_SINGLE_STOCK_WEIGHT = 0.30  # 30%
    MIN_STOCKS_FOR_DIVERSIFICATION = 3
    DRIFT_THRESHOLD = 0.05  # 5%
    LOW_RISK_VULNERABILITY_PCT = -1.5
    HIGH_RISK_VULNERABILITY_PCT = -5.0

    INCOME_RANGE_TO_ANNUAL = {
        1: 240000,   # 20k/month
        2: 600000,   # 50k/month
        3: 1200000,  # 100k/month
        4: 1800000   # 150k/month
    }

    SAVINGS_BUCKET_TO_RATIO = {
        1: 0.08,
        2: 0.15,
        3: 0.25,
        4: 0.35
    }

    TIME_HORIZON_TO_YEARS = {
        1: 3,
        2: 5,
        3: 10,
        4: 15
    }

    VOLATILE_SYMBOLS = {
        "TSLA", "NVDA", "AMD", "PLTR", "COIN", "RIOT", "MARA", "SMCI", "NIO", "RIVN"
    }

    @staticmethod
    def _to_int(value, fallback: int) -> int:
        try:
            parsed = int(value)
            return parsed
        except (TypeError, ValueError):
            return fallback

    @staticmethod
    def _risk_label_from_text(value: str) -> int:
        text_value = str(value or "").strip().lower()
        if text_value in ["low", "very low"]:
            return 1
        if text_value in ["conservative", "low-medium", "low medium"]:
            return 2
        if text_value in ["balanced", "moderate", "medium"]:
            return 3
        if text_value in ["aggressive", "high"]:
            return 4
        return 3

    @staticmethod
    def _normalize_user_profile(raw_profile: Dict, goal: Goal) -> Dict:
        income_bucket = RebalancingService._to_int(raw_profile.get("annual_income_range"), 2)
        annual_income = (
            RebalancingService.INCOME_RANGE_TO_ANNUAL.get(income_bucket, 0)
            if income_bucket <= 4 else max(0, income_bucket)
        )

        savings_bucket = RebalancingService._to_int(raw_profile.get("savings_percent"), 2)
        if savings_bucket <= 4:
            savings_ratio = RebalancingService.SAVINGS_BUCKET_TO_RATIO.get(savings_bucket, 0.10)
        else:
            savings_ratio = max(0.01, min(0.95, savings_bucket / 100.0))

        risk_label = RebalancingService._to_int(raw_profile.get("risk_label"), 0)
        if risk_label <= 0:
            risk_label = RebalancingService._risk_label_from_text(goal.risk_preference)
        risk_label = max(1, min(4, risk_label))

        time_horizon_bucket = RebalancingService._to_int(raw_profile.get("time_horizon"), 2)
        time_horizon_years = RebalancingService.TIME_HORIZON_TO_YEARS.get(time_horizon_bucket, 5)

        occupation = str(raw_profile.get("occupation") or "Other").strip()
        primary_goal = str(raw_profile.get("goal") or goal.name or "Wealth").strip()
        monthly_capacity = (annual_income * savings_ratio) / 12 if annual_income > 0 else 0

        risk_text_map = {
            1: "Low",
            2: "Conservative",
            3: "Moderate",
            4: "Aggressive"
        }

        return {
            "occupation": occupation,
            "annual_income_estimate": round(annual_income, 2),
            "savings_ratio": round(savings_ratio, 4),
            "monthly_investment_capacity": round(monthly_capacity, 2),
            "risk_label": risk_label,
            "risk_text": risk_text_map.get(risk_label, "Moderate"),
            "primary_goal": primary_goal,
            "time_horizon_bucket": time_horizon_bucket,
            "time_horizon_years": time_horizon_years
        }

    @staticmethod
    def _get_user_profile(db: Session, goal: Goal) -> Dict:
        pa_user = db.query(User).filter(User.id == goal.user_id).first()
        if not pa_user:
            return RebalancingService._normalize_user_profile({}, goal)

        row = None
        if pa_user.pg_user_id:
            row = db.execute(
                text(
                    """
                    SELECT occupation, annual_income_range, savings_percent, risk_label, goal, time_horizon
                    FROM newusers
                    WHERE id = :uid
                    """
                ),
                {"uid": pa_user.pg_user_id}
            ).mappings().first()

        if not row and pa_user.email:
            row = db.execute(
                text(
                    """
                    SELECT occupation, annual_income_range, savings_percent, risk_label, goal, time_horizon
                    FROM newusers
                    WHERE LOWER(email) = LOWER(:email)
                    ORDER BY id ASC
                    LIMIT 1
                    """
                ),
                {"email": pa_user.email}
            ).mappings().first()

        return RebalancingService._normalize_user_profile(dict(row) if row else {}, goal)
    
    @staticmethod
    def analyze_portfolio(db: Session, goal_id: int) -> Dict:
        """
        Comprehensive portfolio analysis for rebalancing decisions.
        """
        # Compute holdings once and pass through to avoid redundant calls
        holdings = PortfolioService.get_holdings(db, goal_id)
        portfolio = PortfolioService.calculate_portfolio_value(db, goal_id, holdings)
        allocation = PortfolioService.get_asset_allocation(db, goal_id, holdings)
        metrics = PortfolioService.get_performance_metrics(db, goal_id, holdings)
        goal = db.query(Goal).filter(Goal.id == goal_id).first()
        
        if not goal:
            return {"error": "Goal not found"}

        user_profile = RebalancingService._get_user_profile(db, goal)
        
        analysis = {
            "goal_id": goal_id,
            "goal_name": goal.name,
            "risk_preference": goal.risk_preference,
            "portfolio_value": portfolio.get('total_current_value', 0),
            "target_value": portfolio.get('target_value', 0),
            "progress": portfolio.get('progress_percentage', 0),
            "days_remaining": portfolio.get('days_remaining', 0),
            "holdings_count": len(allocation),
            "diversification_score": metrics.get('diversification_score', 0),
            "concentration_risk": metrics.get('concentration_risk', 'N/A'),
            "on_track": metrics.get('goal_on_track', False),
            "profile_context": user_profile,
            "issues": [],
            "recommendations": []
        }
        
        # Analyze issues
        issues = RebalancingService._identify_issues(allocation, holdings, goal, portfolio, metrics, user_profile)
        analysis["issues"] = issues
        
        # Generate recommendations based on issues
        recommendations = RebalancingService._generate_recommendations(
            db, goal_id, allocation, holdings, goal, portfolio, issues, user_profile
        )
        analysis["recommendations"] = recommendations
        
        return analysis
    
    @staticmethod
    def _identify_issues(
        allocation: List[Dict],
        holdings: List[Dict],
        goal: Goal,
        portfolio: Dict,
        metrics: Dict,
        user_profile: Dict
    ) -> List[Dict]:
        """Identify portfolio issues that need addressing."""
        issues = []
        
        # Check for concentration risk
        for asset in allocation:
            if asset['weight'] > RebalancingService.MAX_SINGLE_STOCK_WEIGHT * 100:
                issues.append({
                    "type": "CONCENTRATION",
                    "severity": "HIGH",
                    "asset": asset['symbol'],
                    "detail": f"{asset['symbol']} is {asset['weight']:.1f}% of portfolio (max recommended: {RebalancingService.MAX_SINGLE_STOCK_WEIGHT * 100}%)",
                    "impact": "High risk if this stock underperforms"
                })
        
        # Check diversification
        if len(allocation) < RebalancingService.MIN_STOCKS_FOR_DIVERSIFICATION:
            issues.append({
                "type": "DIVERSIFICATION",
                "severity": "MODERATE",
                "detail": f"Portfolio has only {len(allocation)} stocks (recommended: at least {RebalancingService.MIN_STOCKS_FOR_DIVERSIFICATION})",
                "impact": "Limited risk distribution"
            })
        
        # Check goal progress
        if not metrics.get('goal_on_track', True):
            expected = metrics.get('expected_progress', 0)
            actual = metrics.get('actual_progress', 0)
            shortfall = expected - actual
            issues.append({
                "type": "GOAL_PROGRESS",
                "severity": "MODERATE" if shortfall < 20 else "HIGH",
                "detail": f"Behind target by {shortfall:.1f}% (expected: {expected:.1f}%, actual: {actual:.1f}%)",
                "impact": "May not reach goal by deadline"
            })
        
        # Check if deadline is near
        days_remaining = portfolio.get('days_remaining', 0)
        if days_remaining < 90 and portfolio.get('progress_percentage', 0) < 80:
            issues.append({
                "type": "DEADLINE",
                "severity": "HIGH",
                "detail": f"Only {days_remaining} days remaining with {portfolio.get('progress_percentage', 0):.1f}% progress",
                "impact": "Unlikely to meet goal on time"
            })
        
        # User risk-aware vulnerability checks.
        if user_profile.get("risk_label", 3) <= 2:
            for holding in holdings:
                pnl_pct = float(holding.get("unrealized_pnl_pct") or 0)
                symbol = holding.get("symbol")
                if pnl_pct <= RebalancingService.LOW_RISK_VULNERABILITY_PCT:
                    issues.append({
                        "type": "VULNERABILITY",
                        "severity": "HIGH" if pnl_pct <= RebalancingService.HIGH_RISK_VULNERABILITY_PCT else "MODERATE",
                        "asset": symbol,
                        "detail": f"{symbol} is down {pnl_pct:.2f}% for a low-risk profile",
                        "impact": "Protective action may be needed sooner than usual"
                    })

        primary_goal = str(user_profile.get("primary_goal") or "").strip().lower()
        if "emergency" in primary_goal and metrics.get("risk_level") == "HIGH":
            issues.append({
                "type": "GOAL_MISMATCH",
                "severity": "HIGH",
                "detail": "Emergency-focused profile is currently exposed to high portfolio volatility",
                "impact": "Goal safety may be compromised by market swings"
            })

        amount_remaining = portfolio.get("amount_remaining", 0)
        monthly_capacity = float(user_profile.get("monthly_investment_capacity") or 0)
        if days_remaining > 0 and amount_remaining > 0 and monthly_capacity > 0:
            monthly_required = amount_remaining / max(1, (days_remaining / 30))
            if monthly_required > monthly_capacity * 1.15:
                issues.append({
                    "type": "AFFORDABILITY",
                    "severity": "HIGH" if monthly_required > monthly_capacity * 1.5 else "MODERATE",
                    "detail": f"Required monthly investment ({monthly_required:.0f}) exceeds estimated capacity ({monthly_capacity:.0f})",
                    "impact": "Current contribution path may not be sustainable"
                })
        
        return issues
    
    @staticmethod
    def _generate_recommendations(
        db: Session,
        goal_id: int,
        allocation: List[Dict],
        holdings: List[Dict],
        goal: Goal,
        portfolio: Dict,
        issues: List[Dict],
        user_profile: Dict
    ) -> List[Dict]:
        """Generate actionable recommendations based on identified issues."""
        recommendations = []
        issued_actions = set()

        def add_recommendation(action: str, reason: str, priority: str = "MODERATE", **extra):
            key = f"{action}:{extra.get('symbol', '')}:{reason}"
            if key in issued_actions:
                return
            issued_actions.add(key)
            payload = {
                "action": action,
                "reason": reason,
                "message": reason,
                "priority": priority
            }
            payload.update(extra)
            recommendations.append(payload)
        
        for issue in issues:
            if issue['type'] == "CONCENTRATION":
                # Recommend reducing overweight position
                symbol = issue['asset']
                current_weight = next((a['weight'] for a in allocation if a['symbol'] == symbol), 0)
                target_weight = RebalancingService.MAX_SINGLE_STOCK_WEIGHT * 100
                excess_weight = current_weight - target_weight
                holding = next((h for h in holdings if h.get("symbol") == symbol), None)

                if holding:
                    current_price = float(holding.get("current_price") or 0) or MarketDataService.get_current_price(symbol)
                    quantity_held = int(holding.get("quantity") or 0)
                    if current_price and current_price > 0 and quantity_held > 0:
                        portfolio_value = portfolio.get('total_current_value', 0)
                        excess_value = max(0.0, (excess_weight / 100) * portfolio_value)
                        shares_to_sell = min(quantity_held, int(excess_value / current_price))

                        if shares_to_sell > 0:
                            add_recommendation(
                                "SELL",
                                f"Reduce concentration from {current_weight:.1f}% to ~{target_weight:.0f}%",
                                "HIGH",
                                symbol=symbol,
                                quantity=shares_to_sell,
                                estimated_value=round(shares_to_sell * current_price, 2),
                                type="risk"
                            )
            
            elif issue['type'] == "DIVERSIFICATION":
                add_recommendation(
                    "DIVERSIFY",
                    "Add more stocks to improve diversification",
                    "MODERATE",
                    suggestion="Consider adding stocks from different sectors",
                    type="diversify"
                )
            
            elif issue['type'] == "GOAL_PROGRESS":
                amount_remaining = portfolio.get('amount_remaining', 0)
                days_remaining = portfolio.get('days_remaining', 0)
                
                if days_remaining > 0:
                    monthly_investment = amount_remaining / (days_remaining / 30)
                    add_recommendation(
                        "INVEST_MORE",
                        "Increase investment to get back on track",
                        "HIGH" if issue['severity'] == "HIGH" else "MODERATE",
                        suggested_monthly=round(monthly_investment, 2),
                        type="goal"
                    )
            
            elif issue['type'] == "DEADLINE":
                # Risk-based recommendation
                if goal.risk_preference == "low":
                    add_recommendation(
                        "EXTEND_DEADLINE",
                        "Consider extending goal deadline for safer returns",
                        "HIGH",
                        type="goal"
                    )
                else:
                    add_recommendation(
                        "AGGRESSIVE_INVEST",
                        "Increase investment frequency to catch up",
                        "HIGH",
                        warning="Higher risk approach",
                        type="goal"
                    )

            elif issue['type'] == "VULNERABILITY":
                symbol = issue.get("asset")
                holding = next((h for h in holdings if h.get("symbol") == symbol), None)
                qty = max(1, int((holding.get("quantity") if holding else 0) * 0.2))
                add_recommendation(
                    "PROTECT_POSITION",
                    f"{symbol} is vulnerable for your low-risk profile; consider reducing exposure.",
                    "HIGH" if issue.get("severity") == "HIGH" else "MODERATE",
                    symbol=symbol,
                    quantity=qty if qty > 0 else None,
                    type="risk"
                )

            elif issue['type'] == "GOAL_MISMATCH":
                add_recommendation(
                    "ALIGN_WITH_GOAL",
                    "Shift towards lower-volatility holdings to match your primary goal.",
                    "HIGH",
                    type="goal"
                )

            elif issue['type'] == "AFFORDABILITY":
                monthly_capacity = float(user_profile.get("monthly_investment_capacity") or 0)
                add_recommendation(
                    "ADJUST_PLAN",
                    "Current target pace exceeds your estimated savings capacity; rebalance timeline or contribution plan.",
                    "HIGH" if issue.get("severity") == "HIGH" else "MODERATE",
                    suggested_monthly=round(monthly_capacity, 2),
                    type="goal"
                )
        
        # Profile-aware guidance (occupation/goal/risk) even when no hard issues.
        occupation = str(user_profile.get("occupation") or "").strip().lower()
        primary_goal = str(user_profile.get("primary_goal") or "").strip().lower()
        risk_label = int(user_profile.get("risk_label") or 3)
        monthly_capacity = float(user_profile.get("monthly_investment_capacity") or 0)

        if "student" in occupation:
            add_recommendation(
                "AUTOMATE_SMALL_SIP",
                "As a student profile, prioritize small automatic monthly contributions to build discipline.",
                "LOW",
                suggested_monthly=round(max(500, monthly_capacity * 0.5), 2) if monthly_capacity > 0 else 500,
                type="info"
            )

        if "emergency" in primary_goal:
            add_recommendation(
                "LIQUIDITY_BUFFER",
                "Emergency goal detected: keep a meaningful portion in lower-volatility, liquid assets.",
                "HIGH" if risk_label <= 2 else "MODERATE",
                type="goal"
            )
        elif "retirement" in primary_goal:
            add_recommendation(
                "LONG_HORIZON_DISCIPLINE",
                "Retirement goal detected: stay diversified and increase contributions gradually over time.",
                "LOW",
                type="goal"
            )

        # If still empty, provide maintenance recommendation.
        if not recommendations:
            add_recommendation(
                "HOLD",
                "Portfolio is well-balanced. Continue current strategy.",
                "LOW",
                type="info"
            )
        
        return recommendations
    
    @staticmethod
    def get_rebalancing_suggestions(db: Session, goal_id: int) -> Dict:
        """
        Get specific buy/sell suggestions to rebalance portfolio.
        """
        analysis = RebalancingService.analyze_portfolio(db, goal_id)
        holdings = PortfolioService.get_holdings(db, goal_id)
        
        if not holdings:
            return {
                "status": "NO_HOLDINGS",
                "message": "No holdings to rebalance",
                "suggestions": []
            }
        
        # Calculate target allocation (equal weight for simplicity)
        portfolio_value = sum(h.get('current_value', 0) for h in holdings)
        if portfolio_value <= 0:
            return {
                "status": "NO_HOLDINGS",
                "message": "No holdings to rebalance",
                "suggestions": []
            }

        num_holdings = len(holdings)
        target_weight = 100 / num_holdings if num_holdings > 0 else 0
        
        suggestions = []
        
        for asset in holdings:
            current_value = asset.get('current_value', 0)
            current_weight = (current_value / portfolio_value * 100) if portfolio_value > 0 else 0
            target_value = (target_weight / 100) * portfolio_value
            trade_value = target_value - current_value
            drift = current_weight - target_weight
            
            if abs(drift) > RebalancingService.DRIFT_THRESHOLD * 100:
                symbol = asset['symbol']
                current_price = asset.get('current_price') or MarketDataService.get_current_price(symbol)
                if not current_price or current_price <= 0:
                    continue

                shares = int(abs(trade_value) / current_price)
                if shares <= 0:
                    continue

                suggestions.append({
                    "action": "BUY" if trade_value > 0 else "SELL",
                    "symbol": symbol,
                    "quantity": shares,
                    "trade_value": round(abs(trade_value), 2),
                    "current_weight": round(current_weight, 2),
                    "target_weight": round(target_weight, 2),
                    "drift": round(drift, 2)
                })
        
        return {
            "status": "REBALANCE_SUGGESTED" if suggestions else "BALANCED",
            "target_strategy": "Equal Weight",
            "portfolio_value": round(portfolio_value, 2),
            "suggestions": suggestions,
            "analysis": analysis
        }
    
    @staticmethod
    def get_buy_recommendations(db: Session, goal_id: int) -> List[Dict]:
        """
        Get smart buy recommendations based on portfolio needs.
        """
        portfolio = PortfolioService.calculate_portfolio_value(db, goal_id)
        allocation = PortfolioService.get_asset_allocation(db, goal_id)
        goal = db.query(Goal).filter(Goal.id == goal_id).first()
        
        recommendations = []
        user_profile = RebalancingService._get_user_profile(db, goal) if goal else {}
        risk_label = int(user_profile.get("risk_label") or 3)
        
        # Get sectors already in portfolio
        existing_symbols = [a['symbol'] for a in allocation]
        
        # Suggest diversification stocks
        if len(allocation) < 5:
            # Suggest some popular stocks not in portfolio
            all_stocks = MarketDataService.search_stocks("", limit=20)
            for stock in all_stocks:
                if stock['symbol'] not in existing_symbols:
                    if risk_label <= 2 and stock['symbol'] in RebalancingService.VOLATILE_SYMBOLS:
                        continue
                    info = MarketDataService.get_stock_info(stock['symbol'])
                    if info:
                        recommendations.append({
                            "symbol": stock['symbol'],
                            "name": stock['name'],
                            "current_price": info.get('current_price', 0),
                            "reason": "Diversification opportunity",
                            "profile_fit": "Aligned with conservative profile" if risk_label <= 2 else "Aligned with growth profile",
                            "sector": info.get('sector', 'Unknown')
                        })
                        if len(recommendations) >= 5:
                            break
        
        return recommendations

