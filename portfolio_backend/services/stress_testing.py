"""
Stress Testing Service - Simulates adverse market scenarios.
"""
from datetime import date
from typing import Dict, List
from sqlalchemy.orm import Session

from portfolio_backend.database.models import Goal
from portfolio_backend.services.portfolio_service import PortfolioService


class StressTestingService:
    """Service for stress testing portfolio under adverse scenarios."""
    
    SCENARIOS = {
        "mild_correction": {"drop": 0.10, "name": "10% Market Drop"},
        "major_correction": {"drop": 0.20, "name": "20% Market Drop"},
        "crash": {"drop": 0.35, "name": "35% Market Crash"},
    }
    
    @staticmethod
    def run_stress_test(db: Session, goal_id: int) -> Dict:
        """Run stress tests for all predefined scenarios."""
        goal = db.query(Goal).filter(Goal.id == goal_id).first()
        if not goal:
            return {"error": "Goal not found"}
        
        portfolio = PortfolioService.calculate_portfolio_value(db, goal_id)
        current_value = portfolio.get('total_current_value', 0)
        target_value = goal.target_value
        days_remaining = portfolio.get('days_remaining', 0)
        
        if current_value <= 0:
            return {"error": "No portfolio value"}
        
        results = []
        for scenario_id, scenario in StressTestingService.SCENARIOS.items():
            stressed_value = current_value * (1 - scenario['drop'])
            loss = current_value - stressed_value
            new_progress = (stressed_value / target_value) * 100 if target_value > 0 else 0
            gap = target_value - stressed_value
            
            # Estimate additional days needed
            if days_remaining > 0 and current_value > 0:
                daily_growth = (target_value / current_value) ** (1/days_remaining) - 1
                if daily_growth > 0:
                    new_days = int((target_value / stressed_value) ** (1/daily_growth) if daily_growth else 0)
                    delay = max(0, new_days - days_remaining)
                else:
                    delay = 0
            else:
                delay = 0
            
            results.append({
                "scenario": scenario['name'],
                "drop_percentage": scenario['drop'] * 100,
                "original_value": round(current_value, 2),
                "stressed_value": round(stressed_value, 2),
                "loss": round(loss, 2),
                "new_progress": round(new_progress, 2),
                "gap_to_goal": round(gap, 2),
                "estimated_delay_days": delay
            })
        
        return {
            "goal_id": goal_id,
            "goal_name": goal.name,
            "current_portfolio_value": round(current_value, 2),
            "target_value": round(target_value, 2),
            "days_remaining": days_remaining,
            "stress_test_results": results,
            "recommendation": StressTestingService._get_recommendation(results, goal.risk_preference)
        }
    
    @staticmethod
    def _get_recommendation(results: List[Dict], risk_preference: str) -> str:
        """Generate recommendation based on stress test results."""
        major_drop = next((r for r in results if r['drop_percentage'] == 20), None)
        
        if not major_drop:
            return "Unable to generate recommendation"
        
        if major_drop['new_progress'] >= 80:
            return "Portfolio is resilient. Even a 20% drop keeps you on track."
        elif major_drop['new_progress'] >= 50:
            if risk_preference == "low":
                return "Consider reducing equity exposure to protect gains."
            return "Portfolio has moderate resilience. Monitor market conditions."
        else:
            return "High vulnerability to market drops. Consider diversification or extending timeline."

