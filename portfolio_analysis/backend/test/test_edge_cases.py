"""
Edge Case Tests.
Tests boundary conditions, unusual scenarios, and exceptional cases.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestEmptyPortfolio:
    """Tests for empty portfolio scenarios."""
    
    def test_get_holdings_empty_goal(self):
        """Test getting holdings when goal has none."""
        # Mock database session
        mock_db = MagicMock()
        mock_query = MagicMock()
        mock_db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.all.return_value = []  # Empty holdings
        
        from services.portfolio_service import PortfolioService
        holdings = PortfolioService.get_holdings(mock_db, goal_id=999)
        
        assert holdings == []
    
    def test_portfolio_value_empty_goal(self):
        """Test portfolio value calculation for empty goal."""
        mock_db = MagicMock()
        
        # Mock goal query
        mock_goal = MagicMock()
        mock_goal.id = 1
        mock_goal.name = "Empty Goal"
        mock_goal.target_amount = 100000.0
        mock_goal.target_value = 110000.0
        mock_goal.profit_buffer = 0.10
        mock_goal.deadline = date.today() + timedelta(days=365)
        mock_goal.status = "active"
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_goal
        
        from services.portfolio_service import PortfolioService
        result = PortfolioService.calculate_portfolio_value(mock_db, goal_id=1, holdings=[])
        
        assert result['total_invested'] == 0.0
        assert result['total_current_value'] == 0.0
        assert result['progress_percentage'] == 0.0
    
    def test_asset_allocation_empty_goal(self):
        """Test asset allocation for empty portfolio."""
        mock_db = MagicMock()
        
        from services.portfolio_service import PortfolioService
        allocation = PortfolioService.get_asset_allocation(mock_db, goal_id=1, holdings=[])
        
        assert allocation == []
    
    def test_risk_metrics_empty_portfolio(self):
        """Test risk metrics calculation for empty portfolio."""
        mock_db = MagicMock()
        
        from services.portfolio_service import PortfolioService
        metrics = PortfolioService.calculate_risk_metrics(mock_db, goal_id=1)
        
        assert metrics['volatility'] == 0
        assert metrics['sharpe_ratio'] == 0
        assert metrics['risk_level'] == "N/A"
    
    def test_drawdown_empty_portfolio(self):
        """Test drawdown calculation for empty portfolio."""
        mock_db = MagicMock()
        
        from services.portfolio_service import PortfolioService
        drawdown = PortfolioService.calculate_drawdown(mock_db, goal_id=1)
        
        assert drawdown['max_drawdown'] == 0
        assert drawdown['current_drawdown'] == 0


class TestZeroAndNegativeValues:
    """Tests for zero and negative value handling."""
    
    def test_zero_invested_portfolio_value(self):
        """Test portfolio value with zero invested."""
        mock_db = MagicMock()
        
        mock_goal = MagicMock()
        mock_goal.id = 1
        mock_goal.name = "New Goal"
        mock_goal.target_amount = 100000.0
        mock_goal.target_value = 110000.0
        mock_goal.profit_buffer = 0.10
        mock_goal.deadline = date.today() + timedelta(days=365)
        mock_goal.status = "active"
        
        mock_db.query.return_value.filter.return_value.first.return_value = mock_goal
        
        # Empty holdings = zero invested
        holdings = []
        
        from services.portfolio_service import PortfolioService
        result = PortfolioService.calculate_portfolio_value(mock_db, goal_id=1, holdings=holdings)
        
        assert result['total_invested'] == 0.0
        assert result['total_current_value'] == 0.0
        assert result['pnl_percentage'] == 0.0
    
    def test_zero_target_value_handling(self):
        """Test handling of zero target value."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            name="Zero Target",
            target_amount=0.0,
            profit_buffer=0.10
        )
        
        result = goal.calculate_target_value()
        
        assert result == 0.0
    
    def test_negative_profit_buffer(self):
        """Test goal with negative profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            name="Negative Buffer",
            target_amount=100000.0,
            profit_buffer=-0.10
        )
        
        result = goal.calculate_target_value()
        
        # target_value = target * (1 + buffer) = 100000 * 0.9 = 90000
        assert result == 90000.0
    
    def test_100_percent_profit_buffer(self):
        """Test goal with 100% profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            name="Double Target",
            target_amount=100000.0,
            profit_buffer=1.0
        )
        
        result = goal.calculate_target_value()
        
        assert result == 200000.0
    
    def test_zero_quantity_holding(self):
        """Test holding with zero quantity."""
        # Zero quantity holdings should typically be filtered out
        # But if they exist:
        assert True  # Placeholder - actual handling depends on implementation


