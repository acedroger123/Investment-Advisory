from conftest import FakeGoal, FakeHolding, FakeTransaction, SmartFakeDB, FakeDB, FakeQuery
"""
Tests for services/portfolio_service.py

Strategy:
  - Mock MarketDataService (external calls) and the DB session.
  - Use FakeGoal / FakeHolding / FakeTransaction from conftest.py (auto-injected).
  - Every public method gets a happy-path + edge-case suite.
"""
import pytest
from datetime import date, datetime, timedelta
from unittest.mock import patch, MagicMock
import sys
import types

# ---------------------------------------------------------------------------
# Stub out modules that won't be present in the test environment
# ---------------------------------------------------------------------------
for _mod in ("database.models", "database.db", "services.market_data", "config"):
    if _mod not in sys.modules:
        sys.modules[_mod] = types.ModuleType(_mod)

# Provide a minimal settings stub so monte_carlo / portfolio_service don't crash
_config = sys.modules["config"]
if not hasattr(_config, "settings"):
    _config.settings = MagicMock(MC_SIMULATIONS=500)


# ══════════════════════════════════════════════════════════════════════════
# get_holdings
# ══════════════════════════════════════════════════════════════════════════

class TestGetHoldings:

    def _run(self, holdings, prices, goal_id=1):
        from services.portfolio_service import PortfolioService
        db = SmartFakeDB(holdings=holdings)
        with patch("services.portfolio_service.MarketDataService") as m:
            m.get_multiple_current_prices.return_value = prices
            return PortfolioService.get_holdings(db, goal_id)

    def test_empty_holdings_returns_empty_list(self):
        result = self._run([], {})
        assert result == []

    def test_single_holding_computed_correctly(self):
        h = FakeHolding(quantity=10, avg_buy_price=100.0, total_invested=1000.0,
                        stock_symbol="AAPL")
        result = self._run([h], {"AAPL": 150.0})
        assert len(result) == 1
        r = result[0]
        assert r["current_price"] == 150.0
        assert r["current_value"] == 1500.0
        assert r["unrealized_pnl"] == 500.0
        assert r["unrealized_pnl_pct"] == pytest.approx(50.0, rel=1e-3)

    def test_price_unavailable_gives_zero_value(self):
        h = FakeHolding(stock_symbol="UNKNOWN", quantity=5, total_invested=500.0)
        result = self._run([h], {})
        assert result[0]["current_price"] is None
        assert result[0]["current_value"] == 0

    def test_multiple_holdings_batched(self):
        h1 = FakeHolding(id=1, stock_symbol="AAPL", quantity=10,
                         avg_buy_price=100, total_invested=1000)
        h2 = FakeHolding(id=2, stock_symbol="GOOG", quantity=5,
                         avg_buy_price=200, total_invested=1000)
        result = self._run([h1, h2], {"AAPL": 110.0, "GOOG": 210.0})
        assert len(result) == 2

    def test_zero_total_invested_pnl_pct_is_zero(self):
        h = FakeHolding(stock_symbol="TSLA", quantity=1,
                        avg_buy_price=0, total_invested=0)
        result = self._run([h], {"TSLA": 100.0})
        assert result[0]["unrealized_pnl_pct"] == 0

    def test_negative_unrealized_pnl(self):
        h = FakeHolding(stock_symbol="AAPL", quantity=10,
                        avg_buy_price=200, total_invested=2000)
        result = self._run([h], {"AAPL": 150.0})
        assert result[0]["unrealized_pnl"] == pytest.approx(-500.0)
        assert result[0]["unrealized_pnl_pct"] < 0

    def test_rounding_applied_to_two_decimals(self):
        h = FakeHolding(stock_symbol="AAPL", quantity=3,
                        avg_buy_price=100.333, total_invested=300.999)
        result = self._run([h], {"AAPL": 111.111})
        assert result[0]["avg_buy_price"] == round(100.333, 2)
        assert result[0]["current_price"] == round(111.111, 2)

    def test_batch_price_fetch_called_exactly_once(self):
        h1 = FakeHolding(id=1, stock_symbol="AAPL", quantity=1, total_invested=100)
        h2 = FakeHolding(id=2, stock_symbol="MSFT", quantity=1, total_invested=100)
        from services.portfolio_service import PortfolioService
        db = SmartFakeDB(holdings=[h1, h2])
        with patch("services.portfolio_service.MarketDataService") as m:
            m.get_multiple_current_prices.return_value = {"AAPL": 100, "MSFT": 200}
            PortfolioService.get_holdings(db, 1)
            assert m.get_multiple_current_prices.call_count == 1


