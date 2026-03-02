"""
Stocks Router - API endpoints for stock data.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional, List

from database.db import get_db
from services.market_data import MarketDataService

router = APIRouter(prefix="/stocks", tags=["Stocks"])


@router.get("/search", response_model=List[dict])
async def search_stocks(q: str = Query(..., min_length=1), limit: int = 10):
    """Search for stocks by symbol or name."""
    results = MarketDataService.search_stocks(q, limit)
    return results


@router.get("/{symbol}/info", response_model=dict)
async def get_stock_info(symbol: str):
    """Get detailed stock information."""
    normalized = MarketDataService.normalize_symbol(symbol)
    info = MarketDataService.get_stock_info(normalized)
    
    if not info:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")
    
    return info


@router.get("/{symbol}/price", response_model=dict)
async def get_current_price(symbol: str):
    """Get current stock price."""
    normalized = MarketDataService.normalize_symbol(symbol)
    price = MarketDataService.get_current_price(normalized)
    
    if price is None:
        raise HTTPException(status_code=404, detail=f"Could not fetch price for {symbol}")
    
    return {
        "symbol": normalized,
        "price": round(price, 2),
        "currency": "INR"
    }


@router.get("/{symbol}/history", response_model=dict)
async def get_price_history(
    symbol: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    """Get historical OHLC data."""
    normalized = MarketDataService.normalize_symbol(symbol)
    
    if not start_date:
        from datetime import timedelta
        start_date = date.today() - timedelta(days=30)
    
    if not end_date:
        end_date = date.today()
    
    data = MarketDataService.get_historical_data(normalized, start_date, end_date)
    
    if data.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")
    
    return {
        "symbol": normalized,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "data": data.to_dict('records')
    }


@router.get("/validate", response_model=dict)
async def validate_price(
    symbol: str,
    transaction_date: date,
    price: float
):
    """Validate a transaction price against historical data."""
    normalized = MarketDataService.normalize_symbol(symbol)
    is_valid, message = MarketDataService.validate_transaction_price(
        normalized, transaction_date, price
    )
    
    return {
        "symbol": normalized,
        "date": transaction_date.isoformat(),
        "entered_price": price,
        "is_valid": is_valid,
        "message": message
    }
