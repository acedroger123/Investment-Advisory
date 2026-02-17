"""
Transactions Router - API endpoints for stock transactions.
Transactions are scoped to individual goals (per-goal stock allocation).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from datetime import date
from typing import Optional, List

from portfolio_backend.database import get_db
from portfolio_backend.database.models import Transaction, Goal, Holding
from portfolio_backend.services.market_data import MarketDataService
from portfolio_backend.services.portfolio_service import PortfolioService

router = APIRouter(prefix="/transactions", tags=["Transactions"])


class TransactionCreate(BaseModel):
    """Schema for creating a transaction - goal_id is required."""
    goal_id: int
    stock_symbol: str = Field(..., min_length=1, max_length=20)
    transaction_type: str = Field(..., pattern="^(buy|sell|BUY|SELL)$")
    quantity: int = Field(..., gt=0)
    price: float = Field(..., gt=0)
    transaction_date: date
    notes: Optional[str] = None


class TransactionResponse(BaseModel):
    """Response schema for a transaction."""
    id: int
    goal_id: int
    stock_symbol: str
    stock_name: Optional[str]
    transaction_type: str
    quantity: int
    price: float
    total_value: float
    transaction_date: date
    validated: bool
    validation_message: Optional[str]
    created_at: str


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_transaction(txn: TransactionCreate, db: Session = Depends(get_db)):
    """Record a new stock transaction with price validation.
    
    Transactions are scoped to a specific goal.
    """
    # Validate goal exists
    goal = db.query(Goal).filter(Goal.id == txn.goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    
    # Normalize symbol and get stock info
    symbol = MarketDataService.normalize_symbol(txn.stock_symbol)
    stock_info = MarketDataService.get_stock_info(symbol)
    stock_name = stock_info.get('name', txn.stock_symbol) if stock_info else txn.stock_symbol
    
    # Validate transaction price
    is_valid, validation_message = MarketDataService.validate_transaction_price(
        symbol, txn.transaction_date, txn.price
    )
    
    # For SELL, check if we have enough shares in this goal's holdings
    if txn.transaction_type.upper() == "SELL":
        holding = db.query(Holding).filter(
            Holding.goal_id == txn.goal_id,
            Holding.stock_symbol == symbol
        ).first()
        
        if not holding or holding.quantity < txn.quantity:
            current_qty = holding.quantity if holding else 0
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient shares in this goal. You have {current_qty} shares of {symbol}"
            )
    
    # Create transaction record
    transaction = Transaction(
        goal_id=txn.goal_id,
        stock_symbol=symbol,
        stock_name=stock_name,
        transaction_type=txn.transaction_type.upper(),
        quantity=txn.quantity,
        price=txn.price,
        transaction_date=txn.transaction_date,
        validated=is_valid,
        validation_message=validation_message,
        notes=txn.notes
    )
    transaction.calculate_total_value()
    
    db.add(transaction)
    db.commit()
    
    # Update per-goal holdings
    PortfolioService.update_holding_on_transaction(
        db=db,
        goal_id=txn.goal_id,
        symbol=symbol,
        stock_name=stock_name,
        transaction_type=txn.transaction_type,
        quantity=txn.quantity,
        price=txn.price
    )
    
    db.refresh(transaction)
    
    return {
        "message": "Transaction recorded successfully",
        "transaction": {
            "id": transaction.id,
            "goal_id": transaction.goal_id,
            "symbol": transaction.stock_symbol,
            "type": transaction.transaction_type,
            "quantity": transaction.quantity,
            "price": transaction.price,
            "total_value": transaction.total_value,
            "validated": transaction.validated,
            "validation_message": transaction.validation_message
        },
        "warning": None if is_valid else "Price validation failed - transaction recorded but flagged"
    }


@router.get("", response_model=List[dict])
async def list_transactions(
    goal_id: Optional[int] = None,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List transactions, optionally filtered by goal."""
    query = db.query(Transaction)
    
    if goal_id:
        query = query.filter(Transaction.goal_id == goal_id)
    
    transactions = query.order_by(Transaction.transaction_date.desc()).limit(limit).all()
    
    return [
        {
            "id": t.id,
            "goal_id": t.goal_id,
            "symbol": t.stock_symbol,
            "name": t.stock_name,
            "type": t.transaction_type,
            "quantity": t.quantity,
            "price": t.price,
            "total_value": t.total_value,
            "date": t.transaction_date.isoformat(),
            "validated": t.validated,
            "notes": t.notes
        }
        for t in transactions
    ]


@router.get("/{transaction_id}", response_model=dict)
async def get_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Get transaction details."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return {
        "id": txn.id,
        "goal_id": txn.goal_id,
        "symbol": txn.stock_symbol,
        "name": txn.stock_name,
        "type": txn.transaction_type,
        "quantity": txn.quantity,
        "price": txn.price,
        "total_value": txn.total_value,
        "date": txn.transaction_date.isoformat(),
        "validated": txn.validated,
        "validation_message": txn.validation_message,
        "notes": txn.notes,
        "created_at": txn.created_at.isoformat() if txn.created_at else None
    }


@router.delete("/{transaction_id}", response_model=dict)
async def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    """Delete a transaction (for corrections only)."""
    txn = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # Reverse the per-goal holding effect
    holding = db.query(Holding).filter(
        Holding.goal_id == txn.goal_id,
        Holding.stock_symbol == txn.stock_symbol
    ).first()
    
    if holding:
        if txn.transaction_type.upper() == "BUY":
            # Reverse buy - reduce holdings
            holding.quantity -= txn.quantity
            if holding.quantity <= 0:
                db.delete(holding)
            else:
                holding.total_invested = holding.quantity * holding.avg_buy_price
        else:
            # Reverse sell - increase holdings back
            holding.quantity += txn.quantity
            holding.total_invested = holding.quantity * holding.avg_buy_price
    
    db.delete(txn)
    db.commit()
    
    return {"message": "Transaction deleted and holdings adjusted."}