# ══════════════════════════════════════════════════════════════════════════
# calculate_portfolio_value
# ══════════════════════════════════════════════════════════════════════════

class TestCalculatePortfolioValue:

    def _holding_dict(self, invested, current_value, unrealized_pnl):
        return {
            "total_invested": invested,
            "current_value": current_value,
            "unrealized_pnl": unrealized_pnl,
        }

    def _run(self, goal, precomputed_holdings):
        from services.portfolio_service import PortfolioService
        db = SmartFakeDB(goals=[goal], transactions=[])
        with patch.object(PortfolioService, "get_holdings",
                          return_value=precomputed_holdings):
            return PortfolioService.calculate_portfolio_value(
                db, goal.id, precomputed_holdings
            )

    def test_goal_not_found_returns_error(self):
        from services.portfolio_service import PortfolioService
        db = SmartFakeDB(goals=[])
        result = PortfolioService.calculate_portfolio_value(db, 99)
        assert "error" in result

    def test_basic_sums_correct(self):
        goal = FakeGoal(target_value=20_000,
                        deadline=date.today() + timedelta(days=200))
        holdings = [
            self._holding_dict(1000, 1200, 200),
            self._holding_dict(2000, 1800, -200),
        ]
        result = self._run(goal, holdings)
        assert result["total_invested"] == pytest.approx(3000.0)
        assert result["total_current_value"] == pytest.approx(3000.0)
        assert result["total_unrealized_pnl"] == pytest.approx(0.0)

    def test_progress_capped_at_100(self):
        goal = FakeGoal(target_value=1000,
                        deadline=date.today() + timedelta(days=30))
        holdings = [self._holding_dict(1500, 2000, 500)]
        result = self._run(goal, holdings)
        assert result["progress_percentage"] == 100.0

    def test_amount_remaining_never_negative(self):
        goal = FakeGoal(target_value=1000,
                        deadline=date.today() + timedelta(days=30))
        holdings = [self._holding_dict(2000, 5000, 3000)]
        result = self._run(goal, holdings)
        assert result["amount_remaining"] >= 0

    def test_days_remaining_never_negative(self):
        goal = FakeGoal(target_value=10_000,
                        deadline=date.today() - timedelta(days=5))
        holdings = [self._holding_dict(500, 600, 100)]
        result = self._run(goal, holdings)
        assert result["days_remaining"] == 0

    def test_empty_holdings_all_zeros(self):
        goal = FakeGoal(target_value=10_000,
                        deadline=date.today() + timedelta(days=100))
        result = self._run(goal, [])
        assert result["total_invested"] == 0
        assert result["total_current_value"] == 0
        assert result["holdings_count"] == 0

    def test_pnl_percentage_calculated_from_invested(self):
        goal = FakeGoal(target_value=10_000,
                        deadline=date.today() + timedelta(days=100))
        holdings = [self._holding_dict(1000, 1100, 100)]
        result = self._run(goal, holdings)
        assert result["pnl_percentage"] == pytest.approx(10.0, rel=1e-3)

    def test_growth_needed_zero_when_no_days_left(self):
        goal = FakeGoal(target_value=5000, deadline=date.today())
        holdings = [self._holding_dict(1000, 2000, 1000)]
        result = self._run(goal, holdings)
        assert result["annual_growth_needed"] == 0


# ══════════════════════════════════════════════════════════════════════════
# get_asset_allocation
# ══════════════════════════════════════════════════════════════════════════

