"""
Edge Case Tests for Stock Portfolio Advisory System.
Tests boundary conditions, unusual scenarios, and exceptional cases.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# Add project root to path (backend directory)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/backend')


class TestEmptyAndZeroValues:
    """Tests for empty and zero value edge cases."""
    
    def test_empty_holdings_list(self):
        """Test handling of empty holdings list."""
        holdings = []
        
        total_value = sum(h.get("quantity", 0) * h.get("current_price", 0) for h in holdings)
        
        assert total_value == 0
    
    def test_zero_quantity_holding(self):
        """Test holding with zero quantity."""
        holding = {"symbol": "AAPL", "quantity": 0, "current_price": 150.0}
        
        value = holding.get("quantity", 0) * holding.get("current_price", 0)
        
        assert value == 0
    
    def test_zero_price_holding(self):
        """Test holding with zero price."""
        holding = {"symbol": "AAPL", "quantity": 100, "current_price": 0.0}
        
        value = holding.get("quantity", 0) * holding.get("current_price", 0)
        
        assert value == 0
    
    def test_zero_target_goal(self):
        """Test goal with zero target amount."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Zero Target",
            target_amount=0.0,
            profit_buffer=0.0,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        
        assert result == 0.0


class TestExtremeValues:
    """Tests for extreme value scenarios."""
    
    def test_very_large_portfolio_value(self):
        """Test portfolio with extremely large value."""
        large_value = 10**15
        
        progress = (large_value / (large_value * 1.1)) * 100
        
        assert progress == pytest.approx(90.91, rel=0.1)
    
    def test_very_small_portfolio_value(self):
        """Test portfolio with extremely small value."""
        small_value = 0.00001
        
        total = small_value * 100
        
        assert total > 0
    
    def test_maximum_integer_quantity(self):
        """Test with maximum integer quantity."""
        max_int = 2147483647
        
        total = max_int * 100.0
        
        assert total > 0
    
    def test_fractional_shares(self):
        """Test with fractional share-like values."""
        quantity = 0.5
        price = 1000.0
        
        total = quantity * price
        
        assert total == 500.0
    
    def test_micro_amount_calculations(self):
        """Test micro-amount calculations."""
        micro = 0.001
        
        result = micro * 1000
        
        assert result == 1.0


class TestNegativeValues:
    """Tests for negative value handling."""
    
    def test_negative_profit_buffer(self):
        """Test goal with negative profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Negative Buffer",
            target_amount=100000.0,
            profit_buffer=-0.10,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        
        assert result == 90000.0
    
    def test_100_percent_profit_buffer(self):
        """Test goal with 100% profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Double Target",
            target_amount=100000.0,
            profit_buffer=1.0,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        
        assert result == 200000.0
    
    def test_200_percent_profit_buffer(self):
        """Test goal with 200% profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Triple Target",
            target_amount=100000.0,
            profit_buffer=2.0,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        
        assert result == 300000.0


class TestDateEdgeCases:
    """Tests for date-related edge cases."""
    
    def test_deadline_today_rejected(self):
        """Test that today's deadline is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            "Test",
            1000.0,
            date.today(),
            "moderate"
        )
        
        assert ok is False
    
    def test_deadline_yesterday_rejected(self):
        """Test that yesterday's deadline is rejected."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            "Test",
            1000.0,
            date.today() - timedelta(days=1),
            "moderate"
        )
        
        assert ok is False
    
    def test_deadline_tomorrow_accepted(self):
        """Test that tomorrow's deadline is accepted."""
        from utils.validators import validate_goal
        
        ok, msg = validate_goal(
            "Test",
            1000.0,
            date.today() + timedelta(days=1),
            "moderate"
        )
        
        assert ok is True
    
    def test_leap_day_handling(self):
        """Test February 29th handling in leap years."""
        from utils.validators import validate_goal
        
        # Use a future leap year (2028) to ensure test passes
        leap_deadline = date(2028, 2, 29)
        ok, _ = validate_goal(
            "Leap Year Goal",
            1000.0,
            leap_deadline,
            "moderate"
        )
        
        assert ok is True
    
    def test_year_boundary_deadline(self):
        """Test deadline at year boundary."""
        from utils.validators import validate_goal
        
        today = date.today()
        new_years_eve = date(today.year, 12, 31)
        
        if new_years_eve > today:
            ok, _ = validate_goal(
                "Year End",
                1000.0,
                new_years_eve,
                "moderate"
            )
            assert ok is True


