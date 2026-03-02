"""
Smart Buy Recommendation Service.

Identifies stocks that have experienced a meaningful price dip AND align
with the goal's risk profile, time horizon, and required annual growth rate
to accelerate goal achievement.

Algorithm overview
------------------
1. Load goal metadata (risk_preference, annual_growth_needed, portfolio allocation).
2. Scan a sector-balanced 40-stock watchlist (8+ industries represented).
3. Compute dip_pct = (current_price - price_5d_ago) / price_5d_ago * 100.
4. Keep only stocks whose dip_pct ≤ DIP_THRESHOLD (default -3 %).
5. Score each candidate (0-100) across three dimensions:
      a) Dip depth          (40 pts) – deeper dip → more buying opportunity
      b) Goal acceleration  (35 pts) – sector expected return vs required growth
      c) Diversification    (25 pts) – not overweight in portfolio
6. Label conviction: STRONG (≥75), MODERATE (≥55), WATCH (< 55).
7. Return top MAX_RESULTS sorted by score desc.
"""
from datetime import date, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session

from portfolio_backend.database.models import Goal
from portfolio_backend.services.market_data import MarketDataService
from portfolio_backend.services.portfolio_service import PortfolioService

# ─────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────
DIP_THRESHOLD = -3.0           # minimum dip % to qualify (lowered for wider coverage)
MAX_DIP_FOR_FULL_SCORE = -20.0 # dip beyond this gets capped at full dip points
MAX_RESULTS = 8