class TestGetAssetAllocation:

    def _run(self, holdings):
        from services.portfolio_service import PortfolioService
        db = SmartFakeDB()
        return PortfolioService.get_asset_allocation(db, 1, holdings)

    def test_empty_holdings_returns_empty(self):
        assert self._run([]) == []

    def test_all_zero_values_returns_empty(self):
        holdings = [{"symbol": "AAPL", "name": "Apple", "current_value": 0}]
        assert self._run(holdings) == []

    def test_single_holding_is_100_percent(self):
        holdings = [{"symbol": "AAPL", "name": "Apple", "current_value": 1000}]
        result = self._run(holdings)
        assert len(result) == 1
        assert result[0]["weight"] == pytest.approx(100.0, rel=1e-3)

    def test_weights_sum_to_100(self):
        holdings = [
            {"symbol": "AAPL", "name": "Apple", "current_value": 500},
            {"symbol": "GOOG", "name": "Google", "current_value": 300},
            {"symbol": "MSFT", "name": "Microsoft", "current_value": 200},
        ]
        result = self._run(holdings)
        total_weight = sum(r["weight"] for r in result)
        assert total_weight == pytest.approx(100.0, rel=1e-2)

    def test_sorted_descending_by_weight(self):
        holdings = [
            {"symbol": "SMALL", "name": "Small", "current_value": 100},
            {"symbol": "BIG", "name": "Big", "current_value": 900},
        ]
        result = self._run(holdings)
        assert result[0]["symbol"] == "BIG"
        assert result[1]["symbol"] == "SMALL"

    def test_none_current_value_excluded(self):
        holdings = [
            {"symbol": "AAPL", "name": "Apple", "current_value": 1000},
            {"symbol": "BAD", "name": "Bad", "current_value": None},
        ]
        result = self._run(holdings)
        symbols = [r["symbol"] for r in result]
        assert "BAD" not in symbols

    def test_equal_weights_two_holdings(self):
        holdings = [
            {"symbol": "A", "name": "A", "current_value": 500},
            {"symbol": "B", "name": "B", "current_value": 500},
        ]
        result = self._run(holdings)
        assert result[0]["weight"] == pytest.approx(50.0)
        assert result[1]["weight"] == pytest.approx(50.0)


# ══════════════════════════════════════════════════════════════════════════
# update_holding_on_transaction
# ══════════════════════════════════════════════════════════════════════════

class TestUpdateHoldingOnTransaction:

    def _run(self, db, goal_id=1, symbol="AAPL", stock_name="Apple",
             txn_type="BUY", quantity=10, price=150.0):
        from services.portfolio_service import PortfolioService
        return PortfolioService.update_holding_on_transaction(
            db, goal_id, symbol, stock_name, txn_type, quantity, price
        )

    def test_buy_creates_new_holding_when_none_exists(self):
        db = SmartFakeDB(holdings=[])
        self._run(db)
        assert len(db.added) == 1

    def test_buy_new_holding_correct_avg_price(self):
        db = SmartFakeDB(holdings=[])
        self._run(db)
        assert db.added[0].avg_buy_price == 150.0
        assert db.added[0].total_invested == 1500.0

    def test_buy_updates_existing_holding_quantity(self):
        existing = FakeHolding(stock_symbol="AAPL", goal_id=1,
                               quantity=10, avg_buy_price=100.0, total_invested=1000.0)
        db = SmartFakeDB(holdings=[existing])
        self._run(db, quantity=10, price=200.0)
        assert existing.quantity == 20

    def test_buy_updates_avg_price_correctly(self):
        # 10 @ $100 + 10 @ $200 => avg = $150
        existing = FakeHolding(stock_symbol="AAPL", goal_id=1,
                               quantity=10, avg_buy_price=100.0, total_invested=1000.0)
        db = SmartFakeDB(holdings=[existing])
        self._run(db, quantity=10, price=200.0)
        assert existing.avg_buy_price == pytest.approx(150.0)

    def test_sell_reduces_quantity(self):
        existing = FakeHolding(stock_symbol="AAPL", goal_id=1,
                               quantity=10, avg_buy_price=100.0, total_invested=1000.0)
        db = SmartFakeDB(holdings=[existing])
        self._run(db, txn_type="SELL", quantity=4, price=150.0)
        assert existing.quantity == 6

    def test_sell_all_shares_deletes_holding(self):
        existing = FakeHolding(stock_symbol="AAPL", goal_id=1,
                               quantity=10, avg_buy_price=100.0, total_invested=1000.0)
        db = SmartFakeDB(holdings=[existing])
        self._run(db, txn_type="SELL", quantity=10, price=150.0)
        assert existing in db.deleted

    def test_sell_updates_total_invested(self):
        existing = FakeHolding(stock_symbol="AAPL", goal_id=1,
                               quantity=10, avg_buy_price=100.0, total_invested=1000.0)
        db = SmartFakeDB(holdings=[existing])
        self._run(db, txn_type="SELL", quantity=5, price=120.0)
        assert existing.total_invested == pytest.approx(500.0)

    def test_db_committed_after_transaction(self):
        db = SmartFakeDB(holdings=[])
        self._run(db)
        assert db.committed is True