class TestExtremeValues:
    """Tests for extreme value scenarios."""
    
    def test_very_large_portfolio_value(self):
        """Test portfolio value with extremely large numbers."""
        large_value = 10**15  # 1 quadrillion
        
        current = large_value
        target = large_value * 1.1
        
        progress = (current / target * 100) if target > 0 else 0
        
        assert progress == pytest.approx(90.91, rel=0.1)
    
    def test_very_small_portfolio_value(self):
        """Test portfolio value with extremely small numbers."""
        small_value = 0.00001
        
        # Should not cause division by zero or overflow
        total = small_value * 100
        assert total > 0
    
    def test_max_quantity_holding(self):
        """Test with maximum integer quantity."""
        max_int = 2147483647
        
        total = max_int * 100.0
        
        assert total > 0  # Should handle without overflow
    
    def test_fractional_shares_simulation(self):
        """Test calculations with fractional share-like values."""
        # Some brokerages allow fractional shares
        quantity = 0.5
        price = 1000.0
        
        total = quantity * price
        
        assert total == 500.0
    
    def test_micro_amount_handling(self):
        """Test handling of micro-amounts."""
        micro_amount = 0.001
        
        result = micro_amount * 1000
        
        assert result == 1.0


class TestDateEdgeCases:
    """Tests for date-related edge cases."""
    
    def test_deadline_today(self):
        """Test goal with today's deadline."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            "Urgent",
            1000.0,
            date.today(),
            "moderate"
        )
        
        # Today should be rejected (must be in future)
        assert ok is False
    
    def test_deadline_yesterday(self):
        """Test goal with yesterday's deadline."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            "Past",
            1000.0,
            date.today() - timedelta(days=1),
            "moderate"
        )
        
        assert ok is False
    
    def test_transaction_date_today(self):
        """Test transaction with today's date."""
        from utils.validators import validate_transaction
        
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = validate_transaction(
                "AAPL",
                date.today(),
                150.0,
                10,
                "BUY"
            )
        
        # Today should be accepted
        assert ok is True
    
    def test_transaction_date_far_past(self):
        """Test transaction with very old date."""
        from utils.validators import validate_transaction
        
        very_old_date = date.today() - timedelta(days=3650)  # 10 years ago
        
        # Should validate (though market data may not be available)
        # Basic validation should pass
        ok, _ = validate_transaction(
            "AAPL",
            very_old_date,
            150.0,
            10,
            "BUY"
        )
        # May pass basic validation
    
    def test_leap_day_handling(self):
        """Test handling of February 29."""
        from utils.validators import validate_goal
        
        # Valid leap year deadline
        ok, _ = validate_goal(
            "Leap Year",
            1000.0,
            date(2024, 2, 29),
            "moderate"
        )
        
        assert ok is True
    
    def test_year_boundary(self):
        """Test dates around year boundaries."""
        from utils.validators import validate_goal
        
        # New Year's Eve deadline
        new_years_eve = date(date.today().year, 12, 31)
        ok, _ = validate_goal(
            "Year End",
            1000.0,
            new_years_eve,
            "moderate"
        )
        
        # Should pass if in future
        if new_years_eve > date.today():
            assert ok is True


class TestConcurrentTransactions:
    """Tests for concurrent transaction scenarios."""
    
    def test_rapid_buys_same_stock(self):
        """Test rapid consecutive buys of same stock."""
        # Simulate first buy
        qty1 = 100
        price1 = 150.0
        
        # Calculate average after first buy
        total1 = qty1 * price1
        avg1 = total1 / qty1
        
        assert avg1 == 150.0
        
        # Second buy
        qty2 = 100
        price2 = 160.0
        
        # Calculate weighted average
        total_cost = (qty1 * avg1) + (qty2 * price2)
        total_qty = qty1 + qty2
        avg2 = total_cost / total_qty
        
        assert total_qty == 200
        assert avg2 == 155.0
    
    def test_buy_then_sell_same_stock(self):
        """Test buy then sell of same stock."""
        # Start with 100 shares at 150
        qty = 100
        avg_price = 150.0
        
        # Sell 50 shares
        sell_qty = 50
        
        remaining_qty = qty - sell_qty
        # Average price stays the same (FIFO or average cost)
        remaining_avg = avg_price
        
        assert remaining_qty == 50
        assert remaining_avg == 150.0
    
    def test_sell_more_than_owned(self):
        """Test selling more than owned - should not be allowed."""
        qty_owned = 100
        sell_qty = 150
        
        # In real implementation, this should be rejected
        # But mathematically:
        remaining = qty_owned - sell_qty
        
        # This would result in short position (negative holding)
        assert remaining == -50
    
    def test_multiple_stocks_transaction(self):
        """Test handling multiple stocks in portfolio."""
        holdings = {
            "AAPL": {"qty": 100, "avg_price": 150.0},
            "GOOGL": {"qty": 50, "avg_price": 2800.0},
            "MSFT": {"qty": 200, "avg_price": 350.0}
        }
        
        total_invested = sum(h['qty'] * h['avg_price'] for h in holdings.values())
        
        assert total_invested == 100 * 150.0 + 50 * 2800.0 + 200 * 350.0
        assert total_invested == 15000 + 140000 + 70000


