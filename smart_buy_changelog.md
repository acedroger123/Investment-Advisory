# Smart Buy Recommendation Module — Full Changelog

All code changes made to implement the Smart Buy Recommendation feature.

---

## 1. NEW — [backend/services/smart_buy.py](file:///c:/Users/pakza/Stocks/backend/services/smart_buy.py)

**Completely new file.** Core engine that detects dipped stocks and scores them against each goal.

```python
"""
Smart Buy Recommendation Service.

Identifies stocks that have experienced a meaningful price dip AND align
with the goal's risk profile, time horizon, and required annual growth rate
to accelerate goal achievement.

Algorithm overview
------------------
1. Load goal metadata (risk_preference, annual_growth_needed, portfolio allocation).
2. Scan a sector-balanced watchlist (8+ industries represented).
3. Compute dip_pct = (current_price - price_5d_ago) / price_5d_ago * 100.
4. Keep only stocks whose dip_pct ≤ DIP_THRESHOLD (default -3 %).
5. Score each candidate (0-100) across three dimensions:
      a) Dip depth          (40 pts) – deeper dip → more buying opportunity
      b) Goal acceleration  (35 pts) – sector expected return vs required growth
      c) Diversification    (25 pts) – not overweight in portfolio
6. Label conviction: STRONG (≥75), MODERATE (≥55), WATCH (< 55).
7. Return top MAX_RESULTS sorted by score desc, sector-capped at 2 per sector.
"""
from datetime import date, timedelta
from typing import List, Dict
from sqlalchemy.orm import Session

from database.models import Goal
from services.market_data import MarketDataService
from services.portfolio_service import PortfolioService

# ─────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────
DIP_THRESHOLD = -3.0            # minimum dip % to qualify
MAX_DIP_FOR_FULL_SCORE = -20.0  # dip at or beyond this = full 40 dip pts
MAX_RESULTS = 8                 # cards shown in the UI
SECTOR_RESULT_CAP = 2           # max stocks from the same sector in results
DIP_LOOKBACK_DAYS = 7           # calendar days (≈ 5 trading days)

# ── Sector-balanced watchlist (66 stocks total) ──────────────────────────────
SMART_BUY_WATCHLIST = [
    # Large Cap — Technology (5)
    {"symbol": "TCS.NS",        "name": "Tata Consultancy Services"},
    {"symbol": "INFY.NS",       "name": "Infosys Limited"},
    {"symbol": "WIPRO.NS",      "name": "Wipro Limited"},
    {"symbol": "HCLTECH.NS",    "name": "HCL Technologies"},
    {"symbol": "TECHM.NS",      "name": "Tech Mahindra"},
    # Large Cap — Financial Services (6)
    {"symbol": "HDFCBANK.NS",   "name": "HDFC Bank"},
    {"symbol": "ICICIBANK.NS",  "name": "ICICI Bank"},
    {"symbol": "SBIN.NS",       "name": "State Bank of India"},
    {"symbol": "KOTAKBANK.NS",  "name": "Kotak Mahindra Bank"},
    {"symbol": "AXISBANK.NS",   "name": "Axis Bank"},
    {"symbol": "BAJFINANCE.NS", "name": "Bajaj Finance"},
    # Large Cap — Healthcare (5)
    {"symbol": "SUNPHARMA.NS",  "name": "Sun Pharmaceutical"},
    {"symbol": "DRREDDY.NS",    "name": "Dr. Reddy's Laboratories"},
    {"symbol": "CIPLA.NS",      "name": "Cipla Limited"},
    {"symbol": "DIVISLAB.NS",   "name": "Divi's Laboratories"},
    {"symbol": "APOLLOHOSP.NS", "name": "Apollo Hospitals"},
    # Large Cap — FMCG (5)
    {"symbol": "HINDUNILVR.NS", "name": "Hindustan Unilever"},
    {"symbol": "ITC.NS",        "name": "ITC Limited"},
    {"symbol": "NESTLEIND.NS",  "name": "Nestle India"},
    {"symbol": "BRITANNIA.NS",  "name": "Britannia Industries"},
    {"symbol": "DABUR.NS",      "name": "Dabur India"},
    # Large Cap — Auto (5)
    {"symbol": "MARUTI.NS",     "name": "Maruti Suzuki"},
    {"symbol": "TATAMOTORS.NS", "name": "Tata Motors"},
    {"symbol": "BAJAJ-AUTO.NS", "name": "Bajaj Auto"},
    {"symbol": "EICHERMOT.NS",  "name": "Eicher Motors"},
    {"symbol": "HEROMOTOCO.NS", "name": "Hero MotoCorp"},
    # Large Cap — Energy (4)
    {"symbol": "RELIANCE.NS",   "name": "Reliance Industries"},
    {"symbol": "ONGC.NS",       "name": "ONGC"},
    {"symbol": "POWERGRID.NS",  "name": "Power Grid Corporation"},
    {"symbol": "NTPC.NS",       "name": "NTPC Limited"},
    # Large Cap — Metals (4)
    {"symbol": "TATASTEEL.NS",  "name": "Tata Steel"},
    {"symbol": "HINDALCO.NS",   "name": "Hindalco Industries"},
    {"symbol": "JSWSTEEL.NS",   "name": "JSW Steel"},
    {"symbol": "COALINDIA.NS",  "name": "Coal India"},
    # Large Cap — Industrials / Comms (6)
    {"symbol": "LT.NS",         "name": "Larsen & Toubro"},
    {"symbol": "ADANIPORTS.NS", "name": "Adani Ports"},
    {"symbol": "SIEMENS.NS",    "name": "Siemens India"},
    {"symbol": "BHARTIARTL.NS", "name": "Bharti Airtel"},
    {"symbol": "ASIANPAINT.NS", "name": "Asian Paints"},
    {"symbol": "ULTRACEMCO.NS", "name": "UltraTech Cement"},
    # ── Nifty Midcap 100 (26 stocks) ─────────────────────────────────────
    # Midcap — IT (4)
    {"symbol": "MPHASIS.NS",    "name": "Mphasis Limited"},
    {"symbol": "COFORGE.NS",    "name": "Coforge Limited"},
    {"symbol": "PERSISTENT.NS", "name": "Persistent Systems"},
    {"symbol": "LTIM.NS",       "name": "LTIMindtree"},
    # Midcap — Financial (4)
    {"symbol": "BANDHANBNK.NS", "name": "Bandhan Bank"},
    {"symbol": "FEDERALBNK.NS", "name": "Federal Bank"},
    {"symbol": "MUTHOOTFIN.NS", "name": "Muthoot Finance"},
    {"symbol": "CHOLAFIN.NS",   "name": "Cholamandalam Investment"},
    # Midcap — Pharma (4)
    {"symbol": "TORNTPHARM.NS", "name": "Torrent Pharmaceuticals"},
    {"symbol": "AUROPHARMA.NS", "name": "Aurobindo Pharma"},
    {"symbol": "ALKEM.NS",      "name": "Alkem Laboratories"},
    {"symbol": "LALPATHLAB.NS", "name": "Dr Lal PathLabs"},
    # Midcap — Consumer (3)
    {"symbol": "MARICO.NS",     "name": "Marico Limited"},
    {"symbol": "GODREJCP.NS",   "name": "Godrej Consumer Products"},
    {"symbol": "TRENT.NS",      "name": "Trent Limited"},
    # Midcap — Auto Ancillaries (3)
    {"symbol": "BALKRISIND.NS", "name": "Balkrishna Industries"},
    {"symbol": "MOTHERSON.NS",  "name": "Samvardhana Motherson"},
    {"symbol": "ZOMATO.NS",     "name": "Zomato Limited"},
    # Midcap — Industrials (4)
    {"symbol": "CUMMINSIND.NS", "name": "Cummins India"},
    {"symbol": "ABB.NS",        "name": "ABB India"},
    {"symbol": "BHEL.NS",       "name": "Bharat Heavy Electricals"},
    {"symbol": "IRCTC.NS",      "name": "IRCTC"},
    # Midcap — Chemicals / Real Estate (4)
    {"symbol": "PIDILITIND.NS", "name": "Pidilite Industries"},
    {"symbol": "SRF.NS",        "name": "SRF Limited"},
    {"symbol": "OBEROIRLTY.NS", "name": "Oberoi Realty"},
    {"symbol": "INDHOTEL.NS",   "name": "Indian Hotels (Taj)"},
]

# Sector expected annual returns (Indian market proxies)
SECTOR_EXPECTED_RETURNS: Dict[str, float] = {
    "Technology":             22.0,
    "Financial Services":     16.0,
    "Consumer Defensive":     12.0,
    "Consumer Cyclical":      18.0,
    "Energy":                 14.0,
    "Healthcare":             15.0,
    "Communication Services": 14.0,
    "Basic Materials":        13.0,
    "Industrials":            15.0,
    "Utilities":              10.0,
    "Real Estate":            11.0,
    "Unknown":                13.0,
}

# Max single-stock portfolio weight per risk level
RISK_MAX_WEIGHT = {"low": 20.0, "moderate": 30.0, "high": 50.0}

# Large-cap symbol set — only shown to low-risk goals
_LARGE_CAP_SYMBOLS = {
    "TCS.NS", "INFY.NS", "WIPRO.NS", "HCLTECH.NS", "TECHM.NS",
    "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "KOTAKBANK.NS",
    "AXISBANK.NS", "BAJFINANCE.NS", "SUNPHARMA.NS", "DRREDDY.NS",
    "CIPLA.NS", "DIVISLAB.NS", "APOLLOHOSP.NS", "HINDUNILVR.NS",
    "ITC.NS", "NESTLEIND.NS", "BRITANNIA.NS", "DABUR.NS",
    "MARUTI.NS", "TATAMOTORS.NS", "BAJAJ-AUTO.NS", "EICHERMOT.NS",
    "HEROMOTOCO.NS", "RELIANCE.NS", "ONGC.NS", "POWERGRID.NS",
    "NTPC.NS", "TATASTEEL.NS", "HINDALCO.NS", "JSWSTEEL.NS",
    "COALINDIA.NS", "LT.NS", "ADANIPORTS.NS", "SIEMENS.NS",
    "BHARTIARTL.NS", "ASIANPAINT.NS", "ULTRACEMCO.NS",
}


# ─────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────

def get_smart_buy_recommendations(db: Session, goal_id: int) -> List[Dict]:
    goal = db.query(Goal).filter(Goal.id == goal_id).first()
    if not goal:
        return []

    risk_pref  = goal.risk_preference or "moderate"
    max_weight = RISK_MAX_WEIGHT.get(risk_pref, 30.0)

    portfolio = PortfolioService.calculate_portfolio_value(db, goal_id)
    allocation = PortfolioService.get_asset_allocation(db, goal_id)
    existing_weights = {a["symbol"]: a["weight"] for a in allocation}
    required_growth  = portfolio.get("annual_growth_needed", 0.0)

    universe   = _get_risk_universe(risk_pref)
    candidates = []
    end_date   = date.today()
    start_date = end_date - timedelta(days=DIP_LOOKBACK_DAYS + 2)

    for stock in universe:
        symbol = stock["symbol"]
        hist   = MarketDataService.get_historical_data(symbol, start_date, end_date)
        if hist is None or hist.empty or len(hist) < 2:
            continue
        closes = hist["Close"].dropna()
        if len(closes) < 2:
            continue
        current_price = float(closes.iloc[-1])
        older_price   = float(closes.iloc[0])
        if older_price == 0:
            continue
        dip_pct = ((current_price - older_price) / older_price) * 100.0
        if dip_pct > DIP_THRESHOLD:
            continue

        info   = MarketDataService.get_stock_info(symbol)
        sector = (info.get("sector") or "Unknown") if info else "Unknown"
        name   = (info.get("name")   or symbol)    if info else symbol
        score  = _compute_score(dip_pct, sector, required_growth,
                                symbol, existing_weights, max_weight)
        already_held = symbol in existing_weights

        candidates.append({
            "symbol":         symbol,
            "name":           name,
            "sector":         sector,
            "current_price":  round(current_price, 2),
            "price_5d_ago":   round(older_price, 2),
            "dip_pct":        round(dip_pct, 2),
            "goal_fit_score": score,
            "goal_fit_label": _fit_label(score),
            "conviction":     _conviction(score),
            "already_held":   already_held,
            "reason":         _build_reason(dip_pct, sector, required_growth,
                                            score, risk_pref, already_held),
        })

    candidates.sort(key=lambda x: x["goal_fit_score"], reverse=True)
    return _apply_sector_cap(candidates, MAX_RESULTS)


# ─────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────

def _get_risk_universe(risk_pref: str) -> List[Dict]:
    """low → large-caps only; moderate/high → all 66 stocks."""
    if risk_pref == "low":
        return [s for s in SMART_BUY_WATCHLIST if s["symbol"] in _LARGE_CAP_SYMBOLS]
    return SMART_BUY_WATCHLIST


def _apply_sector_cap(sorted_candidates: List[Dict], n: int) -> List[Dict]:
    """Return top-n while enforcing max SECTOR_RESULT_CAP per sector."""
    sector_counts: Dict[str, int] = {}
    result: List[Dict] = []
    for c in sorted_candidates:
        if len(result) >= n:
            break
        sec = c.get("sector", "Unknown")
        if sector_counts.get(sec, 0) < SECTOR_RESULT_CAP:
            result.append(c)
            sector_counts[sec] = sector_counts.get(sec, 0) + 1
    return result


def _compute_score(dip_pct, sector, required_growth,
                   symbol, existing_weights, max_weight) -> int:
    # a) Dip depth (40 pts)
    depth       = min(abs(dip_pct), abs(MAX_DIP_FOR_FULL_SCORE))
    depth_ratio = (depth - abs(DIP_THRESHOLD)) / (abs(MAX_DIP_FOR_FULL_SCORE) - abs(DIP_THRESHOLD))
    dip_score   = max(0.0, min(depth_ratio, 1.0)) * 40.0

    # b) Goal acceleration (35 pts)
    sector_return = SECTOR_EXPECTED_RETURNS.get(sector, 13.0)
    accel_score   = 35.0 if required_growth <= 0 else min(sector_return / required_growth, 1.0) * 35.0

    # c) Diversification fit (25 pts)
    current_w = existing_weights.get(symbol, 0.0)
    if current_w >= max_weight:           div_score = 0.0
    elif current_w >= max_weight * 0.5:   div_score = 12.5   # penalise at 50% of cap
    else:                                 div_score = 25.0

    return round(dip_score + accel_score + div_score)


def _fit_label(score: int) -> str:
    return "High Fit" if score >= 75 else "Moderate Fit" if score >= 55 else "Low Fit"


def _conviction(score: int) -> str:
    return "STRONG" if score >= 75 else "MODERATE" if score >= 55 else "WATCH"


def _build_reason(dip_pct, sector, required_growth, score, risk_pref, already_held) -> str:
    sector_return = SECTOR_EXPECTED_RETURNS.get(sector, 13.0)
    parts = [f"📉 Price dipped {abs(dip_pct):.1f}% over the last 5 trading days"]
    if required_growth > 0:
        if sector_return >= required_growth:
            parts.append(f"✅ {sector} sector (~{sector_return:.0f}%/yr expected) meets your "
                         f"required growth of {required_growth:.1f}%/yr")
        else:
            parts.append(f"⚠️ {sector} sector (~{sector_return:.0f}%/yr) is below required "
                         f"{required_growth:.1f}%/yr — consider risk upgrade")
    else:
        parts.append("🏁 Goal is on track; this dip is an opportunistic add")
    if already_held:
        parts.append("📊 Already in portfolio — adding more increases concentration")
    parts.append(f"🔒 Risk profile: {risk_pref.capitalize()}")
    return " · ".join(parts)
```

