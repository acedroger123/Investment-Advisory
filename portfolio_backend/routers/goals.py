"""
Goals Router - API endpoints for goal management.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from datetime import date
from typing import Optional, List

from portfolio_backend.database import get_db
from portfolio_backend.database.models import Goal
from portfolio_backend.auth import (
    get_current_pg_user_id,
    get_or_create_pa_user,
    get_goal_for_pg_user
)
from portfolio_backend.services.portfolio_service import PortfolioService
from portfolio_backend.services.goal_feasibility import check_feasibility

router = APIRouter(prefix="/goals", tags=["Goals"])


class GoalCreate(BaseModel):
    """Schema for creating a goal."""
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None
    target_amount: float = Field(..., gt=0)
    profit_buffer: float = Field(default=0.10, ge=0, le=0.5)
    deadline: date
    risk_preference: str = Field(default="moderate", pattern="^(low|moderate|high)$")
    initial_investment: float = Field(default=0, ge=0)


class FeasibilityCheck(BaseModel):
    """Schema for feasibility check endpoint."""
    target_amount: float = Field(..., gt=0)
    profit_buffer: float = Field(default=0.10, ge=0, le=0.5)
    deadline: date
    risk_preference: str = Field(default="moderate", pattern="^(low|moderate|high)$")


class GoalUpdate(BaseModel):
    """Schema for updating a goal."""
    name: Optional[str] = None
    description: Optional[str] = None
    target_amount: Optional[float] = None
    profit_buffer: Optional[float] = None
    deadline: Optional[date] = None
    risk_preference: Optional[str] = None
    status: Optional[str] = None


class GoalResponse(BaseModel):
    """Response schema for a goal."""
    id: int
    name: str
    description: Optional[str]
    target_amount: float
    profit_buffer: float
    target_value: float
    deadline: date
    risk_preference: str
    status: str
    created_at: str
    
    class Config:
        from_attributes = True


@router.post("/check-feasibility", response_model=dict)
async def check_goal_feasibility(
    data: FeasibilityCheck,
    pg_user_id: int = Depends(get_current_pg_user_id)
):
    """Check whether a goal setup is feasible before saving."""
    if data.deadline <= date.today():
        raise HTTPException(
            status_code=400,
            detail="Deadline must be in the future"
        )

    return check_feasibility(
        target_amount=data.target_amount,
        profit_buffer=data.profit_buffer,
        deadline=data.deadline,
        risk_preference=data.risk_preference,
    )


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_goal(
    goal: GoalCreate,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Create a new financial goal."""
    user = get_or_create_pa_user(db, pg_user_id)
    
    # Validate deadline
    if goal.deadline <= date.today():
        raise HTTPException(
            status_code=400,
            detail="Deadline must be in the future"
        )
    
    # Create goal
    db_goal = Goal(
        user_id=user.id,
        name=goal.name,
        description=goal.description,
        target_amount=goal.target_amount,
        profit_buffer=goal.profit_buffer,
        deadline=goal.deadline,
        risk_preference=goal.risk_preference,
        initial_investment=goal.initial_investment
    )
    db_goal.calculate_target_value()
    
    db.add(db_goal)
    db.commit()
    db.refresh(db_goal)

    feasibility = check_feasibility(
        target_amount=goal.target_amount,
        profit_buffer=goal.profit_buffer,
        deadline=goal.deadline,
        risk_preference=goal.risk_preference,
    )
    
    return {
        "message": "Goal created successfully",
        "goal": {
            "id": db_goal.id,
            "name": db_goal.name,
            "target_amount": db_goal.target_amount,
            "target_value": db_goal.target_value,
            "deadline": db_goal.deadline.isoformat(),
            "risk_preference": db_goal.risk_preference
        },
        "feasibility": feasibility,
    }


@router.get("", response_model=List[dict])
async def list_goals(
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """List all goals with progress."""
    user = get_or_create_pa_user(db, pg_user_id)
    goals = db.query(Goal).filter(Goal.user_id == user.id).all()
    
    result = []
    for goal in goals:
        portfolio = PortfolioService.calculate_portfolio_value(db, goal.id)
        result.append({
            "id": goal.id,
            "name": goal.name,
            "target_amount": goal.target_amount,
            "target_value": goal.target_value,
            "deadline": goal.deadline.isoformat(),
            "risk_preference": goal.risk_preference,
            "status": goal.status,
            "progress": portfolio.get('progress_percentage', 0),
            "current_value": portfolio.get('total_current_value', 0),
            "days_remaining": portfolio.get('days_remaining', 0)
        })
    
    return result


@router.get("/{goal_id}", response_model=dict)
async def get_goal(
    goal_id: int,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Get goal details with full portfolio information."""
    goal = get_goal_for_pg_user(db, goal_id, pg_user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    portfolio = PortfolioService.calculate_portfolio_value(db, goal_id)
    
    return {
        "id": goal.id,
        "name": goal.name,
        "description": goal.description,
        "target_amount": goal.target_amount,
        "profit_buffer": goal.profit_buffer,
        "target_value": goal.target_value,
        "deadline": goal.deadline.isoformat(),
        "risk_preference": goal.risk_preference,
        "status": goal.status,
        "created_at": goal.created_at.isoformat() if goal.created_at else None,
        "portfolio": portfolio
    }


@router.put("/{goal_id}", response_model=dict)
async def update_goal(
    goal_id: int,
    goal_update: GoalUpdate,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Update goal parameters."""
    goal = get_goal_for_pg_user(db, goal_id, pg_user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Update fields
    if goal_update.name is not None:
        goal.name = goal_update.name
    if goal_update.description is not None:
        goal.description = goal_update.description
    if goal_update.target_amount is not None:
        goal.target_amount = goal_update.target_amount
    if goal_update.profit_buffer is not None:
        goal.profit_buffer = goal_update.profit_buffer
    if goal_update.deadline is not None:
        goal.deadline = goal_update.deadline
    if goal_update.risk_preference is not None:
        goal.risk_preference = goal_update.risk_preference
    if goal_update.status is not None:
        goal.status = goal_update.status
    
    # Recalculate target value
    goal.calculate_target_value()
    
    db.commit()
    db.refresh(goal)
    
    return {"message": "Goal updated successfully", "goal_id": goal.id}


@router.delete("/{goal_id}", response_model=dict)
async def delete_goal(
    goal_id: int,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Delete a goal."""
    goal = get_goal_for_pg_user(db, goal_id, pg_user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    db.delete(goal)
    db.commit()
    
    return {"message": "Goal deleted successfully"}

