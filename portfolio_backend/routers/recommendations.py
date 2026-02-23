"""
Recommendations Router - Rebalancing and investment recommendations.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from portfolio_backend.database import get_db
from portfolio_backend.database.models import Goal, Alert, User
from portfolio_backend.auth import get_current_pg_user_id, get_goal_for_pg_user
from portfolio_backend.services.rebalancing import RebalancingService

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


@router.get("/{goal_id}", response_model=dict)
async def get_recommendations(
    goal_id: int,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Get portfolio analysis and recommendations."""
    goal = get_goal_for_pg_user(db, goal_id, pg_user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return RebalancingService.analyze_portfolio(db, goal_id)


@router.get("/{goal_id}/rebalance", response_model=dict)
async def get_rebalancing_suggestions(
    goal_id: int,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Get specific rebalancing suggestions."""
    goal = get_goal_for_pg_user(db, goal_id, pg_user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return RebalancingService.get_rebalancing_suggestions(db, goal_id)


@router.get("/{goal_id}/buy-suggestions", response_model=List[dict])
async def get_buy_suggestions(
    goal_id: int,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Get smart buy recommendations."""
    goal = get_goal_for_pg_user(db, goal_id, pg_user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    return RebalancingService.get_buy_recommendations(db, goal_id)


@router.get("/{goal_id}/alerts", response_model=List[dict])
async def get_alerts(
    goal_id: int,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Get alerts for a goal."""
    goal = get_goal_for_pg_user(db, goal_id, pg_user_id)
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    alerts = db.query(Alert).filter(
        Alert.goal_id == goal_id,
        Alert.is_read == False
    ).order_by(Alert.created_at.desc()).all()
    
    return [
        {
            "id": a.id,
            "type": a.alert_type,
            "title": a.title,
            "message": a.message,
            "severity": a.severity,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in alerts
    ]


@router.put("/alerts/{alert_id}/read", response_model=dict)
async def mark_alert_read(
    alert_id: int,
    pg_user_id: int = Depends(get_current_pg_user_id),
    db: Session = Depends(get_db)
):
    """Mark an alert as read."""
    alert = (
        db.query(Alert)
        .join(Goal, Alert.goal_id == Goal.id)
        .join(User, Goal.user_id == User.id)
        .filter(Alert.id == alert_id, User.pg_user_id == pg_user_id)
        .first()
    )
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert.is_read = True
    db.commit()
    
    return {"message": "Alert marked as read"}

