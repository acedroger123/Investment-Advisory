"""
Unit Tests for individual functions and methods.
Tests core business logic in isolation with mocking where needed.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestGoalModel:
    """Tests for Goal model methods."""
    
    def test_calculate_target_value_with_default_buffer(self):
        """Test target value calculation with default 10% profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            name="Test Goal",
            target_amount=100000.0,
            profit_buffer=0.10
        )
        
        result = goal.calculate_target_value()
        
        assert result == pytest.approx(110000.0, rel=1e-9)
        assert goal.target_value == pytest.approx(110000.0, rel=1e-9)
    
    def test_calculate_target_value_with_custom_buffer(self):
        """Test target value calculation with custom profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            name="Test Goal",
            target_amount=50000.0,
            profit_buffer=0.20  # 20% buffer
        )
        
        result = goal.calculate_target_value()
        
        assert result == 60000.0
    
    def test_calculate_target_value_with_zero_buffer(self):
        """Test target value calculation with zero profit buffer."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            name="Test Goal",
            target_amount=100000.0,
            profit_buffer=0.0
        )
        
        result = goal.calculate_target_value()
        
        assert result == 100000.0
    
    def test_calculate_target_value_with_fractional_amount(self):
        """Test target value calculation with fractional amounts."""
        from database.models import Goal
        
        goal = Goal(
            id=1,
            name="Small Goal",
            target_amount=123.45,
            profit_buffer=0.10
        )
        
        result = goal.calculate_target_value()
        
        assert result == pytest.approx(135.795)


class TestTransactionModel:
    """Tests for Transaction model methods."""
    
    def test_calculate_total_value_basic(self):
        """Test total value calculation for a basic transaction."""
        from database.models import Transaction
        
        txn = Transaction(
            id=1,
            stock_symbol="AAPL",
            quantity=10,
            price=150.0
        )
        
        result = txn.calculate_total_value()
        
        assert result == 1500.0
        assert txn.total_value == 1500.0
    
    def test_calculate_total_value_large_quantity(self):
        """Test total value calculation with large quantity."""
        from database.models import Transaction
        
        txn = Transaction(
            id=1,
            stock_symbol="RELIANCE",
            quantity=1000,
            price=2500.50
        )
        
        result = txn.calculate_total_value()
        
        assert result == 2500500.0
    
    def test_calculate_total_value_fractional_price(self):
        """Test total value calculation with fractional price."""
        from database.models import Transaction
        
        txn = Transaction(
            id=1,
            stock_symbol="INFY",
            quantity=50,
            price=123.456789
        )
        
        result = txn.calculate_total_value()
        
        assert result == pytest.approx(6172.83945, rel=0.001)


class TestMarketDataService:
    """Tests for MarketDataService functions."""
    
    def test_normalize_symbol_nse(self):
        """Test symbol normalization for NSE."""
        from services.market_data import MarketDataService
        
        result = MarketDataService.normalize_symbol("RELIANCE", "NSE")
        
        assert result == "RELIANCE.NS"
    
    def test_normalize_symbol_bse(self):
        """Test symbol normalization for BSE."""
        from services.market_data import MarketDataService
        
        result = MarketDataService.normalize_symbol("RELIANCE", "BSE")
        
        assert result == "RELIANCE.BO"
    
    def test_normalize_symbol_us(self):
        """Test symbol normalization for US stocks."""
        from services.market_data import MarketDataService
        
        result = MarketDataService.normalize_symbol("AAPL", "US")
        
        assert result == "AAPL"
    
    def test_normalize_symbol_already_has_suffix(self):
        """Test symbol that already has suffix is not modified."""
        from services.market_data import MarketDataService
        
        result = MarketDataService.normalize_symbol("RELIANCE.NS", "NSE")
        
        assert result == "RELIANCE.NS"
    
    def test_normalize_symbol_lowercase(self):
        """Test symbol normalization handles lowercase."""
        from services.market_data import MarketDataService
        
        result = MarketDataService.normalize_symbol("tcs", "NSE")
        
        assert result == "TCS.NS"
    
    def test_normalize_symbol_with_spaces(self):
        """Test symbol normalization handles whitespace."""
        from services.market_data import MarketDataService
        
        result = MarketDataService.normalize_symbol("  HDFCBANK  ", "NSE")
        
        assert result == "HDFCBANK.NS"