# ══════════════════════════════════════════════════════════════════════════
# calculate_drawdown
# ══════════════════════════════════════════════════════════════════════════

class TestCalculateDrawdown:

    def _run(self, history):
        from services.portfolio_service import PortfolioService
        db = SmartFakeDB()
        return PortfolioService.calculate_drawdown(db, 1, history=history)

    def test_empty_history_returns_zeros(self):
        result = self._run([])
        assert result["max_drawdown"] == 0
        assert result["current_drawdown"] == 0
        assert result["drawdown_data"] == []

    def test_single_point_returns_zeros(self):
        result = self._run([{"date": "2024-01-01", "value": 1000}])
        assert result["max_drawdown"] == 0

    def test_monotonic_increase_zero_drawdown(self):
        history = [
            {"date": "2024-01-01", "value": 1000},
            {"date": "2024-01-02", "value": 1100},
            {"date": "2024-01-03", "value": 1200},
        ]
        result = self._run(history)
        assert result["max_drawdown"] == 0.0

    def test_full_crash_100_percent_drawdown(self):
        history = [
            {"date": "2024-01-01", "value": 1000},
            {"date": "2024-01-02", "value": 0},
        ]
        result = self._run(history)
        assert result["max_drawdown"] == pytest.approx(100.0)

    def test_partial_drawdown_calculated_correctly(self):
        # Peak 1000, trough 800 → 20% drawdown
        history = [
            {"date": "2024-01-01", "value": 1000},
            {"date": "2024-01-02", "value": 900},
            {"date": "2024-01-03", "value": 800},
            {"date": "2024-01-04", "value": 950},
        ]
        result = self._run(history)
        assert result["max_drawdown"] == pytest.approx(20.0, rel=1e-3)

    def test_current_drawdown_uses_running_peak(self):
        history = [
            {"date": "2024-01-01", "value": 1000},
            {"date": "2024-01-02", "value": 800},
            {"date": "2024-01-03", "value": 900},
        ]
        result = self._run(history)
        # (1000 - 900) / 1000 = 10%
        assert result["current_drawdown"] == pytest.approx(10.0, rel=1e-3)

    def test_drawdown_data_length_matches_history(self):
        history = [{"date": f"2024-01-0{i}", "value": 1000 - i * 10}
                   for i in range(1, 6)]
        result = self._run(history)
        assert len(result["drawdown_data"]) == len(history)


# ══════════════════════════════════════════════════════════════════════════
# calculate_risk_metrics
# ══════════════════════════════════════════════════════════════════════════

class TestCalculateRiskMetrics:

    def _make_history(self, values):
        base = date(2024, 1, 1)
        return [{"date": (base + timedelta(days=i)).isoformat(), "value": v}
                for i, v in enumerate(values)]

    def _run(self, history, allocation=None):
        from services.portfolio_service import PortfolioService
        db = SmartFakeDB()
        return PortfolioService.calculate_risk_metrics(
            db, 1, history=history, allocation=allocation or []
        )

    def test_empty_history_returns_zeros(self):
        result = self._run([])
        assert result["volatility"] == 0
        assert result["sharpe_ratio"] == 0
        assert result["risk_level"] == "N/A"

    def test_flat_returns_zero_volatility(self):
        history = self._make_history([1000] * 30)
        result = self._run(history)
        assert result["volatility"] == pytest.approx(0.0, abs=1e-6)

    def test_risk_level_is_valid_string(self):
        history = self._make_history([1000 + i * 10 for i in range(50)])
        result = self._run(history)
        assert result["risk_level"] in {"LOW", "MODERATE", "HIGH"}

    def test_concentration_score_single_holding_is_100(self):
        history = self._make_history([1000, 1010, 1020])
        allocation = [{"symbol": "AAPL", "weight": 100}]
        result = self._run(history, allocation)
        assert result["concentration_score"] == pytest.approx(100.0, rel=1e-3)

    def test_diversification_score_equal_two_holdings(self):
        history = self._make_history([1000, 1010, 1020])
        allocation = [
            {"symbol": "AAPL", "weight": 50},
            {"symbol": "GOOG", "weight": 50},
        ]
        result = self._run(history, allocation)
        # HHI = 0.5^2 + 0.5^2 = 0.5 → diversity = 50
        assert result["diversification_score"] == pytest.approx(50.0, rel=1e-3)
