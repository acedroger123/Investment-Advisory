"""
Portfolio Router - API endpoints for portfolio queries.
All portfolio data is scoped to individual goals.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from database.db import get_db
from database.models import Goal
from services.portfolio_service import PortfolioService

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


# ==========================================
# GOAL-SPECIFIC ENDPOINTS
# ==========================================

@router.get("/{goal_id}", response_model=dict)
async def get_portfolio(goal_id: int, db: Session = Depends(get_db)):
    """Get portfolio for a specific goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Compute holdings once and pass to all methods to avoid redundant yfinance calls
    holdings = PortfolioService.get_holdings(db, goal_id)
    portfolio = PortfolioService.calculate_portfolio_value(db, goal_id, holdings)
    allocation = PortfolioService.get_asset_allocation(db, goal_id, holdings)
    
    return {
        "goal_id": goal_id,
        "goal_name": goal.name,
        "summary": portfolio,
        "holdings": holdings,
        "allocation": allocation
    }


@router.get("/{goal_id}/holdings", response_model=List[dict])
async def get_holdings(goal_id: int, db: Session = Depends(get_db)):
    """Get current holdings for a specific goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return PortfolioService.get_holdings(db, goal_id)


@router.get("/{goal_id}/value", response_model=dict)
async def get_portfolio_value(goal_id: int, db: Session = Depends(get_db)):
    """Get current portfolio value and goal progress metrics."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return PortfolioService.calculate_portfolio_value(db, goal_id)


@router.get("/{goal_id}/allocation", response_model=List[dict])
async def get_allocation(goal_id: int, db: Session = Depends(get_db)):
    """Get asset allocation breakdown for a specific goal."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return PortfolioService.get_asset_allocation(db, goal_id)


@router.get("/{goal_id}/history", response_model=List[dict])
async def get_history(goal_id: int, days: int = 30, db: Session = Depends(get_db)):
    """Get portfolio value history for charting."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return PortfolioService.get_portfolio_history(db, goal_id, days)


@router.get("/{goal_id}/drawdown", response_model=dict)
async def get_drawdown(goal_id: int, days: int = 90, db: Session = Depends(get_db)):
    """Get drawdown metrics and data for risk visualization."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return PortfolioService.calculate_drawdown(db, goal_id, days)


@router.get("/{goal_id}/risk", response_model=dict)
async def get_risk_metrics(goal_id: int, db: Session = Depends(get_db)):
    """Get risk exposure metrics including volatility and Sharpe ratio."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return PortfolioService.calculate_risk_metrics(db, goal_id)


@router.get("/{goal_id}/performance", response_model=dict)
async def get_performance(goal_id: int, db: Session = Depends(get_db)):
    """Get portfolio performance metrics."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return PortfolioService.get_performance_metrics(db, goal_id)


@router.get("/{goal_id}/required-growth", response_model=dict)
async def get_required_growth(goal_id: int, db: Session = Depends(get_db)):
    """Get required vs actual growth data for dual-line chart."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    portfolio = PortfolioService.calculate_portfolio_value(db, goal_id)
    history = PortfolioService.get_portfolio_history(db, goal_id, 90)
    
    # Calculate required growth curve
    from datetime import date, timedelta
    
    if not goal.created_at or not goal.deadline:
        return {"error": "Goal dates not set"}
    
    start_date = goal.created_at.date()
    end_date = goal.deadline
    total_days = (end_date - start_date).days
    
    initial_value = 0
    if history:
        initial_value = history[0]['value'] if history else 0
    
    required_curve = []
    actual_curve = []
    
    # Build required growth curve
    current = start_date
    while current <= end_date:
        days_elapsed = (current - start_date).days
        progress = days_elapsed / total_days if total_days > 0 else 0
        required_value = initial_value + (goal.target_value - initial_value) * progress
        required_curve.append({
            "date": current.isoformat(),
            "value": round(required_value, 2)
        })
        current += timedelta(days=7)  # Weekly points
    
    # Add actual historical values
    for h in history:
        actual_curve.append(h)
    
    return {
        "goal_id": goal_id,
        "target_value": goal.target_value,
        "initial_value": initial_value,
        "current_value": portfolio.get('total_current_value', 0),
        "required_curve": required_curve,
        "actual_curve": actual_curve,
        "days_remaining": portfolio.get('days_remaining', 0),
        "annual_growth_needed": portfolio.get('annual_growth_needed', 0)
    }