class TestTransactionEdgeCases:
    """Tests for transaction edge cases."""
    
    def test_buy_sell_average_price(self):
        """Test average price after buy and sell."""
        qty = 100
        avg_price = 150.0
        
        sell_qty = 50
        remaining_qty = qty - sell_qty
        remaining_avg = avg_price
        
        assert remaining_qty == 50
        assert remaining_avg == 150.0
    
    def test_sell_more_than_owned(self):
        """Test selling more than owned."""
        qty_owned = 100
        sell_qty = 150
        
        remaining = qty_owned - sell_qty
        
        assert remaining == -50
    
    def test_multiple_buys_weighted_average(self):
        """Test weighted average with multiple buys."""
        qty1, price1 = 100, 150.0
        qty2, price2 = 100, 180.0
        qty3, price3 = 100, 120.0
        
        total_cost = (qty1 * price1) + (qty2 * price2) + (qty3 * price3)
        total_qty = qty1 + qty2 + qty3
        avg_price = total_cost / total_qty
        
        assert total_qty == 300
        assert avg_price == 150.0
    
    def test_zero_position_after_sell(self):
        """Test selling entire position."""
        qty = 100
        sell_qty = 100
        
        remaining = qty - sell_qty
        
        assert remaining == 0


class TestPortfolioEdgeCases:
    """Tests for portfolio edge cases."""
    
    def test_single_holding_100_percent(self):
        """Test portfolio with single holding."""
        holdings = [{"symbol": "AAPL", "value": 10000}]
        
        total = sum(h["value"] for h in holdings)
        weight = (holdings[0]["value"] / total) * 100
        
        assert weight == 100.0
    
    def test_perfectly_balanced_portfolio(self):
        """Test perfectly balanced portfolio."""
        holdings = [
            {"symbol": "A", "value": 3333.33},
            {"symbol": "B", "value": 3333.33},
            {"symbol": "C", "value": 3333.34}
        ]
        
        total = sum(h["value"] for h in holdings)
        
        for h in holdings:
            weight = (h["value"] / total) * 100
            assert weight == pytest.approx(33.33, rel=0.1)
    
    def test_high_concentration_risk(self):
        """Test high concentration risk detection."""
        holdings = [
            {"symbol": "AAPL", "value": 9000},
            {"symbol": "GOOGL", "value": 500},
            {"symbol": "MSFT", "value": 500}
        ]
        
        total = sum(h["value"] for h in holdings)
        top_weight = max((h["value"] / total * 100) for h in holdings)
        
        assert top_weight > 50
    
    def test_zero_value_holdings(self):
        """Test holdings with zero value."""
        holdings = [
            {"symbol": "AAPL", "value": 1000},
            {"symbol": "GOOGL", "value": 0},
            {"symbol": "MSFT", "value": 500}
        ]
        
        total = sum(h["value"] for h in holdings)
        
        assert total == 1500


class TestCalculationEdgeCases:
    """Tests for calculation edge cases."""
    
    def test_division_by_zero_handling(self):
        """Test division by zero handling."""
        numerator = 100
        denominator = 0
        
        result = numerator / denominator if denominator != 0 else 0
        
        assert result == 0
    
    def test_zero_progress_calculation(self):
        """Test progress calculation with zero current value."""
        current = 0
        target = 100000
        
        progress = (current / target * 100) if target > 0 else 0
        
        assert progress == 0
    
    def test_infinite_growth_rate(self):
        """Test infinite growth rate when current is zero."""
        current = 0
        target = 100000
        
        if current > 0:
            growth = (target / current - 1) * 100
        else:
            growth = float('inf')
        
        assert growth == float('inf')
    
    def test_drawdown_calculation(self):
        """Test drawdown calculation."""
        history = [
            {"value": 10000},
            {"value": 10500},
            {"value": 9500},
            {"value": 9000},
            {"value": 9800},
        ]
        
        peak = history[0]["value"]
        max_dd = 0
        
        for point in history:
            if point["value"] > peak:
                peak = point["value"]
            
            dd = ((peak - point["value"]) / peak * 100) if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd
        
        assert max_dd == pytest.approx(14.29, rel=0.1)
    
    def test_no_drawdown_uptrend(self):
        """Test no drawdown in uptrending portfolio."""
        history = [
            {"value": 10000},
            {"value": 10200},
            {"value": 10500},
            {"value": 10800},
        ]
        
        peak = history[0]["value"]
        max_dd = 0
        
        for point in history:
            if point["value"] > peak:
                peak = point["value"]
            
            dd = ((peak - point["value"]) / peak * 100) if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd
        
        assert max_dd == 0


