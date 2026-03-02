"""
Unit Tests — newtestone suite
Stock Portfolio Advisory System

Tests individual functions and logic units in complete isolation using mocks
where external dependencies (DB, market data) are involved.
"""
import pytest
from datetime import date, timedelta
from unittest.mock import patch, MagicMock
import sys
import os

# ── Path setup ────────────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/backend")


# =============================================================================
# GoalFeasibility Service — pure-function units
# =============================================================================

class TestGoalFeasibilityConstants:
    """Unit tests for RISK_BENCHMARKS constants in goal_feasibility module."""

    def test_risk_benchmarks_keys_exist(self):
        """All three risk tiers must be present in RISK_BENCHMARKS."""
        from services.goal_feasibility import RISK_BENCHMARKS

        assert "low" in RISK_BENCHMARKS
        assert "moderate" in RISK_BENCHMARKS
        assert "high" in RISK_BENCHMARKS

    def test_risk_benchmarks_expected_returns_ascending(self):
        """Expected returns should increase: low < moderate < high."""
        from services.goal_feasibility import RISK_BENCHMARKS

        assert RISK_BENCHMARKS["low"]["expected"] < RISK_BENCHMARKS["moderate"]["expected"]
        assert RISK_BENCHMARKS["moderate"]["expected"] < RISK_BENCHMARKS["high"]["expected"]

    def test_risk_benchmarks_max_gte_expected(self):
        """Max return must be >= expected return for every tier."""
        from services.goal_feasibility import RISK_BENCHMARKS

        for tier, vals in RISK_BENCHMARKS.items():
            assert vals["max"] >= vals["expected"], f"Failed for tier: {tier}"

    def test_risk_tiers_order(self):
        """RISK_TIERS list must be ordered low → moderate → high."""
        from services.goal_feasibility import RISK_TIERS

        assert RISK_TIERS == ["low", "moderate", "high"]


class TestCheckFeasibilityUnit:
    """Unit tests for check_feasibility() return structure and values."""

    def _call(self, years=5, risk="moderate", target=500_000, buffer=0.10):
        from services.goal_feasibility import check_feasibility

        deadline = date.today() + timedelta(days=int(years * 365))
        return check_feasibility(
            target_amount=target,
            profit_buffer=buffer,
            deadline=deadline,
            risk_preference=risk,
        )

    def test_returns_dict_with_required_keys(self):
        result = self._call()
        required_keys = {
            "feasibility_level", "required_capital", "profit_needed",
            "required_return_pct", "target_value", "days_remaining",
            "years", "risk_preference", "summary", "options",
        }
        assert required_keys.issubset(result.keys())

    def test_target_value_equals_amount_times_buffer(self):
        result = self._call(target=100_000, buffer=0.20)
        assert result["target_value"] == pytest.approx(120_000, rel=1e-6)

    def test_long_timeline_returns_feasible(self):
        """10-year timeline for any risk should be feasible."""
        for risk in ["low", "moderate", "high"]:
            result = self._call(years=10, risk=risk)
            assert result["feasibility_level"] == "feasible", f"Failed for risk={risk}"

    def test_very_short_timeline_returns_impossible(self):
        from services.goal_feasibility import check_feasibility

        deadline = date.today() + timedelta(days=10)  # < MIN_DAYS (30)
        result = check_feasibility(500_000, 0.10, deadline, "high")
        assert result["feasibility_level"] == "impossible"

    def test_tiny_goal_always_feasible(self):
        """A goal requiring < ₹25,000 capital should always be feasible."""
        from services.goal_feasibility import check_feasibility

        # target=5000, short deadline → tiny goal shortcut triggers
        deadline = date.today() + timedelta(days=60)
        result = check_feasibility(5_000, 0.0, deadline, "low")
        assert result["feasibility_level"] == "feasible"

    def test_options_dict_has_three_keys(self):
        result = self._call()
        assert set(result["options"].keys()) == {"option_a", "option_b", "option_c"}

    def test_required_capital_is_positive(self):
        result = self._call()
        assert result["required_capital"] > 0

    def test_profit_needed_equals_target_value(self):
        result = self._call(target=200_000, buffer=0.15)
        assert result["profit_needed"] == pytest.approx(result["target_value"], rel=1e-6)

    def test_fallback_unknown_risk_uses_moderate(self):
        """Unknown risk_preference should fall back to moderate benchmarks."""
        from services.goal_feasibility import check_feasibility, RISK_BENCHMARKS

        deadline = date.today() + timedelta(days=365 * 4)
        result_unknown = check_feasibility(500_000, 0.10, deadline, "ultra")
        result_moderate = check_feasibility(500_000, 0.10, deadline, "moderate")

        assert result_unknown["required_return_pct"] == result_moderate["required_return_pct"]


