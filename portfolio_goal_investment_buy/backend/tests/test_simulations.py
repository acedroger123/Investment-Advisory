"""
Tests for services/monte_carlo.py and services/stress_testing.py
"""
import pytest
import sys
import types
from datetime import date, timedelta
from unittest.mock import patch, MagicMock

# ── Explicit import of shared fakes from conftest ──────────────────────────
from conftest import FakeGoal, SmartFakeDB

# ── Stub modules that won't exist in the test environment ─────────────────
for _mod in ("database.models", "database.db", "services.market_data", "config"):
    if _mod not in sys.modules:
        sys.modules[_mod] = types.ModuleType(_mod)

_config = sys.modules["config"]
if not hasattr(_config, "settings"):
    _config.settings = MagicMock(MC_SIMULATIONS=500)


# ══════════════════════════════════════════════════════════════════════════
# MonteCarloService
# ══════════════════════════════════════════════════════════════════════════

class TestMonteCarloService:

    def _run(self, goal=None, current_value=5000, holdings=None,
             num_simulations=200):
        from services.monte_carlo import MonteCarloService
        goal = goal or FakeGoal(
            target_value=10_000,
            deadline=date.today() + timedelta(days=365)
        )
        db = SmartFakeDB(goals=[goal])
        holdings = holdings or [{"symbol": "AAPL"}]
        with patch("services.monte_carlo.PortfolioService") as ps:
            ps.calculate_portfolio_value.return_value = {
                "total_current_value": current_value
            }
            ps.get_holdings.return_value = holdings
            return MonteCarloService.run_simulation(db, goal.id, num_simulations)

    def test_goal_not_found_returns_error(self):
        from services.monte_carlo import MonteCarloService
        db = SmartFakeDB(goals=[])
        result = MonteCarloService.run_simulation(db, 999)
        assert "error" in result

    def test_no_holdings_returns_error(self):
        result = self._run(holdings=[])
        assert "error" in result

    def test_zero_portfolio_value_returns_error(self):
        result = self._run(current_value=0)
        assert "error" in result

    def test_past_deadline_returns_error(self):
        goal = FakeGoal(deadline=date.today() - timedelta(days=1))
        result = self._run(goal=goal)
        assert "error" in result

    def test_result_has_required_keys(self):
        result = self._run()
        for key in ("success_probability", "outcomes", "risk_level",
                    "num_simulations", "histogram"):
            assert key in result, f"Missing key: {key}"

    def test_success_probability_between_0_and_100(self):
        result = self._run()
        assert 0 <= result["success_probability"] <= 100

    def test_outcomes_worst_le_expected_le_best(self):
        result = self._run()
        o = result["outcomes"]
        assert o["worst_case"] <= o["expected"] <= o["best_case"]

    def test_risk_level_valid_string(self):
        result = self._run()
        assert result["risk_level"] in {"LOW", "MODERATE", "HIGH"}

    def test_histogram_bin_edges_one_more_than_counts(self):
        result = self._run()
        counts = result["histogram"]["counts"]
        edges = result["histogram"]["bin_edges"]
        assert len(edges) == len(counts) + 1

    def test_very_high_target_gives_low_success(self):
        goal = FakeGoal(target_value=1_000_000,
                        deadline=date.today() + timedelta(days=30))
        result = self._run(goal=goal, current_value=1000, num_simulations=300)
        assert result["success_probability"] < 50

    def test_target_already_met_gives_high_success(self):
        goal = FakeGoal(target_value=1000,
                        deadline=date.today() + timedelta(days=365))
        result = self._run(goal=goal, current_value=100_000, num_simulations=300)
        assert result["success_probability"] > 80

    def test_disclaimer_present_and_non_empty(self):
        result = self._run()
        assert "disclaimer" in result
        assert len(result["disclaimer"]) > 0

    def test_num_simulations_respected(self):
        result = self._run(num_simulations=123)
        assert result["num_simulations"] == 123