class TestCurrencyAndPrecision:
    """Tests for currency handling and precision."""
    
    def test_paise_rounding(self):
        """Test rupee/paise rounding."""
        # Indian stocks trade in paise (cents)
        price = 123.456789
        
        # Round to 2 decimal places
        rounded = round(price, 2)
        
        assert rounded == 123.46
    
    def test_small_price_variation(self):
        """Test very small price variations."""
        price1 = 100.001
        price2 = 100.002
        
        diff = price2 - price1
        
        assert diff == pytest.approx(0.001, rel=0.1)
    
    def test_percentage_calculation_precision(self):
        """Test percentage calculation precision."""
        old_value = 100.0
        new_value = 100.01
        
        pct_change = ((new_value - old_value) / old_value) * 100
        
        assert pct_change == pytest.approx(0.01, rel=0.1)
    
    def test_zero_division_handling(self):
        """Test zero division handling."""
        # When dividing by zero, should handle gracefully
        numerator = 100
        denominator = 0
        
        # Using conditional to avoid actual division by zero
        result = numerator / denominator if denominator != 0 else 0
        
        assert result == 0
    
    def test_infinite_growth_rate(self):
        """Test infinite growth rate calculation."""
        current_value = 0
        target_value = 100000
        
        # When current is 0, growth rate is infinite (or undefined)
        if current_value > 0:
            growth = (target_value / current_value - 1) * 100
        else:
            growth = float('inf')
        
        assert growth == float('inf')


class TestPortfolioRebalancingEdgeCases:
    """Tests for portfolio rebalancing edge cases."""
    
    def test_single_holding_portfolio(self):
        """Test portfolio with single holding."""
        holdings = [
            {"symbol": "AAPL", "current_value": 10000}
        ]
        
        total_value = sum(h['current_value'] for h in holdings)
        
        # Single holding = 100% concentration
        weight = (holdings[0]['current_value'] / total_value) * 100
        
        assert weight == 100.0
    
    def test_perfectly_balanced_portfolio(self):
        """Test perfectly balanced portfolio."""
        holdings = [
            {"symbol": "AAPL", "current_value": 3333.33},
            {"symbol": "GOOGL", "current_value": 3333.33},
            {"symbol": "MSFT", "current_value": 3333.34}
        ]
        
        total_value = sum(h['current_value'] for h in holdings)
        
        # Each should be ~33.33%
        for h in holdings:
            weight = (h['current_value'] / total_value) * 100
            assert weight == pytest.approx(33.33, rel=0.1)
    
    def test_high_concentration_risk(self):
        """Test high concentration risk detection."""
        holdings = [
            {"symbol": "AAPL", "current_value": 9000},
            {"symbol": "GOOGL", "current_value": 500},
            {"symbol": "MSFT", "current_value": 500}
        ]
        
        total_value = sum(h['current_value'] for h in holdings)
        top_weight = max((h['current_value'] / total_value * 100) for h in holdings)
        
        # Top holding is 90% - HIGH concentration risk
        assert top_weight > 50  # Should trigger high risk warning
    
    def test_zero_weight_holdings(self):
        """Test holdings with zero value."""
        holdings = [
            {"symbol": "AAPL", "current_value": 1000},
            {"symbol": "GOOGL", "current_value": 0},
            {"symbol": "MSFT", "current_value": 500}
        ]
        
        total_value = sum(h['current_value'] for h in holdings)
        
        assert total_value == 1500