class TestOptionExtendDeadlineUnit:
    """Unit tests for _option_extend_deadline() helper."""

    def test_returns_required_keys(self):
        from services.goal_feasibility import _option_extend_deadline

        opt = _option_extend_deadline(
            target_value=500_000,
            expected_return=0.14,
            max_return=0.20,
            today=date.today(),
            current_deadline=date.today() + timedelta(days=365),
            risk_preference="moderate",
        )
        assert "label" in opt
        assert "new_deadline" in opt
        assert "extra_years" in opt

    def test_extra_years_is_positive_integer(self):
        from services.goal_feasibility import _option_extend_deadline

        opt = _option_extend_deadline(
            target_value=500_000,
            expected_return=0.14,
            max_return=0.20,
            today=date.today(),
            current_deadline=date.today() + timedelta(days=365),
            risk_preference="moderate",
        )
        assert isinstance(opt["extra_years"], int)
        assert opt["extra_years"] >= 1

    def test_already_feasible_suggests_one_extra_year(self):
        """If goal already meets feasibility threshold, suggest +1 year buffer."""
        from services.goal_feasibility import _option_extend_deadline

        opt = _option_extend_deadline(
            target_value=500_000,
            expected_return=0.14,
            max_return=0.20,
            today=date.today(),
            current_deadline=date.today() + timedelta(days=365 * 5),
            risk_preference="moderate",  # threshold=3 yr, current=5 yr → already feasible
        )
        assert opt["extra_years"] == 1


class TestOptionLowerTargetUnit:
    """Unit tests for _option_lower_target() helper."""

    def test_new_target_less_than_original(self):
        from services.goal_feasibility import _option_lower_target

        opt = _option_lower_target(
            target_value=500_000,
            profit_buffer=0.10,
            expected_return=0.14,
            max_return=0.20,
            years=2.0,
            days_remaining=730,
        )
        assert opt["new_target_amount"] < 500_000 / (1 + 0.10)

    def test_returns_required_keys(self):
        from services.goal_feasibility import _option_lower_target

        opt = _option_lower_target(500_000, 0.10, 0.14, 0.20, 3.0, 1095)
        assert "label" in opt
        assert "new_target_amount" in opt
        assert "new_target_value" in opt


class TestOptionUpgradeRiskUnit:
    """Unit tests for _option_upgrade_risk() helper."""

    def test_low_risk_upgrades_to_moderate(self):
        from services.goal_feasibility import _option_upgrade_risk

        opt = _option_upgrade_risk(500_000, 3.0, 1095, "low")
        assert opt["new_risk"] == "moderate"
        assert opt["available"] is True

    def test_high_risk_no_upgrade_available(self):
        from services.goal_feasibility import _option_upgrade_risk

        opt = _option_upgrade_risk(500_000, 3.0, 1095, "high")
        assert opt["available"] is False

    def test_moderate_risk_upgrades_to_high(self):
        from services.goal_feasibility import _option_upgrade_risk

        opt = _option_upgrade_risk(500_000, 3.0, 1095, "moderate")
        assert opt["new_risk"] == "high"
        assert opt["available"] is True


# =============================================================================
# SmartBuy — pure helper unit tests
# =============================================================================

