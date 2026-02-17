"""
Monte Carlo Simulation Service - Probabilistic goal achievement analysis.
"""
import numpy as np
import pandas as pd
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy.orm import Session

from portfolio_backend.database.models import Goal
from portfolio_backend.services.market_data import MarketDataService
from portfolio_backend.services.portfolio_service import PortfolioService
from portfolio_backend.config import settings


class MonteCarloService:
    """Service for running Monte Carlo simulations."""
    
    DEFAULT_SIMULATIONS = 1000
    TRADING_DAYS_PER_YEAR = 252
    
    @staticmethod
    def run_simulation(db: Session, goal_id: int, num_simulations: int = None) -> Dict:
        """Run Monte Carlo simulation for a goal."""
        if num_simulations is None:
            num_simulations = settings.MC_SIMULATIONS
        
        goal = db.query(Goal).filter(Goal.id == goal_id).first()
        if not goal:
            return {"error": "Goal not found"}
        
        portfolio = PortfolioService.calculate_portfolio_value(db, goal_id)
        holdings = PortfolioService.get_holdings(db, goal_id)
        
        if not holdings:
            return {"error": "No holdings in portfolio"}
        
        current_value = portfolio.get('total_current_value', 0)
        target_value = goal.target_value
        
        if current_value <= 0:
            return {"error": "Portfolio has no value"}
        
        days_to_deadline = (goal.deadline - date.today()).days
        if days_to_deadline <= 0:
            return {"error": "Goal deadline has passed"}
        
        # Default market parameters
        mu = 0.12 / MonteCarloService.TRADING_DAYS_PER_YEAR
        sigma = 0.20 / np.sqrt(MonteCarloService.TRADING_DAYS_PER_YEAR)
        
        # Run simulations
        final_values = []
        for _ in range(num_simulations):
            value = current_value
            for _ in range(days_to_deadline):
                daily_return = np.random.normal(mu, sigma)
                value = value * (1 + daily_return)
            final_values.append(max(0, value))
        
        success_count = sum(1 for v in final_values if v >= target_value)
        success_probability = success_count / num_simulations
        
        # Risk level
        if success_probability >= 0.80:
            risk_level = "LOW"
        elif success_probability >= 0.50:
            risk_level = "MODERATE"
        else:
            risk_level = "HIGH"
        
        # Histogram
        hist, bin_edges = np.histogram(final_values, bins=20)
        
        return {
            "goal_id": goal_id,
            "goal_name": goal.name,
            "num_simulations": num_simulations,
            "days_to_deadline": days_to_deadline,
            "current_value": round(current_value, 2),
            "target_value": round(target_value, 2),
            "success_probability": round(success_probability * 100, 2),
            "outcomes": {
                "worst_case": round(float(np.percentile(final_values, 5)), 2),
                "expected": round(float(np.percentile(final_values, 50)), 2),
                "best_case": round(float(np.percentile(final_values, 95)), 2)
            },
            "risk_level": risk_level,
            "histogram": {
                "counts": hist.tolist(),
                "bin_edges": [round(float(e), 2) for e in bin_edges]
            },
            "disclaimer": "This simulation is probabilistic. Past performance does not guarantee future results."
        }

