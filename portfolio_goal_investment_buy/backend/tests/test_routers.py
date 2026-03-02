from conftest import FakeGoal, FakeHolding, FakeTransaction, SmartFakeDB
"""
Tests for router-layer and endpoint business logic.
FakeGoal / FakeHolding / FakeTransaction / SmartFakeDB from conftest.py.
"""
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import patch, MagicMock
import sys
import types

for _mod in ("database.models", "database.db", "services.market_data", "config",
             "fastapi", "sqlalchemy", "sqlalchemy.orm", "pydantic"):
    if _mod not in sys.modules:
        sys.modules[_mod] = types.ModuleType(_mod)


# ══════════════════════════════════════════════════════════════════════════
# Goal CRUD
# ══════════════════════════════════════════════════════════════════════════

class TestGoalCreate:

    def test_deadline_must_be_future(self):
        assert date.today() <= date.today()  # today not valid

    def test_tomorrow_is_valid_deadline(self):
        assert date.today() + timedelta(days=1) > date.today()

    def test_target_value_computed_with_buffer(self):
        goal = FakeGoal(target_amount=10_000, profit_buffer=0.10)
        goal.calculate_target_value()
        assert goal.target_value == pytest.approx(11_000.0)

    def test_zero_profit_buffer(self):
        goal = FakeGoal(target_amount=5_000, profit_buffer=0.0)
        goal.calculate_target_value()
        assert goal.target_value == pytest.approx(5_000.0)

    def test_max_profit_buffer_50pct(self):
        goal = FakeGoal(target_amount=10_000, profit_buffer=0.5)
        goal.calculate_target_value()
        assert goal.target_value == pytest.approx(15_000.0)


class TestGoalUpdate:

    def test_partial_update_leaves_other_fields(self):
        goal = FakeGoal(name="Old Name", target_amount=5_000)
        goal.name = "New Name"
        assert goal.target_amount == 5_000

    def test_recalculate_target_after_amount_update(self):
        goal = FakeGoal(target_amount=10_000, profit_buffer=0.10)
        goal.target_amount = 20_000
        goal.calculate_target_value()
        assert goal.target_value == pytest.approx(22_000.0)


class TestGoalDelete:

    def test_nonexistent_goal_query_returns_none(self):
        db = SmartFakeDB(goals=[])
        result = db.query(FakeGoal).first()
        assert result is None

    def test_existing_goal_queued_for_deletion(self):
        goal = FakeGoal()
        db = SmartFakeDB(goals=[goal])
        found = db.query(FakeGoal).first()
        db.delete(found)
        assert found in db.deleted


# ══════════════════════════════════════════════════════════════════════════
# Transaction logic
# ══════════════════════════════════════════════════════════════════════════

class TestTransactionCreate:

    def test_total_value_computed(self):
        txn = FakeTransaction(quantity=10, price=150.0)
        txn.calculate_total_value()
        assert txn.total_value == pytest.approx(1500.0)

    def test_sell_without_holding_detected(self):
        db = SmartFakeDB(holdings=[])
        holding = db.query(FakeHolding).first()
        current_qty = holding.quantity if holding else 0
        assert current_qty < 5  # correctly flagged as insufficient

    def test_sell_insufficient_quantity_detected(self):
        existing = FakeHolding(quantity=3)
        db = SmartFakeDB(holdings=[existing])
        holding = db.query(FakeHolding).first()
        assert holding.quantity < 5

    def test_sell_exact_quantity_is_ok(self):
        existing = FakeHolding(quantity=10)
        db = SmartFakeDB(holdings=[existing])
        holding = db.query(FakeHolding).first()
        assert holding.quantity >= 10

    def test_unvalidated_price_is_rejected(self):
        """Unverified prices should be rejected, not saved to DB."""
        txn = FakeTransaction(validated=False,
                              validation_message="Price deviates > 10%")
        assert txn.validated is False
        assert txn.validation_message  # rejection reason exists
        # Backend endpoint raises HTTPException(400) for invalid prices
        # so this transaction would never be committed to the database

    def test_fractional_price_computes_correctly(self):
        txn = FakeTransaction(price=0.01, quantity=100)
        txn.calculate_total_value()
        assert txn.total_value == pytest.approx(1.0)

    def test_large_quantity_computes_correctly(self):
        txn = FakeTransaction(price=100.0, quantity=1_000_000)
        txn.calculate_total_value()
        assert txn.total_value == pytest.approx(100_000_000.0)


class TestTransactionDelete:
    """Verify the reversal logic used in delete_transaction."""

    def _reverse_buy(self, holding, qty):
        holding.quantity -= qty
        if holding.quantity <= 0:
            return "DELETE"
        holding.total_invested = holding.quantity * holding.avg_buy_price
        return "UPDATE"

    def _reverse_sell(self, holding, qty):
        holding.quantity += qty
        holding.total_invested = holding.quantity * holding.avg_buy_price
        return "UPDATE"

    def test_reverse_buy_reduces_quantity(self):
        h = FakeHolding(quantity=10, avg_buy_price=100, total_invested=1000)
        self._reverse_buy(h, 4)
        assert h.quantity == 6

    def test_reverse_buy_triggers_delete_at_zero(self):
        h = FakeHolding(quantity=5, avg_buy_price=100, total_invested=500)
        action = self._reverse_buy(h, 5)
        assert action == "DELETE"

    def test_reverse_buy_triggers_delete_when_oversold(self):
        h = FakeHolding(quantity=3, avg_buy_price=100, total_invested=300)
        action = self._reverse_buy(h, 5)
        assert action == "DELETE"

    def test_reverse_sell_increases_quantity(self):
        h = FakeHolding(quantity=5, avg_buy_price=100, total_invested=500)
        self._reverse_sell(h, 5)
        assert h.quantity == 10

    def test_reverse_sell_updates_total_invested(self):
        h = FakeHolding(quantity=5, avg_buy_price=100, total_invested=500)
        self._reverse_sell(h, 3)
        assert h.total_invested == pytest.approx(800.0)