class TestSmartBuyHelpers:
    """Unit tests for _fit_label, _conviction, _compute_score, _apply_sector_cap."""

    # ── _fit_label ──────────────────────────────────────────────────────────

    def test_fit_label_high(self):
        from services.smart_buy import _fit_label
        assert _fit_label(75) == "High Fit"
        assert _fit_label(100) == "High Fit"

    def test_fit_label_moderate(self):
        from services.smart_buy import _fit_label
        assert _fit_label(55) == "Moderate Fit"
        assert _fit_label(74) == "Moderate Fit"

    def test_fit_label_low(self):
        from services.smart_buy import _fit_label
        assert _fit_label(0) == "Low Fit"
        assert _fit_label(54) == "Low Fit"

    # ── _conviction ──────────────────────────────────────────────────────────

    def test_conviction_strong(self):
        from services.smart_buy import _conviction
        assert _conviction(75) == "STRONG"
        assert _conviction(90) == "STRONG"

    def test_conviction_moderate(self):
        from services.smart_buy import _conviction
        assert _conviction(55) == "MODERATE"
        assert _conviction(74) == "MODERATE"

    def test_conviction_watch(self):
        from services.smart_buy import _conviction
        assert _conviction(0) == "WATCH"
        assert _conviction(54) == "WATCH"

    # ── _compute_score ───────────────────────────────────────────────────────

    def test_score_is_integer(self):
        from services.smart_buy import _compute_score
        score = _compute_score(
            dip_pct=-10.0, sector="Technology", required_growth=15.0,
            symbol="TCS.NS", existing_weights={}, max_weight=30.0,
        )
        assert isinstance(score, int)

    def test_score_range_0_to_100(self):
        from services.smart_buy import _compute_score

        for dip in [-3.0, -10.0, -20.0, -30.0]:
            score = _compute_score(
                dip_pct=dip, sector="Technology", required_growth=15.0,
                symbol="NEW.NS", existing_weights={}, max_weight=30.0,
            )
            assert 0 <= score <= 100, f"Score {score} out of range for dip={dip}"

    def test_zero_required_growth_gives_full_accel_score(self):
        """When required_growth <= 0, acceleration component should be maxed."""
        from services.smart_buy import _compute_score

        score_zero = _compute_score(
            dip_pct=-10.0, sector="Technology", required_growth=0.0,
            symbol="NEW.NS", existing_weights={}, max_weight=30.0,
        )
        score_positive = _compute_score(
            dip_pct=-10.0, sector="Technology", required_growth=30.0,
            symbol="NEW.NS", existing_weights={}, max_weight=30.0,
        )
        assert score_zero >= score_positive

    def test_overweight_stock_penalised(self):
        """Stock at/above max_weight should get 0 diversification score."""
        from services.smart_buy import _compute_score

        score_overweight = _compute_score(
            dip_pct=-10.0, sector="Technology", required_growth=15.0,
            symbol="TCS.NS", existing_weights={"TCS.NS": 35.0}, max_weight=30.0,
        )
        score_fresh = _compute_score(
            dip_pct=-10.0, sector="Technology", required_growth=15.0,
            symbol="TCS.NS", existing_weights={}, max_weight=30.0,
        )
        assert score_fresh > score_overweight

    # ── _apply_sector_cap ────────────────────────────────────────────────────

    def test_sector_cap_limits_per_sector(self):
        from services.smart_buy import _apply_sector_cap, SECTOR_RESULT_CAP

        candidates = [
            {"symbol": f"T{i}.NS", "sector": "Technology", "goal_fit_score": 80 - i}
            for i in range(5)
        ]
        result = _apply_sector_cap(candidates, 8)
        tech_count = sum(1 for r in result if r["sector"] == "Technology")
        assert tech_count <= SECTOR_RESULT_CAP

    def test_sector_cap_respects_max_results(self):
        from services.smart_buy import _apply_sector_cap

        candidates = [
            {"symbol": f"S{i}.NS", "sector": f"Sector{i}", "goal_fit_score": 90 - i}
            for i in range(20)
        ]
        result = _apply_sector_cap(candidates, 5)
        assert len(result) <= 5

    def test_sector_cap_empty_input(self):
        from services.smart_buy import _apply_sector_cap
        assert _apply_sector_cap([], 8) == []

    # ── _get_risk_universe ───────────────────────────────────────────────────

    def test_low_risk_universe_is_subset(self):
        from services.smart_buy import _get_risk_universe, SMART_BUY_WATCHLIST, _LARGE_CAP_SYMBOLS

        low_universe = _get_risk_universe("low")
        all_symbols = {s["symbol"] for s in SMART_BUY_WATCHLIST}
        low_symbols = {s["symbol"] for s in low_universe}
        assert low_symbols.issubset(all_symbols)
        assert all(s in _LARGE_CAP_SYMBOLS for s in low_symbols)

    def test_moderate_high_universe_is_full(self):
        from services.smart_buy import _get_risk_universe, SMART_BUY_WATCHLIST

        for risk in ["moderate", "high"]:
            universe = _get_risk_universe(risk)
            assert len(universe) == len(SMART_BUY_WATCHLIST)


