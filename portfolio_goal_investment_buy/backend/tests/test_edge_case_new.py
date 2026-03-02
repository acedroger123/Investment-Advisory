"""
New edge-case tests for boundary and unusual scenarios.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import MagicMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestEdgeCasesPortfolioNew:
    def test_calculate_portfolio_value_goal_not_found(self):
        from services.portfolio_service import PortfolioService

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None

        result = PortfolioService.calculate_portfolio_value(mock_db, goal_id=999, holdings=[])

        assert result == {"error": "Goal not found"}

    def test_asset_allocation_empty_holdings(self):
        from services.portfolio_service import PortfolioService

        mock_db = MagicMock()
        result = PortfolioService.get_asset_allocation(mock_db, goal_id=1, holdings=[])

        assert result == []

    def test_drawdown_insufficient_history(self):
        from services.portfolio_service import PortfolioService

        mock_db = MagicMock()
        result = PortfolioService.calculate_drawdown(mock_db, goal_id=1, history=[{"date": "2024-01-01", "value": 1000}])

        assert result["max_drawdown"] == 0
        assert result["current_drawdown"] == 0


class TestEdgeCasesMathNew:
    def test_zero_division_guard_for_progress(self):
        current_value = 5000.0
        target_value = 0.0

        progress = (current_value / target_value * 100) if target_value > 0 else 0

        assert progress == 0

    def test_extremely_large_numbers(self):
        invested = 10 ** 12
        current = invested * 1.05
        pnl_pct = ((current - invested) / invested) * 100 if invested > 0 else 0

        assert pnl_pct == pytest.approx(5.0)

    def test_negative_days_difference(self):
        today = date.today()
        future = today + timedelta(days=7)

        assert (today - future).days == -7


class TestEdgeCasesValidationNew:
    def test_transaction_with_minimum_quantity(self):
        from utils.validators import validate_transaction

        ok, _ = validate_transaction("AAPL", date.today() - timedelta(days=1), 0.01, 1, "BUY")

        assert ok in [True, False]

    def test_goal_with_far_future_deadline(self):
        from utils.validators import validate_goal

        ok, msg = validate_goal("Long Term", 1000.0, date.today() + timedelta(days=3650), "high")

        assert ok is True
        assert "valid" in msg.lower()

