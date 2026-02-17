"""
Simulation Router - Monte Carlo and stress testing endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from portfolio_backend.database import get_db
from portfolio_backend.database.models import Goal
from portfolio_backend.services.monte_carlo import MonteCarloService
from portfolio_backend.services.stress_testing import StressTestingService

router = APIRouter(prefix="/simulation", tags=["Simulation"])


class SimulationParams(BaseModel):
    """Parameters for Monte Carlo simulation."""
    num_simulations: int = 1000


@router.post("/{goal_id}/monte-carlo", response_model=dict)
async def run_monte_carlo(
    goal_id: int,
    params: Optional[SimulationParams] = None,
    db: Session = Depends(get_db)
):
    """Run Monte Carlo simulation for goal achievement probability."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    num_sims = params.num_simulations if params else 1000
    result = MonteCarloService.run_simulation(db, goal_id, num_sims)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result


@router.post("/{goal_id}/stress-test", response_model=dict)
async def run_stress_test(goal_id: int, db: Session = Depends(get_db)):
    """Run stress test scenarios on portfolio."""
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    result = StressTestingService.run_stress_test(db, goal_id)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return result

