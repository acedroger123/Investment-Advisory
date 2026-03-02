"""
Unit tests for the goal feasibility service.
These are pure logic tests — no database, no HTTP.
"""
import pytest
from datetime import date, timedelta
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.goal_feasibility import check_feasibility, RISK_BENCHMARKS


def future(years=3):
    """Return a deadline N years from today."""
    return date.today() + timedelta(days=int(years * 365))


class TestGoalFeasibility:

    # ── Feasibility levels ───────────────────────────────────────────────────

    def test_moderate_3yr_small_target_is_feasible(self):
        """A modest target over 3+ years at moderate risk should be feasible."""
        # moderate min_feasible_years = 3.0; use 3.1 to avoid int/365.25 rounding edge case
        result = check_feasibility(100_000, 0.10, future(3.1), "moderate")
        assert result["feasibility_level"] == "feasible"

    def test_very_large_target_short_timeline_is_impossible(self):
        """₹50L in 20 days (< MIN_DAYS=30) is impossible regardless of risk."""
        deadline = date.today() + timedelta(days=20)
        result = check_feasibility(5_000_000, 0.10, deadline, "high")
        assert result["feasibility_level"] == "impossible"

    def test_below_30_days_is_impossible(self):
        """Any goal with <30 days remaining is impossible."""
        deadline = date.today() + timedelta(days=20)
        result = check_feasibility(10_000, 0.10, deadline, "low")
        assert result["feasibility_level"] == "impossible"

    def test_aggressive_target_moderate_risk_is_challenging_or_impossible(self):
        """A 2-year moderate-risk goal is below the feasible threshold (3yr) → challenging."""
        # moderate min_feasible=3yr, min_challenging=1yr; 2yr → between → challenging
        result = check_feasibility(500_000, 0.10, future(2), "moderate")
        assert result["feasibility_level"] in ("challenging", "impossible")


    # ── Required capital ────────────────────────────────────────────────────

    def test_required_capital_is_less_than_target_value(self):
        """Required capital should always be less than target_value (compound growth effect)."""
        result = check_feasibility(500_000, 0.10, future(5), "moderate")
        assert result["required_capital"] < result["target_value"]

    def test_target_value_includes_profit_buffer(self):
        """target_value should equal target_amount * (1 + profit_buffer)."""
        result = check_feasibility(100_000, 0.10, future(3), "moderate")
        assert result["target_value"] == pytest.approx(110_000.0)

    def test_profit_needed_equals_target_value(self):
        """profit_needed (from ₹0 investment) should equal target_value."""
        result = check_feasibility(200_000, 0.15, future(4), "high")
        assert result["profit_needed"] == pytest.approx(result["target_value"])

    # ── Option A: Extend deadline ────────────────────────────────────────────

    def test_option_a_returns_later_deadline(self):
        """Option A should suggest a new deadline later than the original."""
        deadline = future(1)
        result = check_feasibility(1_000_000, 0.10, deadline, "moderate")
        opt_a = result["options"]["option_a"]
        new_date = date.fromisoformat(opt_a["new_deadline"])
        assert new_date > deadline

    def test_option_a_has_positive_extra_years(self):
        """Extra years in Option A must be a positive integer."""
        result = check_feasibility(2_000_000, 0.10, future(2), "low")
        assert result["options"]["option_a"]["extra_years"] >= 1

    # ── Option B: Lower target ──────────────────────────────────────────────

    def test_option_b_lower_target_is_less_than_original(self):
        """Option B's suggested target must be less than the original target_amount."""
        result = check_feasibility(5_000_000, 0.10, future(2), "moderate")
        opt_b = result["options"]["option_b"]
        assert opt_b["new_target_amount"] < 5_000_000

    def test_option_b_target_value_less_than_original(self):
        """Option B's new_target_value must be less than original target_value."""
        result = check_feasibility(2_000_000, 0.10, future(3), "low")
        assert result["options"]["option_b"]["new_target_value"] < result["target_value"]

    # ── Option C: Upgrade risk ──────────────────────────────────────────────

    def test_option_c_low_upgrades_to_moderate(self):
        """Low risk goal → Option C should suggest moderate."""
        result = check_feasibility(500_000, 0.10, future(3), "low")
        assert result["options"]["option_c"]["new_risk"] == "moderate"

    def test_option_c_moderate_upgrades_to_high(self):
        """Moderate risk goal → Option C should suggest high."""
        result = check_feasibility(500_000, 0.10, future(2), "moderate")
        assert result["options"]["option_c"]["new_risk"] == "high"

    def test_option_c_high_risk_not_available(self):
        """High risk is the ceiling — Option C should not be available."""
        result = check_feasibility(500_000, 0.10, future(2), "high")
        assert result["options"]["option_c"]["available"] is False

    # ── Structural checks ────────────────────────────────────────────────────

    def test_result_has_all_required_keys(self):
        """check_feasibility must return all expected keys."""
        result = check_feasibility(300_000, 0.10, future(3), "moderate")
        required = {
            "feasibility_level", "required_capital", "profit_needed",
            "target_value", "days_remaining", "years", "summary", "options"
        }
        assert required.issubset(result.keys())

    def test_options_has_three_entries(self):
        """options dict must contain option_a, option_b, option_c."""
        result = check_feasibility(300_000, 0.10, future(3), "moderate")
        assert set(result["options"].keys()) == {"option_a", "option_b", "option_c"}

    def test_summary_is_non_empty_string(self):
        result = check_feasibility(100_000, 0.10, future(3), "moderate")
        assert isinstance(result["summary"], str) and len(result["summary"]) > 0