# =============================================================================
# Database Models — unit tests
# =============================================================================

class TestGoalModelUnit:
    """Unit tests for Goal model methods."""

    def test_calculate_target_value_with_buffer(self):
        from database.models import Goal

        goal = Goal(id=1, user_id=1, name="Test", target_amount=100_000.0,
                    profit_buffer=0.25, deadline=date.today() + timedelta(days=365))
        assert goal.calculate_target_value() == pytest.approx(125_000.0, rel=1e-9)

    def test_calculate_target_value_zero_buffer(self):
        from database.models import Goal

        goal = Goal(id=1, user_id=1, name="Test", target_amount=80_000.0,
                    profit_buffer=0.0, deadline=date.today() + timedelta(days=365))
        assert goal.calculate_target_value() == 80_000.0

    def test_goal_name_stored_correctly(self):
        from database.models import Goal

        goal = Goal(id=1, user_id=1, name="Retirement Fund",
                    target_amount=1_000_000.0, deadline=date.today() + timedelta(days=3650))
        assert goal.name == "Retirement Fund"


class TestTransactionModelUnit:
    """Unit tests for Transaction model methods."""

    def test_calculate_total_value(self):
        from database.models import Transaction

        txn = Transaction(id=1, goal_id=1, stock_symbol="RELIANCE",
                          transaction_type="BUY", quantity=200, price=2500.0,
                          transaction_date=date.today() - timedelta(days=1))
        assert txn.calculate_total_value() == 500_000.0

    def test_repr_contains_symbol_and_type(self):
        from database.models import Transaction

        txn = Transaction(id=1, goal_id=1, stock_symbol="TCS",
                          transaction_type="BUY", quantity=50, price=3200.0,
                          transaction_date=date.today() - timedelta(days=1))
        repr_str = repr(txn)
        assert "TCS" in repr_str
        assert "BUY" in repr_str


class TestEnumsUnit:
    """Unit tests for domain enums."""

    def test_risk_preference_values(self):
        from database.models import RiskPreference

        assert RiskPreference.LOW.value == "low"
        assert RiskPreference.MODERATE.value == "moderate"
        assert RiskPreference.HIGH.value == "high"

    def test_goal_status_values(self):
        from database.models import GoalStatus

        assert GoalStatus.ACTIVE.value == "active"
        assert GoalStatus.ACHIEVED.value == "achieved"
        assert GoalStatus.CANCELLED.value == "cancelled"

    def test_transaction_type_values(self):
        from database.models import TransactionType

        assert TransactionType.BUY.value == "buy"
        assert TransactionType.SELL.value == "sell"


# =============================================================================
# Pure Calculation Logic (no external dependencies)
# =============================================================================

class TestFinancialCalculationsUnit:
    """Unit tests for common financial formulas used across services."""

    def test_weighted_average_price_two_batches(self):
        total_cost = (100 * 150.0) + (50 * 180.0)
        total_qty = 150
        avg = total_cost / total_qty
        assert avg == pytest.approx(160.0, rel=1e-9)

    def test_profit_pct_gain(self):
        invested = 100 * 200.0
        current = 100 * 240.0
        pct = (current - invested) / invested * 100
        assert pct == pytest.approx(20.0, rel=1e-9)

    def test_profit_pct_loss(self):
        invested = 100 * 300.0
        current = 100 * 270.0
        pct = (current - invested) / invested * 100
        assert pct == pytest.approx(-10.0, rel=1e-9)

    def test_goal_progress_percentage(self):
        progress = (65_000.0 / 100_000.0) * 100
        assert progress == 65.0

    def test_annualised_return_doubling(self):
        """Money doubling in 1 year → 100 % return."""
        current, target, days = 50_000.0, 100_000.0, 365
        req_return = ((target / current) ** (365 / days) - 1) * 100
        assert req_return == pytest.approx(100.0, rel=0.01)

    def test_allocation_weights_sum_to_100(self):
        values = [50_000.0, 30_000.0, 20_000.0]
        total = sum(values)
        weights = [(v / total) * 100 for v in values]
        assert sum(weights) == pytest.approx(100.0, rel=1e-9)
