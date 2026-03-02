"""
Unit tests for the Smart Buy Recommendation Service scoring helpers.

The tests exercise ONLY the pure-Python scoring/labelling functions from
smart_buy.py so NO network calls or database connections are needed.
The heavy dependencies (yfinance, sqlalchemy, etc.) are stubbed at import
time using a conftest-compatible approach.
"""
import pytest
import sys
import types
import importlib
from unittest.mock import MagicMock


# ─────────────────────────────────────────────────────────────────────────
# Stub heavy transitive dependencies BEFORE importing services.smart_buy
# so that both the package __init__ and the module itself can be imported.
# ─────────────────────────────────────────────────────────────────────────

def _stub(name, **attrs):
    """Create or reuse a stub module with optional attribute assignments."""
    mod = sys.modules.get(name) or types.ModuleType(name)
    for k, v in attrs.items():
        setattr(mod, k, v)
    sys.modules[name] = mod
    return mod


# sqlalchemy stubs
sa = _stub("sqlalchemy")
sa_orm = _stub("sqlalchemy.orm")
sa_func = _stub("sqlalchemy.sql")
sa.Column = sa.Integer = sa.String = sa.Float = sa.Boolean = sa.DateTime = MagicMock
sa.Date = sa.ForeignKey = sa.BigInteger = sa.Enum = MagicMock
sa_orm.Session = MagicMock
sa_orm.relationship = MagicMock

# pydantic / fastapi
_stub("pydantic")
_stub("fastapi")
_stub("fastapi.middleware")
_stub("fastapi.middleware.cors")

# yfinance
_stub("yfinance")

# pandas — real pandas is likely installed, but just in case
try:
    import pandas  # noqa
except ImportError:
    _stub("pandas")

# database stubs
db_models = _stub("database.models")
db_models.StockPrice = MagicMock
db_models.Goal = MagicMock
db_models.Holding = MagicMock
db_models.Transaction = MagicMock
db_models.TransactionType = MagicMock
db_models.RiskPreference = MagicMock
db_models.GoalStatus = MagicMock
_stub("database")
_stub("database.db")

# config stub
config_mod = _stub("config")
config_mod.settings = MagicMock()

# Services stubs — prevent __init__.py from pulling in heavy modules
mds = _stub("services.market_data")
mds.MarketDataService = MagicMock()
ps = _stub("services.portfolio_service")
ps.PortfolioService = MagicMock()
rb = _stub("services.rebalancing")
rb.RebalancingService = MagicMock()
mc = _stub("services.monte_carlo")
mc.MonteCarloService = MagicMock()
st = _stub("services.stress_testing")
st.StressTestingService = MagicMock()
sc = _stub("services.scheduler")
sc.price_scheduler = MagicMock()
svc_pkg = _stub("services")
svc_pkg.MarketDataService = MagicMock()
svc_pkg.PortfolioService = MagicMock()
svc_pkg.RebalancingService = MagicMock()

# Now safely import the scoring helpers from smart_buy directly
import importlib.util, pathlib

_smart_buy_path = pathlib.Path(__file__).parent.parent / "services" / "smart_buy.py"
_spec = importlib.util.spec_from_file_location("_smart_buy_direct", _smart_buy_path)
_mod  = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

_compute_score        = _mod._compute_score
_fit_label            = _mod._fit_label
_conviction           = _mod._conviction
_build_reason         = _mod._build_reason
DIP_THRESHOLD         = _mod.DIP_THRESHOLD
MAX_DIP_FOR_FULL_SCORE = _mod.MAX_DIP_FOR_FULL_SCORE
SECTOR_EXPECTED_RETURNS = _mod.SECTOR_EXPECTED_RETURNS
RISK_MAX_WEIGHT       = _mod.RISK_MAX_WEIGHT


# ══════════════════════════════════════════════════════════════════════════
# Dip Detection constants
# ══════════════════════════════════════════════════════════════════════════

class TestDipThresholds:
    """Verify the dip filter constant values."""

    def test_dip_threshold_is_negative(self):
        assert DIP_THRESHOLD < 0

    def test_dip_threshold_is_3_pct(self):
        assert DIP_THRESHOLD == -3.0

    def test_max_dip_is_more_extreme_than_threshold(self):
        assert MAX_DIP_FOR_FULL_SCORE < DIP_THRESHOLD


