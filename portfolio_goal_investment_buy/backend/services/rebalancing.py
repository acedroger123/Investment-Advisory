"""
Rebalancing Service - Portfolio rebalancing recommendations engine.
"""
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from database.models import Goal, Holding
from services.portfolio_service import PortfolioService
from services.market_data import MarketDataService
from config import settings


class RebalancingService:
    """Service for generating portfolio rebalancing recommendations."""

    # Per-risk allocation strategies
    # max_single_weight : upper limit for any one stock (triggers concentration issue)
    # drift_threshold   : how far from target before suggesting a rebalance
    # min_stocks        : minimum recommended holdings
    # strategy_label    : human-readable name shown in the UI
    RISK_STRATEGIES = {
        "low": {
            "max_single_weight": 0.20,   # 20% — conservative, spread wide
            "drift_threshold":   0.04,   # tighter tolerance
            "min_stocks":        5,
            "strategy_label":    "Conservative (Capped Equal-Weight)",
            "description":       "Each stock capped at 20%. Aims for even distribution across ≥5 stocks.",
        },
        "moderate": {
            "max_single_weight": 0.30,   # 30% — balanced
            "drift_threshold":   0.05,
            "min_stocks":        3,
            "strategy_label":    "Balanced (Equal-Weight)",
            "description":       "Each stock capped at 30%. Equal-weight across holdings.",
        },
        "high": {
            "max_single_weight": 0.50,   # 50% — growth-tilt, allow big winners
            "drift_threshold":   0.08,   # wider band before rebalancing
            "min_stocks":        2,
            "strategy_label":    "Aggressive (Growth-Tilt)",
            "description":       "Allows up to 50% in a single stock. Fewer, higher-conviction positions.",
        },
    }
    
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
            "strategy": RebalancingService.RISK_STRATEGIES.get(
                goal.risk_preference, RebalancingService.RISK_STRATEGIES["moderate"]
            ),
            "issues": [],
            "recommendations": []
        }
        
        # Analyze issues
        issues = RebalancingService._identify_issues(allocation, goal, portfolio, metrics)
        analysis["issues"] = issues
        
        # Generate recommendations based on issues
        recommendations = RebalancingService._generate_recommendations(
            db, goal_id, allocation, goal, portfolio, issues
        )
        analysis["recommendations"] = recommendations
        
        return analysis
    
    @staticmethod
    def _identify_issues(
        allocation: List[Dict],
        goal: Goal,
        portfolio: Dict,
        metrics: Dict
    ) -> List[Dict]:
        """Identify portfolio issues that need addressing, using risk-appropriate thresholds."""
        issues = []

        # Use the strategy for this goal's risk level
        strategy = RebalancingService.RISK_STRATEGIES.get(
            goal.risk_preference, RebalancingService.RISK_STRATEGIES["moderate"]
        )
        max_weight = strategy["max_single_weight"] * 100
        min_stocks = strategy["min_stocks"]

        # Check for concentration risk (using risk-appropriate cap)
        for asset in allocation:
            if asset['weight'] > max_weight:
                issues.append({
                    "type": "CONCENTRATION",
                    "severity": "HIGH",
                    "asset": asset['symbol'],
                    "detail": (
                        f"{asset['symbol']} is {asset['weight']:.1f}% of portfolio "
                        f"(max recommended for {goal.risk_preference} risk: {max_weight:.0f}%)"
                    ),
                    "impact": "High risk if this stock underperforms"
                })

        # Check diversification (using risk-appropriate minimum)
        if len(allocation) < min_stocks:
            issues.append({
                "type": "DIVERSIFICATION",
                "severity": "MODERATE",
                "detail": (
                    f"Portfolio has only {len(allocation)} stocks "
                    f"(recommended for {goal.risk_preference} risk: at least {min_stocks})"
                ),
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

        return issues
    
    @staticmethod
    def _generate_recommendations(
        db: Session,
        goal_id: int,
        allocation: List[Dict],
        goal: Goal,
        portfolio: Dict,
        issues: List[Dict]
    ) -> List[Dict]:
        """Generate actionable recommendations based on identified issues."""
        recommendations = []
        
        for issue in issues:
            if issue['type'] == "CONCENTRATION":
                # Recommend reducing overweight position
                symbol = issue['asset']
                current_weight = next((a['weight'] for a in allocation if a['symbol'] == symbol), 0)
                # Use risk-appropriate target cap
                strategy = RebalancingService.RISK_STRATEGIES.get(
                    goal.risk_preference, RebalancingService.RISK_STRATEGIES["moderate"]
                )
                target_weight = strategy["max_single_weight"] * 100
                excess_weight = current_weight - target_weight

                holding = db.query(Holding).filter(
                    Holding.goal_id == goal_id,
                    Holding.stock_symbol == symbol
                ).first()

                if holding:
                    current_price = MarketDataService.get_current_price(symbol)
                    if current_price:
                        portfolio_value = portfolio.get('total_current_value', 0)
                        excess_value = (excess_weight / 100) * portfolio_value
                        shares_to_sell = int(excess_value / current_price)

                        if shares_to_sell > 0:
                            recommendations.append({
                                "action": "SELL",
                                "symbol": symbol,
                                "quantity": shares_to_sell,
                                "reason": f"Reduce concentration from {current_weight:.1f}% to ~{target_weight:.0f}% ({goal.risk_preference} risk cap)",
                                "priority": "HIGH",
                                "estimated_value": round(shares_to_sell * current_price, 2)
                            })
            
            elif issue['type'] == "DIVERSIFICATION":
                recommendations.append({
                    "action": "DIVERSIFY",
                    "reason": "Add more stocks to improve diversification",
                    "priority": "MODERATE",
                    "suggestion": "Consider adding stocks from different sectors"
                })
            
            elif issue['type'] == "GOAL_PROGRESS":
                amount_remaining = portfolio.get('amount_remaining', 0)
                days_remaining = portfolio.get('days_remaining', 0)
                
                if days_remaining > 0:
                    monthly_investment = amount_remaining / (days_remaining / 30)
                    recommendations.append({
                        "action": "INVEST_MORE",
                        "reason": "Increase investment to get back on track",
                        "priority": "HIGH" if issue['severity'] == "HIGH" else "MODERATE",
                        "suggested_monthly": round(monthly_investment, 2)
                    })
            
            elif issue['type'] == "DEADLINE":
                # Risk-based recommendation
                if goal.risk_preference == "low":
                    recommendations.append({
                        "action": "EXTEND_DEADLINE",
                        "reason": "Consider extending goal deadline for safer returns",
                        "priority": "HIGH"
                    })
                else:
                    recommendations.append({
                        "action": "AGGRESSIVE_INVEST",
                        "reason": "Increase investment frequency to catch up",
                        "priority": "HIGH",
                        "warning": "Higher risk approach"
                    })
        
        # If no issues, provide maintenance recommendations
        if not recommendations:
            recommendations.append({
                "action": "HOLD",
                "reason": "Portfolio is well-balanced. Continue current strategy.",
                "priority": "LOW"
            })
        
        return recommendations
    
    @staticmethod
    def get_rebalancing_suggestions(db: Session, goal_id: int) -> Dict:
        """
        Get specific buy/sell suggestions to rebalance portfolio.
        Uses a risk-preference-aware target allocation strategy:
          - low:      Conservative capped equal-weight (20% max per stock)
          - moderate: Balanced equal-weight (30% max per stock)
          - high:     Growth-tilt (50% max, fewer stocks OK)
        """
        analysis = RebalancingService.analyze_portfolio(db, goal_id)
        allocation = PortfolioService.get_asset_allocation(db, goal_id)
        goal = db.query(Goal).filter(Goal.id == goal_id).first()

        if not allocation:
            return {
                "status": "NO_HOLDINGS",
                "message": "No holdings to rebalance",
                "suggestions": []
            }

        risk_key = goal.risk_preference if goal and goal.risk_preference in RebalancingService.RISK_STRATEGIES else "moderate"
        strategy = RebalancingService.RISK_STRATEGIES[risk_key]
        max_single = strategy["max_single_weight"] * 100   # as percentage
        drift_threshold = strategy["drift_threshold"] * 100

        num_holdings = len(allocation)
        total_value = sum(a['value'] for a in allocation)

        # Build target weights per stock (equal-weight, but capped at max_single)
        # Step 1: assign equal weight, then redistribute any excess above the cap
        raw_equal = 100.0 / num_holdings if num_holdings > 0 else 0
        target_weights: dict[str, float] = {}

        if raw_equal > max_single:
            # All stocks would be over the cap — cap them all (unusual edge case)
            for asset in allocation:
                target_weights[asset['symbol']] = max_single
        else:
            for asset in allocation:
                target_weights[asset['symbol']] = raw_equal

        suggestions = []

        for asset in allocation:
            current_weight = asset['weight']
            target_weight = target_weights[asset['symbol']]
            drift = current_weight - target_weight

            if abs(drift) > drift_threshold:
                holding = db.query(Holding).filter(
                    Holding.goal_id == goal_id,
                    Holding.stock_symbol == asset['symbol']
                ).first()

                if holding:
                    current_price = MarketDataService.get_current_price(asset['symbol'])
                    if current_price:
                        if drift > 0:
                            # Overweight — suggest selling
                            excess_value = (drift / 100) * total_value
                            shares = int(excess_value / current_price)
                            if shares > 0:
                                suggestions.append({
                                    "action": "SELL",
                                    "symbol": asset['symbol'],
                                    "quantity": shares,
                                    "current_weight": round(current_weight, 2),
                                    "target_weight": round(target_weight, 2),
                                    "drift": round(drift, 2),
                                    "reason": f"Overweight vs {risk_key} target ({target_weight:.1f}%)"
                                })
                        else:
                            # Underweight — suggest buying
                            deficit_value = abs(drift / 100) * total_value
                            shares = int(deficit_value / current_price)
                            if shares > 0:
                                suggestions.append({
                                    "action": "BUY",
                                    "symbol": asset['symbol'],
                                    "quantity": shares,
                                    "current_weight": round(current_weight, 2),
                                    "target_weight": round(target_weight, 2),
                                    "drift": round(drift, 2),
                                    "reason": f"Underweight vs {risk_key} target ({target_weight:.1f}%)"
                                })

        return {
            "status": "REBALANCE_SUGGESTED" if suggestions else "BALANCED",
            "target_strategy": strategy["strategy_label"],
            "strategy_description": strategy["description"],
            "risk_preference": risk_key,
            "max_single_stock_weight": max_single,
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
        
        # Get sectors already in portfolio
        existing_symbols = [a['symbol'] for a in allocation]
        
        # Suggest diversification stocks
        if len(allocation) < 5:
            # Suggest some popular stocks not in portfolio
            all_stocks = MarketDataService.search_stocks("", limit=20)
            for stock in all_stocks:
                if stock['symbol'] not in existing_symbols:
                    info = MarketDataService.get_stock_info(stock['symbol'])
                    if info:
                        recommendations.append({
                            "symbol": stock['symbol'],
                            "name": stock['name'],
                            "current_price": info.get('current_price', 0),
                            "reason": "Diversification opportunity",
                            "sector": info.get('sector', 'Unknown')
                        })
                        if len(recommendations) >= 5:
                            break
        
        return recommendations