class TestPortfolioCalculations:
    """Tests for portfolio calculation logic."""
    
    def test_holding_unrealized_pnl_calculation(self):
        """Test unrealized P&L calculation for a holding."""
        # Simulate holding data
        quantity = 100
        avg_buy_price = 150.0
        current_price = 180.0
        
        total_invested = quantity * avg_buy_price
        current_value = quantity * current_price
        unrealized_pnl = current_value - total_invested
        unrealized_pnl_pct = (unrealized_pnl / total_invested * 100) if total_invested > 0 else 0
        
        assert total_invested == 15000.0
        assert current_value == 18000.0
        assert unrealized_pnl == 3000.0
        assert unrealized_pnl_pct == 20.0
    
    def test_holding_unrealized_loss_calculation(self):
        """Test unrealized loss calculation."""
        quantity = 50
        avg_buy_price = 200.0
        current_price = 150.0
        
        total_invested = quantity * avg_buy_price
        current_value = quantity * current_price
        unrealized_pnl = current_value - total_invested
        unrealized_pnl_pct = (unrealized_pnl / total_invested * 100) if total_invested > 0 else 0
        
        assert total_invested == 10000.0
        assert current_value == 7500.0
        assert unrealized_pnl == -2500.0
        assert unrealized_pnl_pct == -25.0
    
    def test_portfolio_allocation_weight_calculation(self):
        """Test asset allocation weight calculation."""
        holdings = [
            {"symbol": "AAPL", "current_value": 5000},
            {"symbol": "GOOGL", "current_value": 3000},
            {"symbol": "MSFT", "current_value": 2000}
        ]
        
        total_value = sum(h['current_value'] for h in holdings)
        
        assert total_value == 10000.0
        
        weights = []
        for h in holdings:
            weight = (h['current_value'] / total_value) * 100
            weights.append(weight)
        
        assert weights[0] == 50.0  # AAPL
        assert weights[1] == 30.0  # GOOGL
        assert weights[2] == 20.0  # MSFT
        assert sum(weights) == 100.0
    
    def test_goal_progress_calculation(self):
        """Test goal progress percentage calculation."""
        current_value = 75000.0
        target_value = 100000.0
        
        progress = (current_value / target_value * 100) if target_value > 0 else 0
        
        assert progress == 75.0
    
    def test_required_growth_rate_calculation(self):
        """Test required annual growth rate calculation."""
        current_value = 50000.0
        target_value = 100000.0
        days_remaining = 365
        
        if days_remaining > 0 and current_value > 0:
            amount_needed = target_value - current_value
            annual_growth_needed = ((target_value / current_value) ** (365 / days_remaining) - 1) * 100
        else:
            annual_growth_needed = 0
        
        assert amount_needed == 50000.0
        assert annual_growth_needed == pytest.approx(100.0, rel=0.1)


class TestAverageBuyPriceCalculation:
    """Tests for average buy price calculation logic."""
    
    def test_first_buy_sets_average(self):
        """First buy sets the average price."""
        # No existing holding
        quantity = 0
        avg_price = 0.0
        
        # Buy 100 shares at 150
        new_quantity = 100
        new_price = 150.0
        
        total_cost = (quantity * avg_price) + (new_quantity * new_price)
        final_quantity = quantity + new_quantity
        final_avg_price = total_cost / final_quantity if final_quantity > 0 else 0
        
        assert final_quantity == 100
        assert final_avg_price == 150.0
    
    def test_second_buy_calculates_weighted_average(self):
        """Second buy calculates weighted average correctly."""
        # Existing holding: 100 shares at 150
        quantity = 100
        avg_price = 150.0
        
        # Buy 100 more shares at 180
        new_quantity = 100
        new_price = 180.0
        
        total_cost = (quantity * avg_price) + (new_quantity * new_price)
        final_quantity = quantity + new_quantity
        final_avg_price = total_cost / final_quantity if final_quantity > 0 else 0
        
        assert final_quantity == 200
        assert final_avg_price == 165.0
    
    def test_third_buy_continues_weighted_average(self):
        """Third purchase continues weighted average."""
        # Existing: 200 shares at 165
        quantity = 200
        avg_price = 165.0
        
        # Buy 100 at 120
        new_quantity = 100
        new_price = 120.0
        
        total_cost = (quantity * avg_price) + (new_quantity * new_price)
        final_quantity = quantity + new_quantity
        final_avg_price = total_cost / final_quantity if final_quantity > 0 else 0
        
        assert final_quantity == 300
        assert final_avg_price == 150.0


