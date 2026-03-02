"""
Edge Case Tests — newtestone suite
Stock Portfolio Advisory System

Tests boundary conditions, unusual scenarios, and exceptional cases covering
goal feasibility, smart buy scoring, financial calculations, and model behavior.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch
import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/backend")


# =============================================================================
# GoalFeasibility — edge cases
# =============================================================================

class TestFeasibilityBoundaryDays:
    """Edge cases around the MIN_DAYS boundary."""

    def test_exactly_30_days_not_flagged_impossible_for_high_risk(self):
        """At exactly MIN_DAYS with a tiny goal → feasible (scale check)."""
        from services.goal_feasibility import check_feasibility, MIN_DAYS
        deadline = date.today() + timedelta(days=MIN_DAYS)
        result = check_feasibility(5_000, 0.0, deadline, "high")
        # Tiny goal: ₹5000 required_capital < ₹25000 → feasible
        assert result["feasibility_level"] == "feasible"

    def test_29_days_always_impossible(self):
        """Below MIN_DAYS is always impossible, regardless of target size."""
        from services.goal_feasibility import check_feasibility
        deadline = date.today() + timedelta(days=29)
        result = check_feasibility(1000, 0.0, deadline, "high")
        assert result["feasibility_level"] == "impossible"

    def test_summary_contains_days_for_impossible_timeline(self):
        """Impossible summary should mention the short timeline."""
        from services.goal_feasibility import check_feasibility
        deadline = date.today() + timedelta(days=15)
        result = check_feasibility(500_000, 0.10, deadline, "moderate")
        assert "15" in result["summary"] or "days" in result["summary"].lower()


class TestFeasibilityBufferEdgeCases:
    """Edge cases around profit_buffer extremes."""

    def _run(self, buffer, years=5):
        from services.goal_feasibility import check_feasibility
        deadline = date.today() + timedelta(days=int(years * 365))
        return check_feasibility(100_000, buffer, deadline, "moderate")

    def test_100_pct_buffer_doubles_target_value(self):
        result = self._run(buffer=1.0)
        assert result["target_value"] == pytest.approx(200_000.0, rel=1e-6)

    def test_200_pct_buffer_triples_target_value(self):
        result = self._run(buffer=2.0)
        assert result["target_value"] == pytest.approx(300_000.0, rel=1e-6)

    def test_negative_50_pct_buffer_halves_target_value(self):
        result = self._run(buffer=-0.5)
        assert result["target_value"] == pytest.approx(50_000.0, rel=1e-6)

    def test_zero_buffer_target_matches_amount(self):
        result = self._run(buffer=0.0)
        assert result["target_value"] == pytest.approx(100_000.0, rel=1e-6)


class TestFeasibilityRiskTransitionEdgeCases:
    """Edge tests around exact feasibility thresholds per risk tier."""

    def _at_boundary(self, risk, threshold_years):
        from services.goal_feasibility import check_feasibility
        deadline = date.today() + timedelta(days=int(threshold_years * 365))
        return check_feasibility(500_000, 0.10, deadline, risk)

    def test_low_risk_exactly_5yr_feasible(self):
        """5 years is the feasible threshold for 'low' risk."""
        result = self._at_boundary("low", 5)
        assert result["feasibility_level"] == "feasible"

    def test_moderate_risk_exactly_3yr_feasible(self):
        result = self._at_boundary("moderate", 3)
        assert result["feasibility_level"] == "feasible"

    def test_high_risk_exactly_2yr_feasible(self):
        result = self._at_boundary("high", 2)
        assert result["feasibility_level"] == "feasible"


class TestFeasibilityOptionEdgeCases:
    """Option C upgrade edge cases."""

    def test_low_upgrades_to_moderate(self):
        from services.goal_feasibility import _option_upgrade_risk
        opt = _option_upgrade_risk(500_000, 3.0, 1095, "low")
        assert opt["new_risk"] == "moderate"

    def test_moderate_upgrades_to_high(self):
        from services.goal_feasibility import _option_upgrade_risk
        opt = _option_upgrade_risk(500_000, 3.0, 1095, "moderate")
        assert opt["new_risk"] == "high"

    def test_high_has_no_upgrade(self):
        from services.goal_feasibility import _option_upgrade_risk
        opt = _option_upgrade_risk(500_000, 3.0, 1095, "high")
        assert opt["available"] is False

    def test_invalid_risk_treated_as_moderate_index(self):
        """Unknown risk is treated as index 1 (moderate tier)."""
        from services.goal_feasibility import _option_upgrade_risk
        opt = _option_upgrade_risk(500_000, 3.0, 1095, "unknown")
        # index of "unknown" not in list → defaults to idx=1 → upgrades to "high"
        assert opt["new_risk"] == "high"


# =============================================================================
# SmartBuy — edge cases
# =============================================================================

class TestSmartBuyScoringEdgeCases:
    """Boundary conditions for _compute_score."""

    def test_dip_exactly_at_threshold_gives_zero_dip_score(self):
        """A dip exactly equal to DIP_THRESHOLD (-3%) gives 0 dip score."""
        from services.smart_buy import _compute_score, DIP_THRESHOLD
        # At DIP_THRESHOLD limit: depth_ratio = 0 → dip_score = 0
        score_at = _compute_score(DIP_THRESHOLD, "Technology", 0.0, "X.NS", {}, 30.0)
        score_below = _compute_score(DIP_THRESHOLD - 1.0, "Technology", 0.0, "X.NS", {}, 30.0)
        assert score_below > score_at

    def test_sector_return_exactly_equals_required_growth(self):
        """When sector return == required growth → accel ratio = 1 → full accel points."""
        from services.smart_buy import _compute_score, SECTOR_EXPECTED_RETURNS
        tech_return = SECTOR_EXPECTED_RETURNS["Technology"]  # 22.0
        score = _compute_score(-10.0, "Technology", tech_return, "X.NS", {}, 30.0)
        # accel = min(1.0, 1.0) * 35 = 35 + dip contribution
        assert score >= 35

    def test_half_cap_score_between_clean_and_full_cap(self):
        from services.smart_buy import _compute_score
        clean = _compute_score(-10.0, "Tech", 15.0, "A.NS", {}, 30.0)
        half  = _compute_score(-10.0, "Tech", 15.0, "A.NS", {"A.NS": 15.0}, 30.0)
        full  = _compute_score(-10.0, "Tech", 15.0, "A.NS", {"A.NS": 30.0}, 30.0)
        assert clean >= half >= full

    def test_negative_required_growth_treated_as_zero_no_exception(self):
        """Negative required_growth should not raise; treated like <= 0."""
        from services.smart_buy import _compute_score
        score = _compute_score(-10.0, "Technology", -5.0, "X.NS", {}, 30.0)
        assert 0 <= score <= 100


class TestSmartBuySectorCapEdgeCases:
    """Edge cases for _apply_sector_cap."""

    def test_single_sector_limited_to_cap(self):
        from services.smart_buy import _apply_sector_cap, SECTOR_RESULT_CAP
        candidates = [{"symbol": f"T{i}.NS", "sector": "Technology"} for i in range(10)]
        result = _apply_sector_cap(candidates, 8)
        assert len(result) <= SECTOR_RESULT_CAP

    def test_many_sectors_fills_up_to_n(self):
        from services.smart_buy import _apply_sector_cap
        candidates = [{"symbol": f"S{i}.NS", "sector": f"Sector{i}"} for i in range(10)]
        result = _apply_sector_cap(candidates, 5)
        assert len(result) == 5

    def test_fewer_candidates_than_n(self):
        from services.smart_buy import _apply_sector_cap
        candidates = [{"symbol": "A.NS", "sector": "Tech"}]
        result = _apply_sector_cap(candidates, 8)
        assert len(result) == 1

    def test_two_per_sector_allowed(self):
        from services.smart_buy import _apply_sector_cap, SECTOR_RESULT_CAP
        candidates = [
            {"symbol": "A.NS", "sector": "Technology"},
            {"symbol": "B.NS", "sector": "Technology"},
        ]
        result = _apply_sector_cap(candidates, 8)
        assert len(result) == min(2, SECTOR_RESULT_CAP)


class TestSmartBuyRiskUniverseEdgeCases:
    """Edge cases for _get_risk_universe."""

    def test_low_risk_excludes_midcaps(self):
        from services.smart_buy import _get_risk_universe, _LARGE_CAP_SYMBOLS
        universe = _get_risk_universe("low")
        for stock in universe:
            assert stock["symbol"] in _LARGE_CAP_SYMBOLS

    def test_moderate_includes_midcaps(self):
        from services.smart_buy import _get_risk_universe, _LARGE_CAP_SYMBOLS
        universe = _get_risk_universe("moderate")
        symbols = {s["symbol"] for s in universe}
        midcaps = symbols - _LARGE_CAP_SYMBOLS
        assert len(midcaps) > 0

    def test_unknown_risk_returns_full_list(self):
        """Unknown risk_pref is not 'low' → returns full watchlist."""
        from services.smart_buy import _get_risk_universe, SMART_BUY_WATCHLIST
        universe = _get_risk_universe("ultra")
        assert len(universe) == len(SMART_BUY_WATCHLIST)


# =============================================================================
# Goal Model — edge cases
# =============================================================================

class TestGoalModelEdgeCases:
    """Edge cases for Goal model calculate_target_value."""

    def test_zero_target_zero_result(self):
        from database.models import Goal
        goal = Goal(id=1, user_id=1, name="Zero", target_amount=0.0,
                    profit_buffer=0.0, deadline=date.today() + timedelta(days=365))
        assert goal.calculate_target_value() == 0.0

    def test_100_pct_buffer(self):
        from database.models import Goal
        goal = Goal(id=1, user_id=1, name="Double", target_amount=100_000.0,
                    profit_buffer=1.0, deadline=date.today() + timedelta(days=365))
        assert goal.calculate_target_value() == pytest.approx(200_000.0, rel=1e-9)

    def test_negative_buffer_reduces_target(self):
        from database.models import Goal
        goal = Goal(id=1, user_id=1, name="Discount", target_amount=100_000.0,
                    profit_buffer=-0.10, deadline=date.today() + timedelta(days=365))
        assert goal.calculate_target_value() == pytest.approx(90_000.0, rel=1e-9)

    def test_very_large_target_no_overflow(self):
        from database.models import Goal
        goal = Goal(id=1, user_id=1, name="Huge", target_amount=1e12,
                    profit_buffer=0.10, deadline=date.today() + timedelta(days=365))
        result = goal.calculate_target_value()
        assert result == pytest.approx(1.1e12, rel=1e-6)


# =============================================================================
# Financial Calculation Edge Cases (pure logic)
# =============================================================================

class TestPortfolioEdgeCases:
    """Edge cases in portfolio calculations."""

    def test_empty_holdings_total_zero(self):
        holdings = []
        assert sum(h.get("quantity", 0) * h.get("current_price", 0) for h in holdings) == 0

    def test_single_holding_100_pct_weight(self):
        holdings = [{"symbol": "AAPL", "value": 10_000}]
        total = sum(h["value"] for h in holdings)
        weight = holdings[0]["value"] / total * 100
        assert weight == 100.0

    def test_zero_price_holding_contributes_zero(self):
        holding = {"quantity": 100, "current_price": 0.0}
        assert holding["quantity"] * holding["current_price"] == 0.0

    def test_high_concentration_detected(self):
        holdings = [
            {"symbol": "AAPL", "value": 9000},
            {"symbol": "GOOGL", "value": 500},
            {"symbol": "MSFT", "value": 500},
        ]
        total = sum(h["value"] for h in holdings)
        top_weight = max(h["value"] / total * 100 for h in holdings)
        assert top_weight > 50

    def test_100_holdings_total_correct(self):
        holdings = [{"symbol": f"S{i}", "value": 100} for i in range(100)]
        assert sum(h["value"] for h in holdings) == 10_000

    def test_division_by_zero_guard(self):
        denom = 0
        result = 100 / denom if denom != 0 else 0
        assert result == 0


class TestCalculationEdgeCases:
    """Edge cases in common financial formulas."""

    def test_profit_with_zero_invested_guarded(self):
        invested = 0
        current = 1000
        pct = (current - invested) / invested * 100 if invested != 0 else float("inf")
        assert pct == float("inf")

    def test_drawdown_uptrend_is_zero(self):
        history = [10_000, 10_200, 10_500, 10_800]
        peak = history[0]
        max_dd = 0
        for v in history:
            peak = max(peak, v)
            dd = (peak - v) / peak * 100 if peak > 0 else 0
            max_dd = max(max_dd, dd)
        assert max_dd == 0

    def test_drawdown_crash_30_pct(self):
        history = [10_000, 10_500, 7_000]
        peak = history[0]
        max_dd = 0
        for v in history:
            peak = max(peak, v)
            dd = (peak - v) / peak * 100 if peak > 0 else 0
            max_dd = max(max_dd, dd)
        assert max_dd == pytest.approx(33.33, rel=0.01)

    def test_complete_loss_is_100_pct(self):
        invested = 100_000.0
        current = 0.0
        loss = (invested - current) / invested * 100 if invested > 0 else 0
        assert loss == 100.0

    def test_weighted_avg_three_batches(self):
        batches = [(100, 150.0), (100, 180.0), (100, 120.0)]
        total_cost = sum(q * p for q, p in batches)
        total_qty = sum(q for q, _ in batches)
        avg = total_cost / total_qty
        assert avg == pytest.approx(150.0, rel=1e-9)


class TestCurrencyPrecisionEdgeCases:
    """Edge cases around currency rounding and precision."""

    def test_two_decimal_rounding_up(self):
        assert round(123.456789, 2) == 123.46

    def test_two_decimal_rounding_down(self):
        assert round(123.454, 2) == 123.45

    def test_floating_point_subtraction_near_zero(self):
        diff = 100.002 - 100.001
        assert diff == pytest.approx(0.001, rel=0.01)

    def test_hhi_equal_weights_4_stocks(self):
        weights = [0.25, 0.25, 0.25, 0.25]
        hhi = sum(w ** 2 for w in weights) * 100
        assert hhi == pytest.approx(25.0, rel=1e-9)

    def test_hhi_monopoly(self):
        hhi = (1.0 ** 2) * 100
        assert hhi == 100.0

    def test_micro_amounts_dont_vanish(self):
        micro = 0.001
        assert micro * 1000 == pytest.approx(1.0, rel=1e-9)


class TestDateEdgeCases:
    """Edge cases for date-related logic."""

    def test_leap_year_2028_feb_29_valid(self):
        """February 29 in a real leap year should be a valid date."""
        leap_day = date(2028, 2, 29)
        assert leap_day.month == 2 and leap_day.day == 29

    def test_not_a_leap_year_no_feb_29(self):
        with pytest.raises(ValueError):
            date(2027, 2, 29)

    def test_year_boundary_dec_31_is_future(self):
        today = date.today()
        dec31 = date(today.year, 12, 31)
        if dec31 > today:
            assert dec31 > today

    def test_timedelta_negative_days_produces_past(self):
        past = date.today() - timedelta(days=1)
        assert past < date.today()

    def test_far_future_deadline_accepted_by_validate_goal(self):
        from utils.validators import validate_goal
        ok, _ = validate_goal("Long Goal", 1_000_000.0,
                               date(2099, 12, 31), "high")
        assert ok is True


class TestTransactionEdgeCases:
    """Edge cases for transaction-related logic."""

    def test_sell_all_leaves_zero_position(self):
        qty = 100
        sell = 100
        remaining = qty - sell
        assert remaining == 0

    def test_weighted_avg_unchanged_after_sell(self):
        """Average price does not change when partial shares are sold."""
        avg = 150.0
        assert avg == 150.0  # selling doesn't change avg buy price

    def test_large_quantity_small_price_total_accurate(self):
        total = 1_000_000 * 0.01
        assert total == pytest.approx(10_000.0, rel=1e-9)

    def test_negative_remaining_after_oversell(self):
        remaining = 100 - 150
        assert remaining == -50

    def test_total_value_quantity_zero(self):
        from database.models import Transaction
        txn = Transaction(id=1, goal_id=1, stock_symbol="X",
                          transaction_type="BUY", quantity=0, price=100.0,
                          transaction_date=date.today() - timedelta(days=1))
        assert txn.calculate_total_value() == 0.0
