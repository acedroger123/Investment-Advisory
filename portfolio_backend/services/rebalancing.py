"""
Rebalancing Service - Portfolio rebalancing recommendations engine.
"""
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from portfolio_backend.database.models import Goal, Holding
from portfolio_backend.services.portfolio_service import PortfolioService
from portfolio_backend.services.market_data import MarketDataService
from portfolio_backend.config import settings


class RebalancingService:
    """Service for generating portfolio rebalancing recommendations."""
    
    # Thresholds
    MAX_SINGLE_STOCK_WEIGHT = 0.30  # 30%
    MIN_STOCKS_FOR_DIVERSIFICATION = 3
    DRIFT_THRESHOLD = 0.05  # 5%
    
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
        
        # Check for unrealized losses
        holdings = [a for a in allocation]  # Would need to get P&L data
        
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
                target_weight = RebalancingService.MAX_SINGLE_STOCK_WEIGHT * 100
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
                                "reason": f"Reduce concentration from {current_weight:.1f}% to ~{target_weight:.0f}%",
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
        """
        analysis = RebalancingService.analyze_portfolio(db, goal_id)
        allocation = PortfolioService.get_asset_allocation(db, goal_id)
        
        if not allocation:
            return {
                "status": "NO_HOLDINGS",
                "message": "No holdings to rebalance",
                "suggestions": []
            }
        
        # Calculate target allocation (equal weight for simplicity)
        num_holdings = len(allocation)
        target_weight = 100 / num_holdings if num_holdings > 0 else 0
        
        suggestions = []
        
        for asset in allocation:
            current_weight = asset['weight']
            drift = current_weight - target_weight
            
            if abs(drift) > RebalancingService.DRIFT_THRESHOLD * 100:
                holding = db.query(Holding).filter(
                    Holding.goal_id == goal_id,
                    Holding.stock_symbol == asset['symbol']
                ).first()
                
                if holding:
                    current_price = MarketDataService.get_current_price(asset['symbol'])
                    if current_price:
                        if drift > 0:
                            # Overweight - suggest selling
                            excess_value = (drift / 100) * sum(a['value'] for a in allocation)
                            shares = int(excess_value / current_price)
                            if shares > 0:
                                suggestions.append({
                                    "action": "SELL",
                                    "symbol": asset['symbol'],
                                    "quantity": shares,
                                    "current_weight": round(current_weight, 2),
                                    "target_weight": round(target_weight, 2),
                                    "drift": round(drift, 2)
                                })
                        else:
                            # Underweight - suggest buying
                            deficit_value = abs(drift / 100) * sum(a['value'] for a in allocation)
                            shares = int(deficit_value / current_price)
                            if shares > 0:
                                suggestions.append({
                                    "action": "BUY",
                                    "symbol": asset['symbol'],
                                    "quantity": shares,
                                    "current_weight": round(current_weight, 2),
                                    "target_weight": round(target_weight, 2),
                                    "drift": round(drift, 2)
                                })
        
        return {
            "status": "REBALANCE_SUGGESTED" if suggestions else "BALANCED",
            "target_strategy": "Equal Weight",
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