# ══════════════════════════════════════════════════════════════════════════
# Scoring: Dip depth component (40 pts)
# ══════════════════════════════════════════════════════════════════════════

class TestDipDepthScoring:
    """The dip depth sub-score ranges 0-40."""

    def _score_dip_only(self, dip_pct):
        """Use _compute_score with neutral values for other dimensions."""
        return _compute_score(
            dip_pct=dip_pct,
            sector="Technology",   # expected 22% — above typical required_growth
            required_growth=0,     # 0 → full accel score (35 pts)
            symbol="TEST.NS",
            existing_weights={},   # not in portfolio → full div score (25 pts)
            max_weight=30.0,
        )

    def test_exactly_threshold_gives_minimum_dip_points(self):
        # At exactly DIP_THRESHOLD (-3%) the depth_ratio = 0 → dip_score = 0, total = 35+25 = 60
        score = self._score_dip_only(-3.0)
        assert score == pytest.approx(60, abs=2)

    def test_at_max_dip_gives_maximum_dip_points(self):
        # At -20% depth_ratio = 1 → dip_score = 40, total = 40+35+25 = 100
        score = self._score_dip_only(-20.0)
        assert score == pytest.approx(100, abs=2)

    def test_midpoint_dip_gives_mid_dip_points(self):
        # -11.5% is midpoint between -3 and -20, depth_ratio ≈ 0.5 → dip_score ≈ 20
        score = self._score_dip_only(-11.5)
        # total ≈ 20 + 35 + 25 = 80
        assert 75 <= score <= 85   # ≈ 20+35+25 = 80

    def test_dip_beyond_max_is_capped(self):
        score_at_20 = self._score_dip_only(-20.0)
        score_at_30 = self._score_dip_only(-30.0)
        assert score_at_20 == score_at_30

    def test_no_dip_gives_zero_dip_contribution(self):
        # 0% change — depth = 0 < abs(threshold) = 3, so dip_score = 0
        score = self._score_dip_only(0.0)
        assert score == pytest.approx(60, abs=2)  # 0+35+25


# ══════════════════════════════════════════════════════════════════════════
# Scoring: Goal acceleration component (35 pts)
# ══════════════════════════════════════════════════════════════════════════

class TestGoalAccelerationScoring:

    def _score_accel_only(self, sector, required_growth):
        """Fixed deep dip and empty portfolio so only accel varies."""
        return _compute_score(
            dip_pct=-20.0,
            sector=sector,
            required_growth=required_growth,
            symbol="TEST.NS",
            existing_weights={},
            max_weight=30.0,
        )

    def test_zero_required_growth_gives_full_accel(self):
        score = self._score_accel_only("Technology", 0)
        assert score == pytest.approx(100, abs=2)

    def test_sector_return_meets_required_gives_full_accel(self):
        # Technology = 22%, required = 20 → ratio > 1, capped → 35 pts
        score = self._score_accel_only("Technology", 20.0)
        assert score == pytest.approx(100, abs=2)

    def test_sector_return_below_required_reduces_accel(self):
        # Utilities = 10%, required = 20 → ratio = 0.5 → 17.5 pts
        score = self._score_accel_only("Utilities", 20.0)
        assert 80 <= score <= 85   # ≈ 40+17.5+25 = 82.5

    def test_unknown_sector_uses_fallback(self):
        fallback = SECTOR_EXPECTED_RETURNS["Unknown"]
        score = self._score_accel_only("Unknown", fallback)
        assert score == pytest.approx(100, abs=2)  # ratio = 1 → full accel


# ══════════════════════════════════════════════════════════════════════════
# Scoring: Diversification fit component (25 pts)
# ══════════════════════════════════════════════════════════════════════════

