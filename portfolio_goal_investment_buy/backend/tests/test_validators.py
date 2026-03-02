from conftest import FakeGoal, FakeHolding, FakeTransaction, SmartFakeDB
"""
Tests for utils/validators.py
FakeGoal etc. come from conftest.py automatically — no import needed.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch


class TestValidateTransactionHappyPath:

    def _call(self, symbol="AAPL", txn_date=None, price=150.0,
              quantity=10, txn_type="BUY"):
        txn_date = txn_date or (date.today() - timedelta(days=1))
        from utils.validators import validate_transaction
        return validate_transaction(symbol, txn_date, price, quantity, txn_type)

    def test_valid_buy_transaction(self):
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "Price is valid")
            ok, _ = self._call()
        assert ok is True

    def test_valid_sell_transaction(self):
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "Price is valid")
            ok, _ = self._call(txn_type="SELL")
        assert ok is True

    def test_case_insensitive_buy(self):
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call(txn_type="buy")
        assert ok is True

    def test_case_insensitive_sell(self):
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call(txn_type="sell")
        assert ok is True


class TestValidateTransactionBasicValidations:

    def _call(self, symbol="AAPL", txn_date=None, price=100.0,
              quantity=5, txn_type="BUY"):
        txn_date = txn_date or (date.today() - timedelta(days=1))
        from utils.validators import validate_transaction
        return validate_transaction(symbol, txn_date, price, quantity, txn_type)

    def test_empty_symbol_rejected(self):
        ok, msg = self._call(symbol="")
        assert ok is False
        assert "symbol" in msg.lower()

    def test_none_symbol_rejected(self):
        ok, msg = self._call(symbol=None)
        assert ok is False

    def test_zero_quantity_rejected(self):
        ok, msg = self._call(quantity=0)
        assert ok is False
        assert "quantity" in msg.lower()

    def test_negative_quantity_rejected(self):
        ok, msg = self._call(quantity=-5)
        assert ok is False

    def test_zero_price_rejected(self):
        ok, msg = self._call(price=0)
        assert ok is False
        assert "price" in msg.lower()

    def test_negative_price_rejected(self):
        ok, msg = self._call(price=-10.0)
        assert ok is False

    def test_invalid_transaction_type_rejected(self):
        ok, msg = self._call(txn_type="HOLD")
        assert ok is False

    def test_blank_transaction_type_rejected(self):
        ok, msg = self._call(txn_type="")
        assert ok is False

    def test_future_date_rejected(self):
        ok, msg = self._call(txn_date=date.today() + timedelta(days=1))
        assert ok is False
        assert "future" in msg.lower()

    def test_today_date_accepted(self):
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            ok, _ = self._call(txn_date=date.today())
        assert ok is True

    def test_multiple_validation_errors_combined(self):
        ok, msg = self._call(symbol="", quantity=-1, price=-5, txn_type="TRANSFER")
        assert ok is False
        assert ";" in msg  # multiple errors joined

    def test_price_mismatch_from_market_data_fails(self):
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (
                False, "Price deviates more than 10% from historical data"
            )
            ok, msg = self._call()
        assert ok is False

    def test_market_data_service_called_with_correct_args(self):
        symbol = "TSLA"
        txn_date = date.today() - timedelta(days=2)
        price = 200.0
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "OK")
            from utils.validators import validate_transaction
            validate_transaction(symbol, txn_date, price, 1, "BUY")
            m.validate_transaction_price.assert_called_once_with(symbol, txn_date, price)


class TestValidateGoalHappyPath:

    def _call(self, name="Buy a House", target_amount=100_000.0,
              deadline=None, risk_preference="moderate"):
        deadline = deadline or (date.today() + timedelta(days=365))
        from utils.validators import validate_goal
        return validate_goal(name, target_amount, deadline, risk_preference)

    def test_valid_low_risk(self):
        ok, _ = self._call(risk_preference="low")
        assert ok is True

    def test_valid_moderate_risk(self):
        ok, _ = self._call(risk_preference="moderate")
        assert ok is True

    def test_valid_high_risk(self):
        ok, _ = self._call(risk_preference="high")
        assert ok is True

    def test_success_message_returned(self):
        ok, msg = self._call()
        assert ok is True
        assert msg


class TestValidateGoalEdgeCases:

    def _call(self, name="My Goal", target_amount=1000.0,
              deadline=None, risk_preference="moderate"):
        deadline = deadline or (date.today() + timedelta(days=30))
        from utils.validators import validate_goal
        return validate_goal(name, target_amount, deadline, risk_preference)

    def test_empty_name_rejected(self):
        ok, _ = self._call(name="")
        assert ok is False

    def test_single_char_name_rejected(self):
        ok, msg = self._call(name="A")
        assert ok is False
        assert "2" in msg or "name" in msg.lower()

    def test_two_char_name_accepted(self):
        ok, _ = self._call(name="AB")
        assert ok is True

    def test_none_name_rejected(self):
        ok, _ = self._call(name=None)
        assert ok is False

    def test_zero_target_rejected(self):
        ok, msg = self._call(target_amount=0)
        assert ok is False

    def test_negative_target_rejected(self):
        ok, _ = self._call(target_amount=-500)
        assert ok is False

    def test_fractional_target_accepted(self):
        ok, _ = self._call(target_amount=0.01)
        assert ok is True

    def test_past_deadline_rejected(self):
        ok, msg = self._call(deadline=date.today() - timedelta(days=1))
        assert ok is False
        assert "future" in msg.lower() or "deadline" in msg.lower()

    def test_today_deadline_rejected(self):
        ok, _ = self._call(deadline=date.today())
        assert ok is False

    def test_tomorrow_deadline_accepted(self):
        ok, _ = self._call(deadline=date.today() + timedelta(days=1))
        assert ok is True

    def test_invalid_risk_rejected(self):
        ok, msg = self._call(risk_preference="extreme")
        assert ok is False
        assert "risk" in msg.lower()

    def test_numeric_risk_rejected(self):
        ok, _ = self._call(risk_preference="5")
        assert ok is False

    def test_all_invalid_fields_multiple_errors(self):
        ok, msg = self._call(
            name="",
            target_amount=0,
            deadline=date.today() - timedelta(days=1),
            risk_preference="YOLO"
        )
        assert ok is False
        assert msg.count(";") >= 2  # at least 3 errors joined