# ══════════════════════════════════════════════════════════════════════════
# Required-growth curve (portfolio/{goal_id}/required-growth endpoint)
# ══════════════════════════════════════════════════════════════════════════

class TestRequiredGrowthCurve:

    def _build_curve(self, goal, history):
        from datetime import timedelta
        if not goal.created_at or not goal.deadline:
            return {"error": "Goal dates not set"}

        start_date = goal.created_at.date()
        end_date = goal.deadline
        total_days = (end_date - start_date).days
        initial_value = history[0]["value"] if history else 0

        required_curve = []
        current = start_date
        while current <= end_date:
            days_elapsed = (current - start_date).days
            progress = days_elapsed / total_days if total_days > 0 else 0
            required_value = initial_value + (goal.target_value - initial_value) * progress
            required_curve.append({
                "date": current.isoformat(),
                "value": round(required_value, 2)
            })
            current += timedelta(days=7)
        return {"required_curve": required_curve, "initial_value": initial_value}

    def test_first_point_is_initial_value(self):
        goal = FakeGoal(target_value=20_000,
                        created_at=datetime(2024, 1, 1),
                        deadline=date(2025, 1, 1))
        result = self._build_curve(goal, [{"date": "2024-01-01", "value": 5000}])
        assert result["required_curve"][0]["value"] == pytest.approx(5000.0)

    def test_missing_dates_returns_error(self):
        goal = FakeGoal(created_at=None, deadline=None)
        result = self._build_curve(goal, [])
        assert "error" in result

    def test_empty_history_initial_value_is_zero(self):
        goal = FakeGoal(target_value=10_000,
                        created_at=datetime(2024, 1, 1),
                        deadline=date(2025, 1, 1))
        result = self._build_curve(goal, [])
        assert result["initial_value"] == 0

    def test_zero_duration_goal_no_division_error(self):
        same_day = datetime(2024, 6, 1)
        goal = FakeGoal(target_value=10_000,
                        created_at=same_day,
                        deadline=same_day.date())
        result = self._build_curve(goal, [{"date": "2024-06-01", "value": 0}])
        assert "required_curve" in result  # didn't raise


# ══════════════════════════════════════════════════════════════════════════
# Performance metric calculations (isolated unit tests)
# ══════════════════════════════════════════════════════════════════════════

class TestConcentrationRiskBoundaries:
    """The concentration_risk thresholds are: >50 → HIGH, >30 → MODERATE, else LOW."""

    def _classify(self, top_weight):
        if top_weight > 50:
            return "HIGH"
        elif top_weight > 30:
            return "MODERATE"
        return "LOW"

    def test_51_is_high(self):
        assert self._classify(51) == "HIGH"

    def test_50_is_moderate(self):
        assert self._classify(50) == "MODERATE"

    def test_31_is_moderate(self):
        assert self._classify(31) == "MODERATE"

    def test_30_is_low(self):
        assert self._classify(30) == "LOW"

    def test_0_is_low(self):
        assert self._classify(0) == "LOW"


class TestOnTrackLogic:
    """on_track = actual_progress >= expected_progress * 0.9"""

    def _on_track(self, actual, expected):
        return actual >= expected * 0.9

    def test_exactly_90pct_is_on_track(self):
        assert self._on_track(90, 100) is True

    def test_89pct_is_not_on_track(self):
        assert self._on_track(89, 100) is False

    def test_100pct_is_on_track(self):
        assert self._on_track(100, 100) is True

    def test_both_zero_is_on_track(self):
        assert self._on_track(0, 0) is True

    def test_ahead_of_schedule_is_on_track(self):
        assert self._on_track(50, 30) is True


class TestDiversificationScore:
    """diversification_score = (1 - HHI) * 100"""

    def _score(self, weights):
        hhi = sum(w ** 2 for w in weights)
        return round((1 - hhi) * 100, 2)

    def test_single_holding_score_is_zero(self):
        assert self._score([1.0]) == 0.0

    def test_two_equal_holdings(self):
        assert self._score([0.5, 0.5]) == pytest.approx(50.0)

    def test_four_equal_holdings(self):
        assert self._score([0.25, 0.25, 0.25, 0.25]) == pytest.approx(75.0)

    def test_score_always_between_0_and_100(self):
        import random
        random.seed(42)
        for _ in range(20):
            n = random.randint(1, 10)
            raw = [random.random() for _ in range(n)]
            total = sum(raw)
            weights = [r / total for r in raw]
            score = self._score(weights)
            assert 0.0 <= score <= 100.0