class TestDiversificationScoring:

    def _score_div(self, symbol, existing_weights, max_weight):
        return _compute_score(
            dip_pct=-20.0,
            sector="Technology",
            required_growth=0,
            symbol=symbol,
            existing_weights=existing_weights,
            max_weight=max_weight,
        )

    def test_not_in_portfolio_gives_full_div_score(self):
        score = self._score_div("NEW.NS", {}, 30.0)
        assert score == pytest.approx(100, abs=2)  # 40+35+25

    def test_at_cap_gives_zero_div_score(self):
        score = self._score_div("OVW.NS", {"OVW.NS": 30.0}, 30.0)
        assert score == pytest.approx(75, abs=2)   # 40+35+0

    def test_approaching_cap_gives_partial_div(self):
        # 80% of 30 = 24 → partial 12.5 pts
        score = self._score_div("APP.NS", {"APP.NS": 24.0}, 30.0)
        assert score == pytest.approx(87, abs=2)   # 40+35+12.5 ≈ 88

    def test_well_below_cap_gives_full_div(self):
        score = self._score_div("LOW.NS", {"LOW.NS": 5.0}, 30.0)
        assert score == pytest.approx(100, abs=2)


# ══════════════════════════════════════════════════════════════════════════
# Conviction & Label classification
# ══════════════════════════════════════════════════════════════════════════

class TestConvictionLabels:

    @pytest.mark.parametrize("score,expected", [
        (100, "STRONG"),
        (75,  "STRONG"),
        (74,  "MODERATE"),
        (55,  "MODERATE"),
        (54,  "WATCH"),
        (0,   "WATCH"),
    ])
    def test_conviction_boundaries(self, score, expected):
        assert _conviction(score) == expected

    @pytest.mark.parametrize("score,expected", [
        (75,  "High Fit"),
        (55,  "Moderate Fit"),
        (54,  "Low Fit"),
        (0,   "Low Fit"),
    ])
    def test_fit_label_boundaries(self, score, expected):
        assert _fit_label(score) == expected


# ══════════════════════════════════════════════════════════════════════════
# Reason builder
# ══════════════════════════════════════════════════════════════════════════

class TestReasonBuilder:

    def test_reason_contains_dip_pct(self):
        reason = _build_reason(-7.5, "Technology", 14.0, 80, "moderate", False)
        assert "7.5" in reason

    def test_reason_mentions_sector(self):
        reason = _build_reason(-8.0, "Healthcare", 14.0, 70, "moderate", False)
        assert "Healthcare" in reason

    def test_reason_notes_already_held(self):
        reason = _build_reason(-6.0, "Energy", 10.0, 60, "high", True)
        assert "portfolio" in reason.lower() or "concentration" in reason.lower()

    def test_reason_contains_risk_pref(self):
        reason = _build_reason(-9.0, "Technology", 18.0, 85, "high", False)
        assert "High" in reason

    def test_reason_on_track_goal(self):
        reason = _build_reason(-6.0, "Technology", 0.0, 90, "moderate", False)
        assert "on track" in reason.lower() or "opportunistic" in reason.lower()


# ══════════════════════════════════════════════════════════════════════════
# Sector expected returns registry
# ══════════════════════════════════════════════════════════════════════════

class TestSectorReturns:

    def test_all_returns_are_positive(self):
        for sector, ret in SECTOR_EXPECTED_RETURNS.items():
            assert ret > 0, f"{sector} has non-positive return"

    def test_technology_has_highest_or_tied_return(self):
        max_other = max(v for k, v in SECTOR_EXPECTED_RETURNS.items() if k != "Technology")
        assert SECTOR_EXPECTED_RETURNS["Technology"] >= max_other

    def test_utilities_has_low_return(self):
        assert SECTOR_EXPECTED_RETURNS["Utilities"] <= 12.0

    def test_unknown_fallback_exists(self):
        assert "Unknown" in SECTOR_EXPECTED_RETURNS


# ══════════════════════════════════════════════════════════════════════════
# Risk max weight constants
# ══════════════════════════════════════════════════════════════════════════

class TestRiskWeightConstants:

    def test_low_risk_most_restrictive(self):
        assert RISK_MAX_WEIGHT["low"] < RISK_MAX_WEIGHT["moderate"]

    def test_high_risk_least_restrictive(self):
        assert RISK_MAX_WEIGHT["high"] > RISK_MAX_WEIGHT["moderate"]

    def test_all_weights_positive(self):
        for k, v in RISK_MAX_WEIGHT.items():
            assert v > 0

    def test_all_three_risk_levels_present(self):
        assert set(RISK_MAX_WEIGHT.keys()) == {"low", "moderate", "high"}
