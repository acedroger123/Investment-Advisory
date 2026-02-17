"""
Portfolio Service - Handles portfolio calculations and tracking.
All portfolio data is scoped to individual goals (per-goal stock allocation).
"""
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from portfolio_backend.database.models import Goal, Transaction, Holding, TransactionType
from portfolio_backend.services.market_data import MarketDataService


class PortfolioService:
    """Service for portfolio management and calculations."""
    
    # ==========================================
    # PER-GOAL PORTFOLIO METHODS
    # ==========================================
    
    @staticmethod
    def get_holdings(db: Session, goal_id: int) -> List[Dict]:
        """Get all holdings for a specific goal with current values.
        Uses batch price fetching to avoid per-stock API calls."""
        holdings = db.query(Holding).filter(
            Holding.goal_id == goal_id,
            Holding.quantity > 0
        ).all()
        
        if not holdings:
            return []
        
        # Batch fetch all prices at once (single yfinance call)
        symbols = [h.stock_symbol for h in holdings]
        prices = MarketDataService.get_multiple_current_prices(symbols)
        
        result = []
        for holding in holdings:
            current_price = prices.get(holding.stock_symbol)
            current_value = holding.quantity * current_price if current_price else 0
            unrealized_pnl = current_value - holding.total_invested if current_price else 0
            unrealized_pnl_pct = (unrealized_pnl / holding.total_invested * 100) if holding.total_invested > 0 else 0
            
            result.append({
                "id": holding.id,
                "symbol": holding.stock_symbol,
                "name": holding.stock_name or holding.stock_symbol,
                "quantity": holding.quantity,
                "avg_buy_price": round(holding.avg_buy_price, 2),
                "total_invested": round(holding.total_invested, 2),
                "current_price": round(current_price, 2) if current_price else None,
                "current_value": round(current_value, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
                "unrealized_pnl_pct": round(unrealized_pnl_pct, 2),
                "last_updated": holding.last_updated.isoformat() if holding.last_updated else None
            })
        
        return result
    
    @staticmethod
    def calculate_portfolio_value(db: Session, goal_id: int, holdings: List[Dict] = None) -> Dict:
        """Calculate total portfolio value and metrics for a specific goal.
        Accepts optional precomputed holdings to avoid redundant calls."""
        if holdings is None:
            holdings = PortfolioService.get_holdings(db, goal_id)
        
        goal = db.query(Goal).filter(Goal.id == goal_id).first()
        
        if not goal:
            return {"error": "Goal not found"}
        
        total_invested = sum(h['total_invested'] for h in holdings)
        total_current_value = sum(h['current_value'] for h in holdings if h['current_value'])
        total_unrealized_pnl = sum(h['unrealized_pnl'] for h in holdings if h['unrealized_pnl'])
        
        # Calculate realized P&L from SELL transactions for this goal
        sell_transactions = db.query(Transaction).filter(
            Transaction.goal_id == goal_id,
            Transaction.transaction_type == 'SELL'
        ).all()
        
        realized_pnl = 0
        for txn in sell_transactions:
            holding = db.query(Holding).filter(
                Holding.goal_id == goal_id,
                Holding.stock_symbol == txn.stock_symbol
            ).first()
            if holding:
                cost_basis = txn.quantity * holding.avg_buy_price
                sale_value = txn.total_value
                realized_pnl += (sale_value - cost_basis) if sale_value else 0
        
        total_pnl = total_unrealized_pnl + realized_pnl
        pnl_percentage = (total_unrealized_pnl / total_invested * 100) if total_invested > 0 else 0
        
        # Goal progress
        progress_percentage = (total_current_value / goal.target_value * 100) if goal.target_value > 0 else 0
        days_remaining = (goal.deadline - date.today()).days if goal.deadline else 0
        
        # Calculate required growth rate
        if days_remaining > 0 and total_current_value > 0:
            amount_needed = goal.target_value - total_current_value
            daily_growth_needed = (amount_needed / days_remaining) if days_remaining > 0 else 0
            annual_growth_needed = ((goal.target_value / total_current_value) ** (365 / days_remaining) - 1) * 100 if total_current_value > 0 else 0
        else:
            daily_growth_needed = 0
            annual_growth_needed = 0
        
        return {
            "goal_id": goal_id,
            "goal_name": goal.name,
            "target_amount": round(goal.target_amount, 2),
            "target_value": round(goal.target_value, 2),
            "profit_buffer": goal.profit_buffer,
            "deadline": goal.deadline.isoformat() if goal.deadline else None,
            "days_remaining": max(0, days_remaining),
            "total_invested": round(total_invested, 2),
            "total_current_value": round(total_current_value, 2),
            "total_unrealized_pnl": round(total_unrealized_pnl, 2),
            "total_realized_pnl": round(realized_pnl, 2),
            "total_pnl": round(total_pnl, 2),
            "pnl_percentage": round(pnl_percentage, 2),
            "progress_percentage": round(min(progress_percentage, 100), 2),
            "amount_remaining": round(max(0, goal.target_value - total_current_value), 2),
            "daily_growth_needed": round(daily_growth_needed, 2),
            "annual_growth_needed": round(annual_growth_needed, 2),
            "holdings_count": len(holdings),
            "status": goal.status
        }
    
    @staticmethod
    def get_asset_allocation(db: Session, goal_id: int, holdings: List[Dict] = None) -> List[Dict]:
        """Get asset allocation breakdown for a specific goal.
        Accepts optional precomputed holdings to avoid redundant calls."""
        if holdings is None:
            holdings = PortfolioService.get_holdings(db, goal_id)
        
        if not holdings:
            return []
        
        total_value = sum(h['current_value'] for h in holdings if h['current_value'])
        
        if total_value <= 0:
            return []
        
        allocation = []
        for holding in holdings:
            if holding['current_value']:
                weight = (holding['current_value'] / total_value) * 100
                allocation.append({
                    "symbol": holding['symbol'],
                    "name": holding['name'],
                    "value": holding['current_value'],
                    "weight": round(weight, 2)
                })
        
        allocation.sort(key=lambda x: x['weight'], reverse=True)
        return allocation
    
    @staticmethod
    def update_holding_on_transaction(
        db: Session,
        goal_id: int,
        symbol: str,
        stock_name: str,
        transaction_type: str,
        quantity: int,
        price: float
    ) -> Holding:
        """Update or create a per-goal holding based on a transaction."""
        holding = db.query(Holding).filter(
            Holding.goal_id == goal_id,
            Holding.stock_symbol == symbol
        ).first()
        
        if transaction_type.upper() == "BUY":
            if holding:
                # Calculate new average price
                old_total = holding.quantity * holding.avg_buy_price
                new_total = old_total + (quantity * price)
                holding.quantity += quantity
                holding.avg_buy_price = new_total / holding.quantity if holding.quantity > 0 else 0
                holding.total_invested = new_total
            else:
                # Create new holding
                holding = Holding(
                    goal_id=goal_id,
                    stock_symbol=symbol,
                    stock_name=stock_name,
                    quantity=quantity,
                    avg_buy_price=price,
                    total_invested=quantity * price
                )
                db.add(holding)
        else:  # SELL
            if holding:
                holding.quantity -= quantity
                if holding.quantity <= 0:
                    db.delete(holding)
                else:
                    holding.total_invested = holding.quantity * holding.avg_buy_price
        
        db.commit()
        return holding
    
    @staticmethod
    def get_portfolio_history(db: Session, goal_id: int, days: int = 30) -> List[Dict]:
        """Get portfolio value history for a specific goal.
        Optimized: fetches each stock's full date range once instead of per-day calls."""
        transactions = db.query(Transaction).filter(
            Transaction.goal_id == goal_id
        ).order_by(
            Transaction.transaction_date.asc()
        ).all()
        
        if not transactions:
            return []
        
        start_date = date.today() - timedelta(days=days)
        end_date = date.today()
        
        # Build holdings state at each date from transactions
        holdings_tracker = {}
        
        # Pre-apply all transactions up to start_date
        for txn in transactions:
            if txn.transaction_date <= start_date:
                if txn.stock_symbol not in holdings_tracker:
                    holdings_tracker[txn.stock_symbol] = {"quantity": 0, "avg_price": 0}
                
                h = holdings_tracker[txn.stock_symbol]
                if txn.transaction_type.upper() == "BUY":
                    total_cost = (h["quantity"] * h["avg_price"]) + (txn.quantity * txn.price)
                    new_qty = h["quantity"] + txn.quantity
                    h["quantity"] = new_qty
                    h["avg_price"] = total_cost / new_qty if new_qty > 0 else 0
                else:
                    h["quantity"] = max(0, h["quantity"] - txn.quantity)
        
        # Get remaining transactions (after start_date)
        remaining_txns = [t for t in transactions if t.transaction_date > start_date]
        
        # Collect all symbols that will have holdings during this period
        all_symbols = set(holdings_tracker.keys())
        for txn in remaining_txns:
            all_symbols.add(txn.stock_symbol)
        
        if not all_symbols:
            return []
        
        # OPTIMIZATION: Fetch historical data for ALL symbols in one batch call per symbol
        # (each call covers the full date range instead of per-day)
        symbol_history = {}
        for symbol in all_symbols:
            hist = MarketDataService.get_historical_data(symbol, start_date, end_date)
            if not hist.empty:
                # Build a date->close price lookup dict for fast access
                price_lookup = {}
                for _, row in hist.iterrows():
                    price_lookup[row['Date']] = float(row['Close'])
                symbol_history[symbol] = price_lookup
        
        # Now iterate day by day using the pre-fetched data
        history = []
        current_date = start_date
        txn_idx = 0
        
        while current_date <= end_date:
            # Apply any transactions on this date
            while txn_idx < len(remaining_txns) and remaining_txns[txn_idx].transaction_date <= current_date:
                txn = remaining_txns[txn_idx]
                if txn.stock_symbol not in holdings_tracker:
                    holdings_tracker[txn.stock_symbol] = {"quantity": 0, "avg_price": 0}
                
                h = holdings_tracker[txn.stock_symbol]
                if txn.transaction_type.upper() == "BUY":
                    total_cost = (h["quantity"] * h["avg_price"]) + (txn.quantity * txn.price)
                    new_qty = h["quantity"] + txn.quantity
                    h["quantity"] = new_qty
                    h["avg_price"] = total_cost / new_qty if new_qty > 0 else 0
                else:
                    h["quantity"] = max(0, h["quantity"] - txn.quantity)
                txn_idx += 1
            
            # Calculate total value from pre-fetched data
            total_value = 0
            for symbol, h in holdings_tracker.items():
                if h["quantity"] > 0 and symbol in symbol_history:
                    lookup = symbol_history[symbol]
                    # Find closest available date (for weekends/holidays)
                    price = lookup.get(current_date)
                    if price is None:
                        # Look backwards up to 5 days for nearest trading day
                        for delta in range(1, 6):
                            check_date = current_date - timedelta(days=delta)
                            price = lookup.get(check_date)
                            if price is not None:
                                break
                    if price is not None:
                        total_value += h["quantity"] * price
            
            if total_value > 0:
                history.append({
                    "date": current_date.isoformat(),
                    "value": round(total_value, 2)
                })
            
            current_date += timedelta(days=1)
        
        return history
    
    @staticmethod
    def calculate_drawdown(db: Session, goal_id: int, days: int = 90, history: List[Dict] = None) -> Dict:
        """Calculate portfolio drawdown metrics for a specific goal.
        Accepts optional precomputed history to avoid redundant calls."""
        if history is None:
            history = PortfolioService.get_portfolio_history(db, goal_id, days)
        
        if not history or len(history) < 2:
            return {
                "max_drawdown": 0,
                "current_drawdown": 0,
                "peak_value": 0,
                "trough_value": 0,
                "drawdown_data": []
            }
        
        peak = history[0]['value']
        drawdowns = []
        max_drawdown = 0
        peak_value = history[0]['value']
        trough_value = history[0]['value']
        
        for point in history:
            value = point['value']
            if value > peak:
                peak = value
            
            drawdown = ((peak - value) / peak) * 100 if peak > 0 else 0
            drawdowns.append({
                "date": point['date'],
                "drawdown": round(drawdown, 2)
            })
            
            if drawdown > max_drawdown:
                max_drawdown = drawdown
                trough_value = value
                peak_value = peak
        
        current_value = history[-1]['value'] if history else 0
        current_peak = max(h['value'] for h in history)
        current_drawdown = ((current_peak - current_value) / current_peak * 100) if current_peak > 0 else 0
        
        return {
            "max_drawdown": round(max_drawdown, 2),
            "current_drawdown": round(current_drawdown, 2),
            "peak_value": round(peak_value, 2),
            "trough_value": round(trough_value, 2),
            "drawdown_data": drawdowns
        }
    
    @staticmethod
    def calculate_risk_metrics(db: Session, goal_id: int, history: List[Dict] = None, allocation: List[Dict] = None) -> Dict:
        """Calculate various risk metrics for a specific goal's portfolio.
        Accepts optional precomputed history and allocation to avoid redundant calls."""
        if history is None:
            history = PortfolioService.get_portfolio_history(db, goal_id, 90)
        if allocation is None:
            allocation = PortfolioService.get_asset_allocation(db, goal_id)
        
        if not history or len(history) < 2:
            return {
                "volatility": 0,
                "sharpe_ratio": 0,
                "concentration_score": 0,
                "diversification_score": 0,
                "risk_level": "N/A"
            }
        
        # Calculate daily returns
        import numpy as np
        values = [h['value'] for h in history]
        returns = np.diff(values) / values[:-1] * 100
        
        # Volatility (annualized std deviation)
        daily_volatility = np.std(returns)
        annualized_volatility = daily_volatility * np.sqrt(252)
        
        # Sharpe ratio (assuming 5% risk-free rate)
        avg_return = np.mean(returns)
        annualized_return = avg_return * 252
        risk_free_rate = 5
        sharpe_ratio = (annualized_return - risk_free_rate) / annualized_volatility if annualized_volatility > 0 else 0
        
        # Concentration (HHI)
        weights = [a['weight'] / 100 for a in allocation] if allocation else []
        hhi = sum(w ** 2 for w in weights) * 100 if weights else 0
        diversity = (1 - hhi / 100) * 100 if weights else 0
        
        # Risk level
        if annualized_volatility > 30:
            risk_level = "HIGH"
        elif annualized_volatility > 15:
            risk_level = "MODERATE"
        else:
            risk_level = "LOW"
        
        return {
            "volatility": round(annualized_volatility, 2),
            "daily_volatility": round(daily_volatility, 2),
            "sharpe_ratio": round(sharpe_ratio, 2),
            "concentration_score": round(hhi, 2),
            "diversification_score": round(diversity, 2),
            "risk_level": risk_level,
            "avg_daily_return": round(avg_return, 4),
            "annualized_return": round(annualized_return, 2)
        }
    
    @staticmethod
    def get_performance_metrics(db: Session, goal_id: int, holdings: List[Dict] = None) -> Dict:
        """Calculate various performance metrics for a goal's portfolio.
        Accepts optional precomputed holdings to avoid redundant calls."""
        if holdings is None:
            holdings = PortfolioService.get_holdings(db, goal_id)
        
        portfolio = PortfolioService.calculate_portfolio_value(db, goal_id, holdings)
        allocation = PortfolioService.get_asset_allocation(db, goal_id, holdings)
        risk = PortfolioService.calculate_risk_metrics(db, goal_id, allocation=allocation)
        
        if not allocation:
            return {
                "diversification_score": 0,
                "concentration_risk": "N/A",
                "top_holding_weight": 0,
                "goal_on_track": False,
                "volatility": 0,
                "sharpe_ratio": 0
            }
        
        # Calculate diversification score (1 - HHI)
        weights = [a['weight'] / 100 for a in allocation]
        hhi = sum(w ** 2 for w in weights)
        diversification_score = round((1 - hhi) * 100, 2)
        
        # Concentration risk
        top_weight = allocation[0]['weight'] if allocation else 0
        if top_weight > 50:
            concentration_risk = "HIGH"
        elif top_weight > 30:
            concentration_risk = "MODERATE"
        else:
            concentration_risk = "LOW"
        
        # Check if on track for goal
        goal = db.query(Goal).filter(Goal.id == goal_id).first()
        days_elapsed = (date.today() - goal.created_at.date()).days if goal and goal.created_at else 0
        total_days = (goal.deadline - goal.created_at.date()).days if goal and goal.deadline and goal.created_at else 1
        expected_progress = (days_elapsed / total_days) * 100 if total_days > 0 else 0
        actual_progress = portfolio.get('progress_percentage', 0)
        
        on_track = actual_progress >= expected_progress * 0.9
        
        return {
            "diversification_score": diversification_score,
            "concentration_risk": concentration_risk,
            "top_holding_weight": top_weight,
            "expected_progress": round(expected_progress, 2),
            "actual_progress": actual_progress,
            "goal_on_track": on_track,
            "holdings_count": len(allocation),
            "volatility": risk['volatility'],
            "sharpe_ratio": risk['sharpe_ratio'],
            "risk_level": risk['risk_level']
        }