# ══════════════════════════════════════════════════════════════════════════
# StressTestingService
# ══════════════════════════════════════════════════════════════════════════

class TestStressTestingService:

    def _run(self, goal=None, current_value=10_000):
        from services.stress_testing import StressTestingService
        goal = goal or FakeGoal(
            target_value=20_000,
            risk_preference="moderate",
            deadline=date.today() + timedelta(days=200)
        )
        db = SmartFakeDB(goals=[goal])
        with patch("services.stress_testing.PortfolioService") as ps:
            ps.calculate_portfolio_value.return_value = {
                "total_current_value": current_value,
                "days_remaining": max(0, (goal.deadline - date.today()).days),
            }
            return StressTestingService.run_stress_test(db, goal.id)

    def test_goal_not_found_returns_error(self):
        from services.stress_testing import StressTestingService
        db = SmartFakeDB(goals=[])
        result = StressTestingService.run_stress_test(db, 999)
        assert "error" in result

    def test_zero_portfolio_value_returns_error(self):
        result = self._run(current_value=0)
        assert "error" in result

    def test_three_scenarios_returned(self):
        result = self._run()
        assert len(result["stress_test_results"]) == 3

    def test_scenario_names_present(self):
        result = self._run()
        names = {s["scenario"] for s in result["stress_test_results"]}
        assert "10% Market Drop" in names
        assert "20% Market Drop" in names
        assert "35% Market Crash" in names

    def test_stressed_value_less_than_original(self):
        result = self._run()
        for s in result["stress_test_results"]:
            assert s["stressed_value"] < s["original_value"]

    def test_loss_equals_original_minus_stressed(self):
        result = self._run(current_value=10_000)
        for s in result["stress_test_results"]:
            assert s["loss"] == pytest.approx(
                s["original_value"] - s["stressed_value"], rel=1e-5
            )

    def test_10pct_drop_loses_correct_amount(self):
        result = self._run(current_value=10_000)
        mild = next(s for s in result["stress_test_results"]
                    if s["drop_percentage"] == 10)
        assert mild["loss"] == pytest.approx(1000.0)

    def test_new_progress_in_valid_range(self):
        result = self._run()
        for s in result["stress_test_results"]:
            assert 0 <= s["new_progress"] <= 100

    def test_recommendation_present_and_non_empty(self):
        result = self._run()
        assert "recommendation" in result
        assert len(result["recommendation"]) > 0

    def test_resilient_portfolio_recommendation(self):
        from services.stress_testing import StressTestingService
        results = [{"drop_percentage": 20, "new_progress": 90}]
        msg = StressTestingService._get_recommendation(results, "moderate")
        assert "resilient" in msg.lower()

    def test_moderate_low_risk_recommendation(self):
        from services.stress_testing import StressTestingService
        results = [{"drop_percentage": 20, "new_progress": 65}]
        msg = StressTestingService._get_recommendation(results, "low")
        assert "equity" in msg.lower() or "exposure" in msg.lower()

    def test_high_vulnerability_recommendation(self):
        from services.stress_testing import StressTestingService
        results = [{"drop_percentage": 20, "new_progress": 20}]
        msg = StressTestingService._get_recommendation(results, "moderate")
        assert any(w in msg.lower() for w in ("vulnerable", "diversif", "extending"))

    def test_missing_20pct_scenario_returns_unable(self):
        from services.stress_testing import StressTestingService
        results = [{"drop_percentage": 10, "new_progress": 80}]
        msg = StressTestingService._get_recommendation(results, "moderate")
        assert "unable" in msg.lower()

    def test_past_deadline_does_not_crash(self):
        goal = FakeGoal(
            target_value=20_000,
            deadline=date.today(),
            risk_preference="moderate"
        )
        result = self._run(goal=goal, current_value=5_000)
        assert "stress_test_results" in result