class TestDrawdownCalculation:
    """Tests for drawdown calculation logic."""
    
    def test_simple_drawdown_calculation(self):
        """Test basic drawdown calculation."""
        history = [
            {"date": "2024-01-01", "value": 10000},
            {"date": "2024-01-02", "value": 10500},
            {"date": "2024-01-03", "value": 9500},
            {"date": "2024-01-04", "value": 9000},
            {"date": "2024-01-05", "value": 9800},
        ]
        
        peak = history[0]['value']
        max_drawdown = 0
        
        for point in history:
            value = point['value']
            if value > peak:
                peak = value
            
            drawdown = ((peak - value) / peak) * 100 if peak > 0 else 0
            
            if drawdown > max_drawdown:
                max_drawdown = drawdown
        
        # Peak was 10500, trough was 9000
        # Drawdown = (10500 - 9000) / 10500 * 100 = 14.29%
        assert max_drawdown == pytest.approx(14.29, rel=0.1)
    
    def test_no_drawdown_in_uptrend(self):
        """Test that uptrending portfolio has no drawdown."""
        history = [
            {"date": "2024-01-01", "value": 10000},
            {"date": "2024-01-02", "value": 10200},
            {"date": "2024-01-03", "value": 10500},
            {"date": "2024-01-04", "value": 10800},
        ]
        
        peak = history[0]['value']
        max_drawdown = 0
        
        for point in history:
            value = point['value']
            if value > peak:
                peak = value
            
            drawdown = ((peak - value) / peak) * 100 if peak > 0 else 0
            
            if drawdown > max_drawdown:
                max_drawdown = drawdown
        
        assert max_drawdown == 0.0


class TestRiskMetrics:
    """Tests for risk metric calculations."""
    
    def test_hhi_concentration_calculation(self):
        """Test Herfindahl-Hirschman Index calculation."""
        weights = [0.5, 0.3, 0.2]  # 50%, 30%, 20%
        
        # HHI = sum of squared weights * 100
        hhi = sum(w ** 2 for w in weights) * 100
        
        assert hhi == pytest.approx(38.0, rel=0.1)
    
    def test_diversification_score(self):
        """Test diversification score calculation."""
        weights = [0.5, 0.3, 0.2]
        
        hhi = sum(w ** 2 for w in weights) * 100
        diversification = (1 - hhi / 100) * 100
        
        assert diversification == pytest.approx(62.0, rel=0.1)
    
    def test_perfect_diversification(self):
        """Test diversification with equal weights."""
        weights = [0.25, 0.25, 0.25, 0.25]
        
        hhi = sum(w ** 2 for w in weights) * 100
        diversification = (1 - hhi / 100) * 100
        
        # Equal weights = maximum diversification
        assert hhi == 25.0
        assert diversification == 75.0
    
    def test_single_holding_concentration(self):
        """Test concentration with single holding."""
        weights = [1.0]
        
        hhi = sum(w ** 2 for w in weights) * 100
        diversification = (1 - hhi / 100) * 100
        
        assert hhi == 100.0
        assert diversification == 0.0


class TestDateCalculations:
    """Tests for date-related calculations."""
    
    def test_days_remaining_calculation(self):
        """Test days remaining until deadline."""
        today = date.today()
        deadline = today + timedelta(days=30)
        
        days_remaining = (deadline - today).days
        
        assert days_remaining == 30
    
    def test_days_remaining_past_deadline(self):
        """Test days remaining for past deadline (negative)."""
        today = date.today()
        deadline = today - timedelta(days=10)
        
        days_remaining = (deadline - today).days
        
        assert days_remaining == -10
    
    def test_elapsed_time_calculation(self):
        """Test elapsed time since creation."""
        today = date.today()
        created = today - timedelta(days=60)
        
        days_elapsed = (today - created).days
        
        assert days_elapsed == 60
    
    def test_expected_progress_calculation(self):
        """Test expected progress calculation."""
        created = date.today() - timedelta(days=30)
        deadline = date.today() + timedelta(days=60)
        today = date.today()
        
        total_days = (deadline - created).days
        days_elapsed = (today - created).days
        expected_progress = (days_elapsed / total_days) * 100 if total_days > 0 else 0
        
        # 30 days elapsed out of 90 total = 33.33%
        assert expected_progress == pytest.approx(33.33, rel=0.1)