---

## 2. MODIFIED — [backend/routers/recommendations.py](file:///c:/Users/pakza/Stocks/backend/routers/recommendations.py)

**What changed:** Added 1 import line and 1 new endpoint.

```diff
+ from services.smart_buy import get_smart_buy_recommendations

+ @router.get("/{goal_id}/smart-buy", response_model=List[dict])
+ async def get_smart_buy(goal_id: int, db: Session = Depends(get_db)):
+     """Get Smart Buy recommendations: dip-based stocks aligned with goal risk & growth."""
+     goal = db.query(Goal).filter(Goal.id == goal_id).first()
+     if not goal:
+         raise HTTPException(status_code=404, detail="Goal not found")
+     return get_smart_buy_recommendations(db, goal_id)
```

---

## 3. MODIFIED — [frontend/js/api.js](file:///c:/Users/pakza/Stocks/frontend/js/api.js)

**What changed:** Added [getSmartBuy()](file:///c:/Users/pakza/Stocks/frontend/js/api.js#205-208) to the `RecommendationsAPI` object.

```diff
  async markAlertRead(alertId) {
      return apiRequest(`/recommendations/alerts/${alertId}/read`, { method: 'PUT' });
  },

+ async getSmartBuy(goalId) {
+     return apiRequest(`/recommendations/${goalId}/smart-buy`);
+ },
```

---

## 4. MODIFIED — [frontend/portfolio.html](file:///c:/Users/pakza/Stocks/frontend/portfolio.html)

**What changed:** Added a new section after the Recent Transactions section.

```html
<!-- Smart Buy Recommendations -->
<section class="data-section" style="grid-template-columns: 1fr;">
    <div class="data-card">
        <div class="card-header">
            <div class="smart-buy-header-title">
                <span class="smart-buy-icon">🎯</span>
                <h3>Smart Buy Recommendations</h3>
                <span class="badge badge-info smart-buy-ai-badge">✨ AI Powered</span>
            </div>
            <button id="refreshSmartBuyBtn" class="btn btn-secondary btn-sm"
                onclick="loadSmartBuy()">↻ Refresh</button>
        </div>
        <p class="smart-buy-subtitle">Stocks with significant price dips that align with your
            goal's risk profile and growth requirements</p>
        <div id="smartBuyLoading" style="display:none;" class="smart-buy-loading">
            <div class="loading-spinner"></div>
            <span>Analysing market conditions...</span>
        </div>
        <div id="smartBuyList" class="smart-buy-grid"></div>
    </div>
</section>
```

---

## 5. MODIFIED — [frontend/js/portfolio.js](file:///c:/Users/pakza/Stocks/frontend/js/portfolio.js)

**What changed:** Added a [loadSmartBuy()](file:///c:/Users/pakza/Stocks/frontend/js/portfolio.js#418-446) call after portfolio data loads, plus two new functions.

### Trigger (inside [loadPortfolioData](file:///c:/Users/pakza/Stocks/frontend/js/portfolio.js#43-91))
```diff
  document.getElementById('portfolioContent').style.display = 'block';
+ loadSmartBuy();   // non-blocking
```

### New: [loadSmartBuy()](file:///c:/Users/pakza/Stocks/frontend/js/portfolio.js#418-446)
```javascript
async function loadSmartBuy() {
    if (!currentGoalId) return;
    const listEl    = document.getElementById('smartBuyList');
    const loadingEl = document.getElementById('smartBuyLoading');
    if (!listEl || !loadingEl) return;

    loadingEl.style.display = 'flex';
    listEl.innerHTML = '';
    try {
        const recs = await API.Recommendations.getSmartBuy(currentGoalId);
        renderSmartBuyRecommendations(recs);
    } catch (err) {
        console.error('Smart Buy fetch failed:', err);
        listEl.innerHTML = `<div class="smart-buy-empty">
            <span class="smart-buy-empty-icon">📡</span>
            <p>Unable to fetch recommendations right now.</p></div>`;
    } finally {
        loadingEl.style.display = 'none';
    }
}
```

### New: [renderSmartBuyRecommendations(recs)](file:///c:/Users/pakza/Stocks/frontend/js/portfolio.js#447-513)
```javascript
function renderSmartBuyRecommendations(recs) {
    const listEl = document.getElementById('smartBuyList');
    if (!listEl) return;

    if (!recs || recs.length === 0) {
        listEl.innerHTML = `<div class="smart-buy-empty">
            <span class="smart-buy-empty-icon">✅</span>
            <p>No significant dips detected. The market looks stable.</p></div>`;
        return;
    }

    listEl.innerHTML = recs.map(r => {
        const dipClass  = r.dip_pct <= -10 ? 'dip-deep' : 'dip-mild';
        const convClass = r.conviction === 'STRONG'   ? 'conviction-strong'
                        : r.conviction === 'MODERATE' ? 'conviction-moderate'
                        : 'conviction-watch';
        const convEmoji = r.conviction === 'STRONG' ? '🔥' : r.conviction === 'MODERATE' ? '⚡' : '👁️';
        const scoreWidth   = Math.min(r.goal_fit_score, 100);
        const alreadyBadge = r.already_held
            ? `<span class="smart-buy-held-badge">📂 In Portfolio</span>` : '';

        return `
        <div class="smart-buy-card ${convClass}">
            <div class="smart-buy-card-top">
                <div class="smart-buy-symbol-block">
                    <span class="smart-buy-symbol">${r.symbol.replace('.NS','').replace('.BO','')}</span>
                    <span class="smart-buy-name">${r.name}</span>
                    ${alreadyBadge}
                </div>
                <span class="conviction-pill ${convClass}">${convEmoji} ${r.conviction}</span>
            </div>
            <div class="smart-buy-metrics">
                <div class="smart-buy-metric">
                    <span class="metric-label">Current Price</span>
                    <span class="metric-value">${formatCurrency(r.current_price)}</span>
                </div>
                <div class="smart-buy-metric">
                    <span class="metric-label">5-Day Dip</span>
                    <span class="metric-value ${dipClass}">${r.dip_pct.toFixed(1)}%</span>
                </div>
                <div class="smart-buy-metric">
                    <span class="metric-label">Sector</span>
                    <span class="metric-value metric-sector">${r.sector}</span>
                </div>
            </div>
            <div class="smart-buy-fit">
                <div class="fit-bar-header">
                    <span class="fit-bar-label">Goal Fit Score</span>
                    <span class="fit-bar-score">${r.goal_fit_score}/100 — ${r.goal_fit_label}</span>
                </div>
                <div class="fit-bar">
                    <div class="fit-bar-fill ${convClass}" style="width:${scoreWidth}%"></div>
                </div>
            </div>
            <div class="smart-buy-reason">${r.reason}</div>
        </div>`;
    }).join('');
}
```

---

## 6. MODIFIED — [frontend/css/styles.css](file:///c:/Users/pakza/Stocks/frontend/css/styles.css)

**What changed:** ~230 lines appended at the bottom for all Smart Buy UI classes.

Key classes added:

| Class | Purpose |
|---|---|
| `.smart-buy-grid` | Responsive card grid (`auto-fill, minmax(290px, 1fr)`) |
| `.smart-buy-card` | Glass card with coloured left border accent |
| `.smart-buy-card.conviction-strong` | Green left border |
| `.smart-buy-card.conviction-moderate` | Amber left border |
| `.smart-buy-card.conviction-watch` | Grey left border |
| `.conviction-pill` | Coloured pill badge top-right of card |
| `.fit-bar` / `.fit-bar-fill` | Animated goal-fit score progress bar |
| `.smart-buy-metrics` | 3-column row: price, dip %, sector |
| `.smart-buy-reason` | Italic muted text explanation at the bottom |
| `.smart-buy-empty` | Centered empty/error state with icon |
| `.smart-buy-loading` | Flex row with spinner + text |
| `.smart-buy-ai-badge` | Purple gradient "✨ AI Powered" badge |

---

## 7. NEW — [backend/tests/test_smart_buy.py](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py)

**Completely new file.** 39 unit tests covering all scoring helpers. No network or DB required.

| Test Class | Tests |
|---|---|
| [TestDipThresholds](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#110-121) | Constant values (−3%, −20%) |
| [TestDipDepthScoring](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#127-166) | At threshold = 0 pts, at −20% = 40 pts, midpoint, capping |
| [TestGoalAccelerationScoring](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#172-203) | Zero growth, sector meets/misses required, Unknown fallback |
| [TestDiversificationScoring](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#209-237) | Not held, at cap, approaching cap, well below cap |
| [TestConvictionLabels](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#243-264) | Boundary values for STRONG/MODERATE/WATCH |
| [TestReasonBuilder](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#270-291) | Dip %, sector name, already-held note, risk pref, on-track goal |
| [TestSectorReturns](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#297-312) | All positive, Tech is highest, Unknown exists |
| [TestRiskWeightConstants](file:///c:/Users/pakza/Stocks/backend/tests/test_smart_buy.py#318-332) | low < moderate < high, all positive, all 3 keys present |

Run with:
```bash
cd backend
python -m pytest tests/test_smart_buy.py -v
```

---

## Summary of All Key Decisions

| Decision | Reason |
|---|---|
| Dip threshold −3% (not −5%) | −5% too rare; most non-tech stocks rarely breach it |
| 66-stock sector-balanced watchlist | Prevents IT from monopolising results |
| Large-caps only for [low](file:///c:/Users/pakza/Stocks/backend/tests/test_routers.py#248-250) risk | Midcaps are too volatile for conservative goals |
| Sector cap of 2 in results | Forces cross-sector diversity even in broad market sell-offs |
| Diversification penalty at 50% cap (not 80%) | Earlier penalty pushes under-represented sectors up |
| 8 cards (not 6) | Fills the UI grid better |
