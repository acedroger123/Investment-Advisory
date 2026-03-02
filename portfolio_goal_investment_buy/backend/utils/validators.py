"""
Validators for transactions and goals.
"""
from datetime import date
from typing import Tuple

from services.market_data import MarketDataService


def validate_transaction(
    symbol: str,
    transaction_date: date,
    price: float,
    quantity: int,
    transaction_type: str
) -> Tuple[bool, str]:
    """Validate a stock transaction."""
    errors = []
    
    # Basic validations
    if not symbol or len(symbol) < 1:
        errors.append("Stock symbol is required")
    
    if quantity <= 0:
        errors.append("Quantity must be positive")
    
    if price <= 0:
        errors.append("Price must be positive")
    
    if transaction_type.upper() not in ["BUY", "SELL"]:
        errors.append("Transaction type must be BUY or SELL")
    
    if transaction_date > date.today():
        errors.append("Transaction date cannot be in the future")
    
    if errors:
        return False, "; ".join(errors)
    
    # Validate price against historical data
    is_valid, message = MarketDataService.validate_transaction_price(
        symbol, transaction_date, price
    )
    
    return is_valid, message


def validate_goal(
    name: str,
    target_amount: float,
    deadline: date,
    risk_preference: str
) -> Tuple[bool, str]:
    """Validate goal parameters."""
    errors = []
    
    if not name or len(name) < 2:
        errors.append("Goal name must be at least 2 characters")
    
    if target_amount <= 0:
        errors.append("Target amount must be positive")
    
    if deadline <= date.today():
        errors.append("Deadline must be in the future")
    
    if risk_preference.lower() not in ["low", "moderate", "high"]:
        errors.append("Risk preference must be low, moderate, or high")
    
    if errors:
        return False, "; ".join(errors)
    
    return True, "Goal is valid"
