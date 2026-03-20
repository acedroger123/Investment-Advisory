"""
Monte Carlo Simulation Service - Probabilistic goal achievement analysis.

OPTIMIZED: Uses fully vectorized NumPy operations instead of nested Python loops.
This provides ~100x speedup for typical simulation sizes.
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
    
    DEFAULT_SIMULATIONS = 500  # Reduced from 1000 for faster initial load
    TRADING_DAYS_PER_YEAR = 252
    
    @staticmethod
    def run_simulation(db: Session, goal_id: int, num_simulations: int = None) -> Dict:
        """
        Run Monte Carlo simulation for a goal.
        
        OPTIMIZED: Uses vectorized NumPy operations for ~100x speedup.
        - Old: nested Python loops (O(simulations * days))
        - New: single NumPy matrix operation
        """
        if num_simulations is None:
            num_simulations = settings.MC_SIMULATIONS
        
        # Cap simulations for performance (can be increased for detailed analysis)
        num_simulations = min(num_simulations, 2000)
        
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
        
        # Risk-adjusted market parameters based on goal risk preference
        risk_params = {
            "low": {"annual_return": 0.10, "annual_volatility": 0.15},
            "moderate": {"annual_return": 0.14, "annual_volatility": 0.22},
            "high": {"annual_return": 0.20, "annual_volatility": 0.32},
        }
        risk_key = goal.risk_preference if goal.risk_preference in risk_params else "moderate"
        params = risk_params[risk_key]
        annual_return = params["annual_return"]
        annual_volatility = params["annual_volatility"]
        mu = annual_return / MonteCarloService.TRADING_DAYS_PER_YEAR
        sigma = annual_volatility / np.sqrt(MonteCarloService.TRADING_DAYS_PER_YEAR)
        
        # ═══════════════════════════════════════════════════════════════════
        # VECTORIZED SIMULATION (replaces nested Python loops)
        # ═══════════════════════════════════════════════════════════════════
        # Generate all random returns at once: shape (num_simulations, days_to_deadline)
        daily_returns = np.random.normal(mu, sigma, (num_simulations, days_to_deadline))
        
        # Convert returns to growth factors: 1 + return
        growth_factors = 1 + daily_returns
        
        # Compute cumulative product along the time axis (axis=1)
        # This gives us the final multiplier for each simulation
        cumulative_growth = np.prod(growth_factors, axis=1)
        
        # Calculate final portfolio values
        final_values = current_value * cumulative_growth
        
        # Ensure non-negative values
        final_values = np.maximum(final_values, 0)
        # ═══════════════════════════════════════════════════════════════════
        
        success_count = np.sum(final_values >= target_value)
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
            "risk_preference": goal.risk_preference,
            "assumed_annual_return": round(annual_return * 100, 1),
            "assumed_annual_volatility": round(annual_volatility * 100, 1),
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