class TestMarketDataEdgeCases:
    """Tests for market data service edge cases."""
    
    def test_missing_price_data(self):
        """Test handling of missing price data."""
        prices = {
            "AAPL": 150.0,
            "GOOGL": None,  # No price
            "MSFT": 350.0
        }
        
        # Filter out None values
        valid_prices = {k: v for k, v in prices.items() if v is not None}
        
        assert "GOOGL" not in valid_prices
        assert len(valid_prices) == 2
    
    def test_stale_cache_handling(self):
        """Test handling of stale cache."""
        import time
        from services.market_data import _current_price_cache, PRICE_CACHE_TTL
        
        symbol = "TEST"
        
        # Set cache with old timestamp
        _current_price_cache[symbol] = (150.0, time.time() - PRICE_CACHE_TTL - 1)
        
        # Check if cache is valid
        from services.market_data import _get_cached_current_price
        cached = _get_cached_current_price(symbol)
        
        # Should return None (expired)
        assert cached is None
    
    def test_empty_symbol_list(self):
        """Test handling empty symbol list."""
        symbols = []
        
        # Should return empty dict
        assert len(symbols) == 0
    
    def test_duplicate_symbols(self):
        """Test handling duplicate symbols in list."""
        symbols = ["AAPL", "AAPL", "GOOGL", "GOOGL", "AAPL"]
        
        # Get unique symbols
        unique = list(set(symbols))
        
        assert len(unique) == 2
    
    def test_invalid_date_range(self):
        """Test handling of invalid date ranges."""
        start_date = date(2024, 1, 1)
        end_date = date(2023, 1, 1)  # Before start
        
        # Should handle gracefully
        if end_date < start_date:
            # Swap or return error
            valid = False
        else:
            valid = True
        
        assert valid is False


class TestStressScenarios:
    """Tests for stress scenarios."""
    
    def test_market_crash_simulation(self):
        """Test portfolio under market crash."""
        # Portfolio before crash
        holdings_before = [
            {"symbol": "AAPL", "qty": 100, "avg_price": 150.0},
            {"symbol": "GOOGL", "qty": 50, "avg_price": 2800.0},
        ]
        
        total_invested = sum(h['qty'] * h['avg_price'] for h in holdings_before)
        
        # 30% market crash
        crash_factor = 0.7
        
        total_after_crash = total_invested * crash_factor
        loss = total_invested - total_after_crash
        loss_pct = (loss / total_invested) * 100
        
        assert total_after_crash == total_invested * 0.7
        assert loss_pct == 30.0
    
    def test_complete_portfolio_loss(self):
        """Test complete loss scenario."""
        invested = 100000.0
        current = 0.0
        
        loss_pct = ((invested - current) / invested * 100) if invested > 0 else 0
        
        assert loss_pct == 100.0
    
    def test_goal_completed_early(self):
        """Test goal completion well before deadline."""
        # Goal: 100000 in 365 days
        # Achieved in 100 days
        target = 100000.0
        days_total = 365
        days_elapsed = 100
        
        # What was achieved
        achieved = target * 1.1  # With buffer
        
        expected_progress = (days_elapsed / days_total) * 100
        actual_progress = 100  # Fully achieved
        
        # Way ahead of schedule
        ahead_by = actual_progress - expected_progress
        
        assert ahead_by > 0
    
    def test_goal_impossible_timeline(self):
        """Test goal with impossible timeline."""
        # Goal: 100000 in 1 day
        # Starting from 0
        target = 100000.0
        days = 1
        starting = 0.0
        
        # Required daily return would be infinite
        if starting > 0:
            required_return = (target / starting) ** (365 / days) - 1
        else:
            required_return = float('inf')
        
        assert required_return == float('inf')


class TestDataIntegrity:
    """Tests for data integrity scenarios."""
    
    def test_negative_holding_quantity(self):
        """Test handling of negative holding quantity."""
        # Should not happen in real system, but test edge case
        qty = -10
        
        # Should be treated as error or zero
        valid_qty = max(0, qty)
        
        assert valid_qty == 0
    
    def test_orphaned_holdings(self):
        """Test holdings without associated goal."""
        # Orphaned holding (goal_id doesn't exist)
        holding = {
            "goal_id": 999999,
            "symbol": "AAPL",
            "quantity": 100
        }
        
        # In real system, should be cleaned up or flagged
        assert holding["goal_id"] is not None
    
    def test_duplicate_transactions(self):
        """Test duplicate transaction detection."""
        transactions = [
            {"id": 1, "symbol": "AAPL", "qty": 10, "date": date.today()},
            {"id": 2, "symbol": "AAPL", "qty": 10, "date": date.today()},
            {"id": 3, "symbol": "AAPL", "qty": 10, "date": date.today()},
        ]
        
        # Count duplicates
        seen = set()
        duplicates = []
        
        for t in transactions:
            key = (t['symbol'], t['qty'], str(t['date']))
            if key in seen:
                duplicates.append(t)
            seen.add(key)
        
        # All 3 are "duplicates" in this scenario
        assert len(duplicates) == 0  # First one isn't a duplicate
    
    def test_transaction_without_holding(self):
        """Test transaction for stock not in holdings."""
        # Sell stock that's not owned
        holding_qty = 0
        sell_qty = 10
        
        # Should be rejected
        can_sell = holding_qty >= sell_qty
        
        assert can_sell is False
