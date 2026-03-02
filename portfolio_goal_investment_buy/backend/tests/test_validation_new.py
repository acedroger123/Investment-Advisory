"""
New validation tests for transaction and goal validators.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestTransactionValidationNew:
    def _validate(self, symbol="AAPL", txn_date=None, price=150.0, quantity=10, txn_type="BUY"):
        from utils.validators import validate_transaction

        txn_date = txn_date or (date.today() - timedelta(days=1))
        return validate_transaction(symbol, txn_date, price, quantity, txn_type)

    def test_valid_transaction(self):
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "Price is valid")
            ok, msg = self._validate()

        assert ok is True
        assert "valid" in msg.lower()

    def test_invalid_transaction_type(self):
        ok, msg = self._validate(txn_type="HOLD")

        assert ok is False
        assert "transaction type" in msg.lower()

    def test_future_transaction_date_rejected(self):
        ok, msg = self._validate(txn_date=date.today() + timedelta(days=1))

        assert ok is False
        assert "future" in msg.lower()

    def test_non_positive_values_rejected(self):
        ok, msg = self._validate(price=0, quantity=0)

        assert ok is False
        assert "price" in msg.lower()
        assert "quantity" in msg.lower()


class TestGoalValidationNew:
    def _validate(self, name="My Goal", target_amount=10000.0, deadline=None, risk_preference="moderate"):
        from utils.validators import validate_goal

        deadline = deadline or (date.today() + timedelta(days=60))
        return validate_goal(name, target_amount, deadline, risk_preference)

    def test_valid_goal(self):
        ok, msg = self._validate()

        assert ok is True
        assert "valid" in msg.lower()

    def test_short_name_rejected(self):
        ok, msg = self._validate(name="A")

        assert ok is False
        assert "name" in msg.lower()

    def test_past_deadline_rejected(self):
        ok, msg = self._validate(deadline=date.today())

        assert ok is False
        assert "future" in msg.lower()

    def test_invalid_risk_rejected(self):
        ok, msg = self._validate(risk_preference="balanced")

        assert ok is False
        assert "risk" in msg.lower()


class TestValidationErrorCompositionNew:
    def test_multiple_errors_joined(self):
        from utils.validators import validate_transaction

        ok, msg = validate_transaction("", date.today() + timedelta(days=1), -1.0, -2, "INVALID")

        assert ok is False
        assert ";" in msg

