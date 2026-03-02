"""
Validation Tests — newtestone suite
Stock Portfolio Advisory System

Tests input validation for goal creation, transaction recording, and
feasibility / smart buy services. Validates both accept and reject paths.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/backend")


# =============================================================================
# GoalFeasibility — feasibility level validation
# =============================================================================

class TestFeasibilityLevelValidation:
    """Correct feasibility levels for risk/timeline combinations."""

    def _run(self, years, risk, target=500_000, buffer=0.10):
        from services.goal_feasibility import check_feasibility
        deadline = date.today() + timedelta(days=int(years * 365))
        return check_feasibility(target, buffer, deadline, risk)

    def test_low_risk_under_1yr_impossible(self):
        assert self._run(0.5, "low")["feasibility_level"] == "impossible"

    def test_moderate_risk_under_half_yr_impossible(self):
        assert self._run(0.4, "moderate")["feasibility_level"] == "impossible"

    def test_high_risk_under_quarter_yr_impossible(self):
        assert self._run(0.2, "high")["feasibility_level"] == "impossible"

    def test_low_risk_2yr_is_challenging(self):
        assert self._run(2, "low")["feasibility_level"] == "challenging"

    def test_moderate_risk_1yr_is_challenging(self):
        assert self._run(1, "moderate")["feasibility_level"] == "challenging"

    def test_high_risk_half_yr_is_challenging(self):
        assert self._run(0.5, "high")["feasibility_level"] == "challenging"

    def test_low_risk_6yr_is_feasible(self):
        assert self._run(6, "low")["feasibility_level"] == "feasible"

    def test_moderate_risk_4yr_is_feasible(self):
        assert self._run(4, "moderate")["feasibility_level"] == "feasible"

    def test_high_risk_3yr_is_feasible(self):
        assert self._run(3, "high")["feasibility_level"] == "feasible"

    def test_less_than_min_days_impossible(self):
        from services.goal_feasibility import check_feasibility, MIN_DAYS
        deadline = date.today() + timedelta(days=MIN_DAYS - 1)
        result = check_feasibility(500_000, 0.10, deadline, "high")
        assert result["feasibility_level"] == "impossible"


class TestFeasibilityInputValidation:
    """check_feasibility handles edge-case inputs gracefully."""

    def _run(self, target=500_000, buffer=0.10, years=5, risk="moderate"):
        from services.goal_feasibility import check_feasibility
        deadline = date.today() + timedelta(days=int(years * 365))
        return check_feasibility(target, buffer, deadline, risk)

    def test_zero_buffer_target_value_equals_amount(self):
        result = self._run(target=100_000, buffer=0.0)
        assert result["target_value"] == pytest.approx(100_000.0, rel=1e-6)

    def test_negative_buffer_reduces_target(self):
        result = self._run(target=100_000, buffer=-0.10)
        assert result["target_value"] == pytest.approx(90_000.0, rel=1e-6)

    def test_large_target_handled(self):
        result = self._run(target=1_000_000_000, years=10, risk="high")
        assert result["feasibility_level"] in ("feasible", "challenging", "impossible")

    def test_unknown_risk_fallback_no_exception(self):
        result = self._run(risk="unknown_tier")
        assert isinstance(result["feasibility_level"], str)

    def test_required_return_pct_is_numeric(self):
        result = self._run()
        assert isinstance(result["required_return_pct"], (int, float))


class TestFeasibilityOptionsValidation:
    """Option sub-objects from check_feasibility are well-formed."""

    def _opts(self, years=1.5, risk="moderate"):
        from services.goal_feasibility import check_feasibility
        deadline = date.today() + timedelta(days=int(years * 365))
        return check_feasibility(500_000, 0.10, deadline, risk)["options"]

    def test_option_a_new_deadline_in_future(self):
        new_dl = date.fromisoformat(self._opts()["option_a"]["new_deadline"])
        assert new_dl > date.today()

    def test_option_a_extra_years_at_least_1(self):
        assert self._opts()["option_a"]["extra_years"] >= 1

    def test_option_b_new_target_positive(self):
        assert self._opts()["option_b"]["new_target_amount"] > 0

    def test_option_c_low_risk_upgrades_to_moderate(self):
        opts = self._opts(risk="low")
        assert opts["option_c"]["available"] is True
        assert opts["option_c"]["new_risk"] == "moderate"

    def test_option_c_high_risk_no_upgrade(self):
        assert self._opts(risk="high")["option_c"]["available"] is False


# =============================================================================
# SmartBuy — scoring validation
# =============================================================================

class TestSmartBuyScoreValidation:
    """_compute_score behaves correctly across inputs."""

    def _score(self, dip=-5.0, sector="Technology", rg=15.0, sym="X.NS", weights=None, mw=30.0):
        from services.smart_buy import _compute_score
        return _compute_score(dip, sector, rg, sym, weights or {}, mw)

    def test_deeper_dip_higher_score(self):
        assert self._score(dip=-15.0) > self._score(dip=-3.5)

    def test_higher_sector_return_higher_score(self):
        assert self._score(sector="Technology") >= self._score(sector="Consumer Defensive")

    def test_at_cap_reduces_score(self):
        clean = self._score(sym="TCS.NS", weights={})
        capped = self._score(sym="TCS.NS", weights={"TCS.NS": 30.0}, mw=30.0)
        assert clean > capped

    def test_score_in_0_to_100_range(self):
        for dip in [-3.0, -10.0, -20.0, -40.0]:
            s = self._score(dip=dip)
            assert 0 <= s <= 100

    def test_unknown_sector_no_exception(self):
        s = self._score(sector="GalacticTech")
        assert 0 <= s <= 100

    def test_extreme_dip_capped(self):
        from services.smart_buy import _compute_score
        s20 = _compute_score(-20.0, "Technology", 0.0, "X.NS", {}, 30.0)
        s50 = _compute_score(-50.0, "Technology", 0.0, "X.NS", {}, 30.0)
        assert s20 == s50


class TestSmartBuyLabelValidation:
    """Fit label and conviction thresholds."""

    @pytest.mark.parametrize("score,label", [
        (0, "Low Fit"), (54, "Low Fit"),
        (55, "Moderate Fit"), (74, "Moderate Fit"),
        (75, "High Fit"), (100, "High Fit"),
    ])
    def test_fit_label(self, score, label):
        from services.smart_buy import _fit_label
        assert _fit_label(score) == label

    @pytest.mark.parametrize("score,conv", [
        (0, "WATCH"), (54, "WATCH"),
        (55, "MODERATE"), (74, "MODERATE"),
        (75, "STRONG"), (100, "STRONG"),
    ])
    def test_conviction(self, score, conv):
        from services.smart_buy import _conviction
        assert _conviction(score) == conv


# =============================================================================
# Validator Functions — goal + transaction
# =============================================================================

class TestGoalValidatorValidation:
    """validate_goal() accept/reject matrix."""

    def test_valid_goal(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("House Fund", 2_000_000.0,
                              date.today() + timedelta(days=3650), "moderate")
        assert ok is True

    def test_empty_name_rejected(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("", 100_000.0, date.today() + timedelta(days=365), "moderate")
        assert ok is False

    def test_single_char_name_rejected(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("X", 100_000.0, date.today() + timedelta(days=365), "moderate")
        assert ok is False

    def test_two_char_name_accepted(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("AB", 100_000.0, date.today() + timedelta(days=365), "moderate")
        assert ok is True

    def test_zero_amount_rejected(self):
        from utils.validators import validate_goal
        ok, msg = validate_goal("Valid", 0.0, date.today() + timedelta(days=365), "moderate")
        assert ok is False and "amount" in msg.lower()

    def test_negative_amount_rejected(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("Valid", -500.0, date.today() + timedelta(days=365), "moderate")
        assert ok is False

    def test_past_deadline_rejected(self):
        from utils.validators import validate_goal
        ok, msg = validate_goal("Valid", 100_000.0, date.today() - timedelta(days=1), "moderate")
        assert ok is False and "deadline" in msg.lower()

    def test_today_deadline_rejected(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("Valid", 100_000.0, date.today(), "moderate")
        assert ok is False

    def test_tomorrow_deadline_accepted(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("Valid", 100_000.0, date.today() + timedelta(days=1), "moderate")
        assert ok is True

    @pytest.mark.parametrize("risk", ["low", "moderate", "high"])
    def test_valid_risks_accepted(self, risk):
        from utils.validators import validate_goal
        ok, _ = validate_goal("Valid", 100_000.0, date.today() + timedelta(days=365), risk)
        assert ok is True

    @pytest.mark.parametrize("risk", ["extreme", "medium", "aggressive", "", "   "])
    def test_invalid_risks_rejected(self, risk):
        from utils.validators import validate_goal
        ok, _ = validate_goal("Valid", 100_000.0, date.today() + timedelta(days=365), risk)
        assert ok is False

    @pytest.mark.parametrize("risk", ["LOW", "Moderate", "HIGH"])
    def test_case_insensitive_risk(self, risk):
        from utils.validators import validate_goal
        ok, _ = validate_goal("Valid", 100_000.0, date.today() + timedelta(days=365), risk)
        assert ok is True


class TestTransactionValidatorValidation:
    """validate_transaction() accept/reject matrix."""

    def _buy(self, symbol="INFY", days_ago=1, price=1500.0, qty=100, txn_type="BUY"):
        from utils.validators import validate_transaction
        with patch("utils.validators.MarketDataService") as m:
            m.validate_transaction_price.return_value = (True, "Valid")
            return validate_transaction(symbol, date.today() - timedelta(days=days_ago),
                                        price, qty, txn_type)

    def test_valid_buy(self):
        ok, _ = self._buy()
        assert ok is True

    def test_valid_sell(self):
        ok, _ = self._buy(txn_type="SELL")
        assert ok is True

    def test_empty_symbol_rejected(self):
        from utils.validators import validate_transaction
        ok, msg = validate_transaction("", date.today() - timedelta(days=1), 150.0, 10, "BUY")
        assert ok is False and ("symbol" in msg.lower() or "required" in msg.lower())

    def test_whitespace_symbol_rejected(self):
        from utils.validators import validate_transaction
        ok, _ = validate_transaction("   ", date.today() - timedelta(days=1), 150.0, 10, "BUY")
        assert ok is False

    def test_zero_quantity_rejected(self):
        from utils.validators import validate_transaction
        ok, msg = validate_transaction("AAPL", date.today() - timedelta(days=1), 150.0, 0, "BUY")
        assert ok is False and "quantity" in msg.lower()

    def test_negative_quantity_rejected(self):
        from utils.validators import validate_transaction
        ok, _ = validate_transaction("AAPL", date.today() - timedelta(days=1), 150.0, -5, "BUY")
        assert ok is False

    def test_zero_price_rejected(self):
        from utils.validators import validate_transaction
        ok, msg = validate_transaction("AAPL", date.today() - timedelta(days=1), 0.0, 10, "BUY")
        assert ok is False and "price" in msg.lower()

    def test_future_date_rejected(self):
        from utils.validators import validate_transaction
        ok, msg = validate_transaction("AAPL", date.today() + timedelta(days=1), 150.0, 10, "BUY")
        assert ok is False and "future" in msg.lower()

    @pytest.mark.parametrize("txn_type", ["buy", "Buy", "BUY"])
    def test_case_insensitive_buy_accepted(self, txn_type):
        ok, _ = self._buy(txn_type=txn_type)
        assert ok is True

    @pytest.mark.parametrize("txn_type", ["HOLD", "TRANSFER", "BUYY", ""])
    def test_invalid_types_rejected(self, txn_type):
        from utils.validators import validate_transaction
        ok, _ = validate_transaction("AAPL", date.today() - timedelta(days=1), 150.0, 10, txn_type)
        assert ok is False