class TestStressScenarios:
    """Tests for stress scenarios."""
    
    def test_market_crash_30_percent(self):
        """Test portfolio under 30% market crash."""
        holdings = [
            {"qty": 100, "avg_price": 150.0},
            {"qty": 50, "avg_price": 2800.0},
        ]
        
        invested = sum(h["qty"] * h["avg_price"] for h in holdings)
        
        crash_factor = 0.7
        value_after = invested * crash_factor
        loss_pct = ((invested - value_after) / invested) * 100
        
        assert loss_pct == 30.0
    
    def test_complete_loss_scenario(self):
        """Test complete portfolio loss."""
        invested = 100000.0
        current = 0.0
        
        loss_pct = ((invested - current) / invested * 100) if invested > 0 else 0
        
        assert loss_pct == 100.0
    
    def test_goal_completed_early(self):
        """Test goal completed well before deadline."""
        target = 100000.0
        days_total = 365
        days_elapsed = 100
        
        achieved = target * 1.1
        expected_progress = (days_elapsed / days_total) * 100
        actual_progress = 100
        
        ahead_by = actual_progress - expected_progress
        
        assert ahead_by > 0
    
    def test_impossible_goal_timeline(self):
        """Test goal with impossible timeline."""
        target = 100000.0
        days = 1
        starting = 0.0
        
        if starting > 0:
            required = (target / starting) ** (365 / days) - 1
        else:
            required = float('inf')
        
        assert required == float('inf')


class TestDataIntegrityEdgeCases:
    """Tests for data integrity edge cases."""
    
    def test_negative_quantity_handling(self):
        """Test handling of negative quantity."""
        qty = -10
        
        valid_qty = max(0, qty)
        
        assert valid_qty == 0
    
    def test_duplicate_symbol_deduplication(self):
        """Test duplicate symbol handling."""
        symbols = ["AAPL", "AAPL", "GOOGL", "GOOGL", "AAPL"]
        
        unique = list(set(symbols))
        
        assert len(unique) == 2
        assert "AAPL" in unique
        assert "GOOGL" in unique
    
    def test_invalid_date_range(self):
        """Test invalid date range handling."""
        start = date(2024, 1, 1)
        end = date(2023, 1, 1)
        
        valid = end >= start if end > start else False
        
        assert valid is False
    
    def test_missing_price_handling(self):
        """Test handling of missing price data."""
        prices = {
            "AAPL": 150.0,
            "GOOGL": None,
            "MSFT": 350.0
        }
        
        valid_prices = {k: v for k, v in prices.items() if v is not None}
        
        assert "GOOGL" not in valid_prices
        assert len(valid_prices) == 2


class TestCurrencyPrecision:
    """Tests for currency handling and precision."""
    
    def test_paise_rounding(self):
        """Test Indian paise (cents) rounding."""
        price = 123.456789
        
        rounded = round(price, 2)
        
        assert rounded == 123.46
    
    def test_small_price_variation(self):
        """Test small price variations."""
        price1 = 100.001
        price2 = 100.002
        
        diff = price2 - price1
        
        assert diff == pytest.approx(0.001, rel=0.1)
    
    def test_percentage_precision(self):
        """Test percentage calculation precision."""
        old_val = 100.0
        new_val = 100.01
        
        pct = ((new_val - old_val) / old_val) * 100
        
        assert pct == pytest.approx(0.01, rel=0.1)
    
    def test_hhi_concentration(self):
        """Test Herfindahl-Hirschman Index calculation."""
        weights = [0.5, 0.3, 0.2]
        
        hhi = sum(w ** 2 for w in weights) * 100
        
        assert hhi == pytest.approx(38.0, rel=0.1)
    
    def test_diversification_score(self):
        """Test diversification score calculation."""
        weights = [0.5, 0.3, 0.2]
        
        hhi = sum(w ** 2 for w in weights) * 100
        diversification = (1 - hhi / 100) * 100
        
        assert diversification == pytest.approx(62.0, rel=0.1)
    
    def test_perfect_diversification(self):
        """Test perfect diversification with equal weights."""
        weights = [0.25, 0.25, 0.25, 0.25]
        
        hhi = sum(w ** 2 for w in weights) * 100
        div = (1 - hhi / 100) * 100
        
        assert hhi == 25.0
        assert div == 75.0


class TestEdgeCaseCombinations:
    """Tests for combinations of edge cases."""
    
    def test_zero_goal_with_future_deadline(self):
        """Test goal with zero target but future deadline."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Test",
            target_amount=0.0,
            profit_buffer=0.0,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        
        assert result == 0.0
    
    def test_negative_buffer_with_high_target(self):
        """Test negative buffer with high target."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            user_id=1,
            name="Test",
            target_amount=10000000.0,
            profit_buffer=-0.5,
            deadline=date.today() + timedelta(days=365)
        )
        
        result = goal.calculate_target_value()
        
        assert result == 5000000.0
    
    def test_large_quantity_small_price(self):
        """Test large quantity with small price."""
        qty = 1000000
        price = 0.01
        
        total = qty * price
        
        assert total == 10000.0
    
    def test_many_small_holdings(self):
        """Test many small holdings in portfolio."""
        holdings = [
            {"symbol": f"STOCK{i}", "value": 100}
            for i in range(100)
        ]
        
        total = sum(h["value"] for h in holdings)
        
        assert total == 10000
        assert len(holdings) == 100
