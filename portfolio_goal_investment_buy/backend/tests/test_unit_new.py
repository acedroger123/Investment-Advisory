"""
New unit tests focused on core model and service utility behavior.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestGoalModelUnitNew:
    def test_calculate_target_value_default_buffer(self):
        from database.models import Goal

        goal = Goal(
            id=1,
            user_id=1,
            name="Retirement",
            target_amount=100000.0,
            profit_buffer=0.10,
            deadline=date.today() + timedelta(days=365),
        )

        result = goal.calculate_target_value()

        assert result == pytest.approx(110000.0)
        assert goal.target_value == pytest.approx(110000.0)

    def test_calculate_target_value_negative_buffer(self):
        from database.models import Goal

        goal = Goal(
            id=2,
            user_id=1,
            name="Conservative",
            target_amount=50000.0,
            profit_buffer=-0.20,
            deadline=date.today() + timedelta(days=180),
        )

        result = goal.calculate_target_value()

        assert result == pytest.approx(40000.0)


class TestTransactionModelUnitNew:
    def test_calculate_total_value(self):
        from database.models import Transaction

        txn = Transaction(
            id=1,
            goal_id=1,
            stock_symbol="AAPL",
            transaction_type="BUY",
            quantity=12,
            price=150.5,
            transaction_date=date.today(),
        )

        assert txn.calculate_total_value() == pytest.approx(1806.0)


class TestMarketDataNormalizeUnitNew:
    def test_normalize_symbol_nse(self):
        from services.market_data import MarketDataService

        assert MarketDataService.normalize_symbol("reliance", "NSE") == "RELIANCE.NS"

    def test_normalize_symbol_us(self):
        from services.market_data import MarketDataService

        assert MarketDataService.normalize_symbol("msft", "US") == "MSFT"

    def test_normalize_symbol_already_suffixed(self):
        from services.market_data import MarketDataService

        assert MarketDataService.normalize_symbol("TCS.NS", "NSE") == "TCS.NS"


class TestPureCalculationUnitNew:
    def test_portfolio_weight_sum(self):
        holdings = [
            {"symbol": "AAPL", "current_value": 5000.0},
            {"symbol": "MSFT", "current_value": 3000.0},
            {"symbol": "GOOGL", "current_value": 2000.0},
        ]

        total = sum(h["current_value"] for h in holdings)
        weights = [(h["current_value"] / total) * 100 for h in holdings]

        assert total == pytest.approx(10000.0)
        assert sum(weights) == pytest.approx(100.0)

    def test_days_remaining_calculation(self):
        today = date.today()
        deadline = today + timedelta(days=45)

        assert (deadline - today).days == 45