# Sector-balanced watchlist — 40 NSE stocks across 8+ industries
# Ensures no single sector can dominate recommendations.
SMART_BUY_WATCHLIST = [
    # ── Technology (5) ────────────────────────────────────────────────
    {"symbol": "TCS.NS",        "name": "Tata Consultancy Services"},
    {"symbol": "INFY.NS",       "name": "Infosys Limited"},
    {"symbol": "WIPRO.NS",      "name": "Wipro Limited"},
    {"symbol": "HCLTECH.NS",    "name": "HCL Technologies"},
    {"symbol": "TECHM.NS",      "name": "Tech Mahindra"},
    # ── Financial Services (6) ────────────────────────────────────────
    {"symbol": "HDFCBANK.NS",   "name": "HDFC Bank"},
    {"symbol": "ICICIBANK.NS",  "name": "ICICI Bank"},
    {"symbol": "SBIN.NS",       "name": "State Bank of India"},
    {"symbol": "KOTAKBANK.NS",  "name": "Kotak Mahindra Bank"},
    {"symbol": "AXISBANK.NS",   "name": "Axis Bank"},
    {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance"},
    # ── Healthcare / Pharma (5) ───────────────────────────────────────
    {"symbol": "SUNPHARMA.NS",  "name": "Sun Pharmaceutical"},
    {"symbol": "DRREDDY.NS",    "name": "Dr. Reddy's Laboratories"},
    {"symbol": "CIPLA.NS",      "name": "Cipla Limited"},
    {"symbol": "DIVISLAB.NS",   "name": "Divi's Laboratories"},
    {"symbol": "APOLLOHOSP.NS", "name": "Apollo Hospitals"},
    # ── Consumer Defensive / FMCG (5) ────────────────────────────────
    {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever"},
    {"symbol": "ITC.NS",        "name": "ITC Limited"},
    {"symbol": "NESTLEIND.NS",  "name": "Nestle India"},
    {"symbol": "BRITANNIA.NS",  "name": "Britannia Industries"},
    {"symbol": "DABUR.NS",      "name": "Dabur India"},
    # ── Consumer Cyclical / Auto (5) ─────────────────────────────────
    {"symbol": "MARUTI.NS",     "name": "Maruti Suzuki"},
    {"symbol": "TATAMOTORS.NS", "name": "Tata Motors"},
    {"symbol": "BAJAJ-AUTO.NS", "name": "Bajaj Auto"},
    {"symbol": "EICHERMOT.NS",  "name": "Eicher Motors"},
    {"symbol": "HEROMOTOCO.NS", "name": "Hero MotoCorp"},
    # ── Energy / Oil & Gas (4) ───────────────────────────────────────
    {"symbol": "RELIANCE.NS",   "name": "Reliance Industries"},
    {"symbol": "ONGC.NS",       "name": "ONGC"},
    {"symbol": "POWERGRID.NS",  "name": "Power Grid Corporation"},
    {"symbol": "NTPC.NS",       "name": "NTPC Limited"},
    # ── Basic Materials / Metals (4) ─────────────────────────────────
    {"symbol": "TATASTEEL.NS",  "name": "Tata Steel"},
    {"symbol": "HINDALCO.NS",   "name": "Hindalco Industries"},
    {"symbol": "JSWSTEEL.NS",   "name": "JSW Steel"},
    {"symbol": "COALINDIA.NS",  "name": "Coal India"},
    # ── Industrials / Infra (3) ───────────────────────────────────────
    {"symbol": "LT.NS",         "name": "Larsen & Toubro"},
    {"symbol": "ADANIPORTS.NS", "name": "Adani Ports"},
    {"symbol": "SIEMENS.NS",    "name": "Siemens India"},
    # ── Communication Services (3) ───────────────────────────────────
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel"},
    {"symbol": "ASIANPAINT.NS", "name": "Asian Paints"},
    {"symbol": "ULTRACEMCO.NS", "name": "UltraTech Cement"},

    # ════════════════════════════════════════════════════════════════════
    # NIFTY MIDCAP 100 — 26 stocks across 8 sectors
    # ════════════════════════════════════════════════════════════════════

    # ── Midcap Technology / IT Services (4) ──────────────────────────
    {"symbol": "MPHASIS.NS",    "name": "Mphasis Limited"},
    {"symbol": "COFORGE.NS",    "name": "Coforge Limited"},
    {"symbol": "PERSISTENT.NS", "name": "Persistent Systems"},
    {"symbol": "LTIM.NS",       "name": "LTIMindtree"},

    # ── Midcap Financial Services (4) ────────────────────────────────
    {"symbol": "BANDHANBNK.NS", "name": "Bandhan Bank"},
    {"symbol": "FEDERALBNK.NS", "name": "Federal Bank"},
    {"symbol": "MUTHOOTFIN.NS", "name": "Muthoot Finance"},
    {"symbol": "CHOLAFIN.NS",   "name": "Cholamandalam Investment"},

    # ── Midcap Healthcare / Pharma (4) ───────────────────────────────
    {"symbol": "TORNTPHARM.NS", "name": "Torrent Pharmaceuticals"},
    {"symbol": "AUROPHARMA.NS", "name": "Aurobindo Pharma"},
    {"symbol": "ALKEM.NS",      "name": "Alkem Laboratories"},
    {"symbol": "LALPATHLAB.NS", "name": "Dr Lal PathLabs"},

    # ── Midcap Consumer / FMCG (3) ───────────────────────────────────
    {"symbol": "MARICO.NS",     "name": "Marico Limited"},
    {"symbol": "GODREJCP.NS",   "name": "Godrej Consumer Products"},
    {"symbol": "TRENT.NS",      "name": "Trent Limited"},

    # ── Midcap Auto / Auto Ancillaries (3) ───────────────────────────
    {"symbol": "BALKRISIND.NS", "name": "Balkrishna Industries"},
    {"symbol": "MOTHERSON.NS",  "name": "Samvardhana Motherson"},
    {"symbol": "ZOMATO.NS",     "name": "Zomato Limited"},

    # ── Midcap Industrials / Infra (4) ───────────────────────────────
    {"symbol": "CUMMINSIND.NS", "name": "Cummins India"},
    {"symbol": "ABB.NS",        "name": "ABB India"},
    {"symbol": "BHEL.NS",       "name": "Bharat Heavy Electricals"},
    {"symbol": "IRCTC.NS",      "name": "IRCTC"},

    # ── Midcap Chemicals / Materials (2) ─────────────────────────────
    {"symbol": "PIDILITIND.NS", "name": "Pidilite Industries"},
    {"symbol": "SRF.NS",        "name": "SRF Limited"},

    # ── Midcap Real Estate / Others (2) ──────────────────────────────
    {"symbol": "OBEROIRLTY.NS", "name": "Oberoi Realty"},
    {"symbol": "INDHOTEL.NS",   "name": "Indian Hotels (Taj)"},
]

# Expected annual returns by sector (rough proxies for Indian market)
SECTOR_EXPECTED_RETURNS: Dict[str, float] = {
    "Technology":           22.0,
    "Financial Services":   16.0,
    "Consumer Defensive":   12.0,
    "Consumer Cyclical":    18.0,
    "Energy":               14.0,
    "Healthcare":           15.0,
    "Communication Services": 14.0,
    "Basic Materials":      13.0,
    "Industrials":          15.0,
    "Utilities":            10.0,
    "Real Estate":          11.0,
    "Unknown":              13.0,   # fallback
}

# Risk-level max single-stock weight (mirrors RebalancingService.RISK_STRATEGIES)
RISK_MAX_WEIGHT = {
    "low":      20.0,
    "moderate": 30.0,
    "high":     50.0,
}

# Lookback window for dip calculation (trading days)
DIP_LOOKBACK_DAYS = 7   # 7 calendar days ≈ 5 trading days

# Max number of stocks from the same sector in the final top-N results
SECTOR_RESULT_CAP = 2

# Symbols that are classified as large-cap (Nifty 50 / blue chip tier)
# Only these are shown to low-risk goals; midcaps are shown for moderate/high.
_LARGE_CAP_SYMBOLS = {
    "TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS", "TECHM.NS",
    "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS",
    "AXISBANK.NS", "BAJFINANCE.NS",
    "SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "DIVISLAB.NS", "APOLLOHOSP.NS",
    "HINDUNILVR.NS", "ITC.NS", "NESTLEIND.NS", "BRITANNIA.NS", "DABUR.NS",
    "MARUTI.NS", "TATAMOTORS.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS", "HEROMOTOCO.NS",
    "RELIANCE.NS", "ONGC.NS", "POWERGRID.NS", "NTPC.NS",
    "TATASTEEL.NS", "HINDALCO.NS", "JSWSTEEL.NS", "COALINDIA.NS",
    "LT.NS", "ADANIPORTS.NS", "SIEMENS.NS",
    "BHARTIARTL.NS", "ASIANPAINT.NS", "ULTRACEMCO.NS",
}


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

def get_smart_buy_recommendations(db: Session, goal_id: int) -> List[Dict]:
    """
    Return a list of smart buy recommendation dicts for the given goal.
    Returns an empty list if no qualifying stocks are found.
    """
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        return []

    risk_pref = goal.risk_preference or "moderate"
    max_weight = RISK_MAX_WEIGHT.get(risk_pref, 30.0)

    # Portfolio data for diversification scoring
    portfolio = PortfolioService.calculate_portfolio_value(db, goal_id)
    allocation = PortfolioService.get_asset_allocation(db, goal_id)
    existing_weights: Dict[str, float] = {
        a["symbol"]: a["weight"] for a in allocation
    }
    required_growth = portfolio.get("annual_growth_needed", 0.0)

    # Select risk-appropriate portion of the watchlist
    universe = _get_risk_universe(risk_pref)

    # Scan sector-balanced watchlist
    candidates = []

    end_date = date.today()
    start_date = end_date - timedelta(days=DIP_LOOKBACK_DAYS + 2)  # extra buffer for holidays

    for stock in universe:
        symbol = stock["symbol"]

        # Fetch short-term history (7-day window)
        hist = MarketDataService.get_historical_data(symbol, start_date, end_date)
        if hist is None or hist.empty or len(hist) < 2:
            continue

        closes = hist["Close"].dropna()
        if len(closes) < 2:
            continue

        current_price = float(closes.iloc[-1])
        older_price   = float(closes.iloc[0])   # earliest available in window

        if older_price == 0:
            continue

        dip_pct = ((current_price - older_price) / older_price) * 100.0

        # Only consider meaningful dips
        if dip_pct > DIP_THRESHOLD:
            continue

        # Fetch stock info for sector
        info = MarketDataService.get_stock_info(symbol)
        sector = (info.get("sector") or "Unknown") if info else "Unknown"
        name   = (info.get("name")   or symbol)    if info else symbol

        # Score the candidate
        score = _compute_score(
            dip_pct=dip_pct,
            sector=sector,
            required_growth=required_growth,
            symbol=symbol,
            existing_weights=existing_weights,
            max_weight=max_weight,
        )

        already_held = symbol in existing_weights
        if already_held:
            # Do not recommend symbols the user already holds.
            continue

        candidates.append({
            "symbol":        symbol,
            "name":          name,
            "sector":        sector,
            "current_price": round(current_price, 2),
            "price_5d_ago":  round(older_price, 2),
            "dip_pct":       round(dip_pct, 2),
            "goal_fit_score": score,
            "goal_fit_label": _fit_label(score),
            "conviction":    _conviction(score),
            "already_held":  False,
            "reason":        _build_reason(
                dip_pct, sector, required_growth, score, risk_pref, False
            ),
        })

    # Sort by score descending, then apply sector cap before returning
    candidates.sort(key=lambda x: x["goal_fit_score"], reverse=True)
    return _apply_sector_cap(candidates, MAX_RESULTS)


# ─────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────

def _get_risk_universe(risk_pref: str) -> List[Dict]:
    """
    Return the subset of SMART_BUY_WATCHLIST appropriate for the risk level.

    - low      → large-cap only (40 stocks) — conservative, low-volatility
    - moderate → full list (66 stocks)
    - high     → full list (66 stocks), midcaps first so they score diversity bonus
    """
    if risk_pref == "low":
        return [s for s in SMART_BUY_WATCHLIST if s["symbol"] in _LARGE_CAP_SYMBOLS]
    # For moderate/high return all; ordering doesn't affect scoring since we sort by score
    return SMART_BUY_WATCHLIST


def _apply_sector_cap(sorted_candidates: List[Dict], n: int) -> List[Dict]:
    """
    Pick the top-n candidates while enforcing SECTOR_RESULT_CAP per sector.

    Walks the pre-sorted list in score order and greedily selects candidates
    until n are collected or the list is exhausted. A sector that has already
    contributed SECTOR_RESULT_CAP stocks to the results is skipped.

    This prevents a single sector (e.g. Technology) from occupying all slots
    when multiple stocks from that sector dip together.
    """
    sector_counts: Dict[str, int] = {}
    result: List[Dict] = []

    for candidate in sorted_candidates:
        if len(result) >= n:
            break
        sector = candidate.get("sector", "Unknown")
        if sector_counts.get(sector, 0) < SECTOR_RESULT_CAP:
            result.append(candidate)
            sector_counts[sector] = sector_counts.get(sector, 0) + 1

    return result


def _compute_score(
    dip_pct: float,
    sector: str,
    required_growth: float,
    symbol: str,
    existing_weights: Dict[str, float],
    max_weight: float,
) -> int:
    """
    Composite score 0-100.

    a) Dip depth (40 pts)
       Normalised between DIP_THRESHOLD (-5%) and MAX_DIP_FOR_FULL_SCORE (-20%).
    b) Goal acceleration (35 pts)
       Ratio of sector expected return to the required growth rate.
    c) Diversification fit (25 pts)
       Full pts if stock not already at/above the risk cap.
    """
    # ── a) Dip depth ──────────────────────────────────────────────────────
    depth = min(abs(dip_pct), abs(MAX_DIP_FOR_FULL_SCORE))
    depth_ratio = (depth - abs(DIP_THRESHOLD)) / (abs(MAX_DIP_FOR_FULL_SCORE) - abs(DIP_THRESHOLD))
    depth_ratio = max(0.0, min(depth_ratio, 1.0))
    dip_score = depth_ratio * 40.0

    # ── b) Goal acceleration ─────────────────────────────────────────────
    sector_return = SECTOR_EXPECTED_RETURNS.get(sector, SECTOR_EXPECTED_RETURNS["Unknown"])
    if required_growth <= 0:
        accel_score = 35.0           # no specific growth needed → full marks
    else:
        ratio = sector_return / required_growth
        accel_score = min(ratio, 1.0) * 35.0

    # ── c) Diversification fit ────────────────────────────────────────────
    current_w = existing_weights.get(symbol, 0.0)
    if current_w >= max_weight:
        div_score = 0.0
    elif current_w >= max_weight * 0.5:   # penalise earlier — at 50% of cap
        div_score = 12.5
    else:
        div_score = 25.0

    return round(dip_score + accel_score + div_score)


def _fit_label(score: int) -> str:
    if score >= 75:
        return "High Fit"
    if score >= 55:
        return "Moderate Fit"
    return "Low Fit"


def _conviction(score: int) -> str:
    if score >= 75:
        return "STRONG"
    if score >= 55:
        return "MODERATE"
    return "WATCH"


def _build_reason(
    dip_pct: float,
    sector: str,
    required_growth: float,
    score: int,
    risk_pref: str,
    already_held: bool,
) -> str:
    sector_return = SECTOR_EXPECTED_RETURNS.get(sector, 13.0)
    parts: List[str] = []

    # Dip context
    parts.append(f"📉 Price dipped {abs(dip_pct):.1f}% over the last 5 trading days")

    # Growth fit
    if required_growth > 0:
        if sector_return >= required_growth:
            parts.append(
                f"✅ {sector} sector (~{sector_return:.0f}%/yr expected) meets your "
                f"required growth of {required_growth:.1f}%/yr"
            )
        else:
            parts.append(
                f"⚠️ {sector} sector (~{sector_return:.0f}%/yr) is below required "
                f"{required_growth:.1f}%/yr — consider risk upgrade"
            )
    else:
        parts.append(f"🏁 Goal is on track; this dip is an opportunistic add")

    # Diversification note
    if already_held:
        parts.append("📊 Already in portfolio — adding more increases concentration")

    # Risk note
    parts.append(f"🔒 Risk profile: {risk_pref.capitalize()}")

    return " · ".join(parts)
