# Risk Preference — Code Changes Log

All changes were made to make `risk_preference` (low / moderate / high) actually affect behavior rather than just being stored. Previously the field was saved to the database but ignored by all calculation engines.

---

## 1. [backend/services/monte_carlo.py](file:///c:/Users/pakza/Stocks/backend/services/monte_carlo.py)

### What changed
Replaced hardcoded annual return (12%) and volatility (20%) with values that vary per risk level.

### Before
```python
# Default market parameters
mu = 0.12 / MonteCarloService.TRADING_DAYS_PER_YEAR
sigma = 0.20 / np.sqrt(MonteCarloService.TRADING_DAYS_PER_YEAR)
```

### After
```python
# Risk-adjusted market parameters based on goal's risk preference
RISK_PARAMS = {
    "low":      {"annual_return": 0.10, "annual_volatility": 0.15},
    "moderate": {"annual_return": 0.14, "annual_volatility": 0.22},
    "high":     {"annual_return": 0.20, "annual_volatility": 0.32},
}
risk_key = goal.risk_preference if goal.risk_preference in RISK_PARAMS else "moderate"
params = RISK_PARAMS[risk_key]
annual_return = params["annual_return"]
annual_volatility = params["annual_volatility"]
mu = annual_return / MonteCarloService.TRADING_DAYS_PER_YEAR
sigma = annual_volatility / np.sqrt(MonteCarloService.TRADING_DAYS_PER_YEAR)
```

### New fields added to the return dict
```python
"risk_preference": goal.risk_preference,
"assumed_annual_return": round(annual_return * 100, 1),
"assumed_annual_volatility": round(annual_volatility * 100, 1),
```

### Effect
Two goals with the same stock but different risk levels now produce **different success probabilities and outcome distributions** in the Monte Carlo simulation.

| Risk Level | Annual Return | Volatility |
|---|---|---|
| Low | 10% | 15% |
| Moderate | 14% | 22% |
| High | 20% | 32% |

---

## 2. [backend/services/portfolio_service.py](file:///c:/Users/pakza/Stocks/backend/services/portfolio_service.py)

### What changed
[calculate_portfolio_value()](file:///c:/Users/pakza/Stocks/backend/services/portfolio_service.py#60-145) now returns the risk benchmark (expected % return range) so the dashboard and other consumers can display it.

### Added (at the end of [calculate_portfolio_value](file:///c:/Users/pakza/Stocks/backend/services/portfolio_service.py#60-145))
```python
# Expected annual return benchmark based on risk preference
RISK_RETURN_BENCHMARKS = {
    "low":      {"expected": 10.0, "max": 12.0},
    "moderate": {"expected": 14.0, "max": 20.0},
    "high":     {"expected": 20.0, "max": 30.0},
}
risk_key = goal.risk_preference if goal.risk_preference in RISK_RETURN_BENCHMARKS else "moderate"
benchmark = RISK_RETURN_BENCHMARKS[risk_key]
```

### New fields added to the return dict
```python
"risk_preference": goal.risk_preference,
"expected_annual_return": benchmark["expected"],
"max_annual_return": benchmark["max"],
```

---

## 3. [backend/services/rebalancing.py](file:///c:/Users/pakza/Stocks/backend/services/rebalancing.py)

This was the biggest change. Three separate areas were updated.

### 3a. Replaced old hardcoded class constants with `RISK_STRATEGIES`

#### Before
```python
class RebalancingService:
    MAX_SINGLE_STOCK_WEIGHT = 0.30  # 30%
    MIN_STOCKS_FOR_DIVERSIFICATION = 3
    DRIFT_THRESHOLD = 0.05  # 5%
```

#### After
```python
class RebalancingService:
    RISK_STRATEGIES = {
        "low": {
            "max_single_weight": 0.20,   # 20% — conservative, spread wide
            "drift_threshold":   0.04,   # tighter tolerance
            "min_stocks":        5,
            "strategy_label":    "Conservative (Capped Equal-Weight)",
            "description":       "Each stock capped at 20%. Aims for even distribution across ≥5 stocks.",
        },
        "moderate": {
            "max_single_weight": 0.30,   # 30% — balanced
            "drift_threshold":   0.05,
            "min_stocks":        3,
            "strategy_label":    "Balanced (Equal-Weight)",
            "description":       "Each stock capped at 30%. Equal-weight across holdings.",
        },
        "high": {
            "max_single_weight": 0.50,   # 50% — growth-tilt, allow big winners
            "drift_threshold":   0.08,   # wider band before rebalancing
            "min_stocks":        2,
            "strategy_label":    "Aggressive (Growth-Tilt)",
            "description":       "Allows up to 50% in a single stock. Fewer, higher-conviction positions.",
        },
    }
```

### 3b. [_identify_issues()](file:///c:/Users/pakza/Stocks/backend/services/rebalancing.py#92-158) — risk-aware thresholds

#### Before
```python
# Used hardcoded class constants (same for all risk levels)
if asset['weight'] > RebalancingService.MAX_SINGLE_STOCK_WEIGHT * 100:
    ...
if len(allocation) < RebalancingService.MIN_STOCKS_FOR_DIVERSIFICATION:
    ...
```

#### After
```python
# Use the strategy for this goal's risk level
strategy = RebalancingService.RISK_STRATEGIES.get(
    goal.risk_preference, RebalancingService.RISK_STRATEGIES["moderate"]
)
max_weight = strategy["max_single_weight"] * 100
min_stocks = strategy["min_stocks"]

# Concentration check uses risk-appropriate cap
if asset['weight'] > max_weight:
    issues.append({
        "detail": (
            f"{asset['symbol']} is {asset['weight']:.1f}% of portfolio "
            f"(max recommended for {goal.risk_preference} risk: {max_weight:.0f}%)"
        ), ...
    })

# Diversification check uses risk-appropriate minimum
if len(allocation) < min_stocks:
    issues.append({
        "detail": (
            f"Portfolio has only {len(allocation)} stocks "
            f"(recommended for {goal.risk_preference} risk: at least {min_stocks})"
        ), ...
    })
```

### 3c. [_generate_recommendations()](file:///c:/Users/pakza/Stocks/backend/services/rebalancing.py#159-251) — fixed broken reference

#### Before (caused the HTTP 500 crash)
```python
# BUG: MAX_SINGLE_STOCK_WEIGHT no longer exists
target_weight = RebalancingService.MAX_SINGLE_STOCK_WEIGHT * 100
```

#### After (fixed)
```python
strategy = RebalancingService.RISK_STRATEGIES.get(
    goal.risk_preference, RebalancingService.RISK_STRATEGIES["moderate"]
)
target_weight = strategy["max_single_weight"] * 100
```

### 3d. [get_rebalancing_suggestions()](file:///c:/Users/pakza/Stocks/backend/routers/recommendations.py#26-34) — risk-aware target weights

#### Before
```python
# Equal weight for all goals regardless of risk
num_holdings = len(allocation)
target_weight = 100 / num_holdings if num_holdings > 0 else 0

# ... used same DRIFT_THRESHOLD for all
if abs(drift) > RebalancingService.DRIFT_THRESHOLD * 100:
```

#### After
```python
risk_key = goal.risk_preference if goal and goal.risk_preference in RebalancingService.RISK_STRATEGIES else "moderate"
strategy = RebalancingService.RISK_STRATEGIES[risk_key]
max_single = strategy["max_single_weight"] * 100
drift_threshold = strategy["drift_threshold"] * 100

# Build target weights capped at max_single
raw_equal = 100.0 / num_holdings if num_holdings > 0 else 0
target_weights: dict[str, float] = {}

if raw_equal > max_single:
    for asset in allocation:
        target_weights[asset['symbol']] = max_single
else:
    for asset in allocation:
        target_weights[asset['symbol']] = raw_equal

# Uses risk-appropriate drift threshold per stock
if abs(drift) > drift_threshold:
    ...
    suggestions.append({
        ...,
        "reason": f"Overweight vs {risk_key} target ({target_weight:.1f}%)"
    })
```

### New fields in the return dict
```python
"target_strategy": strategy["strategy_label"],   # e.g. "Aggressive (Growth-Tilt)"
"strategy_description": strategy["description"],
"risk_preference": risk_key,
"max_single_stock_weight": max_single,           # e.g. 50.0 for high risk
```

### Effect summary

| Risk Level | Max per stock | Drift tolerance | Min stocks | Strategy name |
|---|---|---|---|---|
| Low | 20% | 4% | 5 | Conservative (Capped Equal-Weight) |
| Moderate | 30% | 5% | 3 | Balanced (Equal-Weight) |
| High | 50% | 8% | 2 | Aggressive (Growth-Tilt) |

---

## 4. [frontend/js/goals.js](file:///c:/Users/pakza/Stocks/frontend/js/goals.js)

### What changed
Goal cards now show a colored "Expected Annual Return" bar that reflects the risk level instead of just showing the label text.

### Added — risk benchmark constant
```javascript
const RISK_BENCHMARKS_FRONTEND = {
    low:      { expected: 10, max: 12, color: '#10b981', label: 'Conservative' },
    moderate: { expected: 14, max: 20, color: '#f59e0b', label: 'Balanced' },
    high:     { expected: 20, max: 30, color: '#ef4444', label: 'Aggressive' },
};
```

### Changed — [createGoalCard()](file:///c:/Users/pakza/Stocks/frontend/js/goals.js#62-126) badge label
```javascript
// Before
<span class="badge ${riskBadge}">${goal.risk_preference}</span>

// After
const bench = RISK_BENCHMARKS_FRONTEND[goal.risk_preference] || RISK_BENCHMARKS_FRONTEND.moderate;
<span class="badge ${riskBadge}">${bench.label}</span>
```

### Added — Expected Return bar inside each goal card
```html
<div class="risk-strategy-bar" style="
    background: rgba(0,0,0,0.2);
    border-left: 3px solid ${bench.color};
    border-radius: 6px;
    padding: 7px 12px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
">
    <span style="color: var(--text-muted);">📈 Expected Annual Return</span>
    <strong style="color: ${bench.color};">${bench.expected}% – ${bench.max}%</strong>
</div>
```

### Effect
- **Conservative (Low)**: 🟢 `10% – 12%`
- **Balanced (Moderate)**: 🟡 `14% – 20%`
- **Aggressive (High)**: 🔴 `20% – 30%`

---

## 5. [frontend/js/simulation.js](file:///c:/Users/pakza/Stocks/frontend/js/simulation.js)

### What changed
After running a Monte Carlo simulation, a banner is now shown explaining which return rate and volatility were used — making it visible that the two goals used different assumptions.

### Added — after [createProbabilityGauge()](file:///c:/Users/pakza/Stocks/frontend/js/charts.js#266-326)
```javascript
// Show risk assumptions used in the simulation
const assumptionsEl = document.getElementById('simulationAssumptions');
if (assumptionsEl && result.assumed_annual_return != null) {
    const riskColors = { low: '#10b981', moderate: '#f59e0b', high: '#ef4444' };
    const color = riskColors[result.risk_preference] || '#6366f1';
    assumptionsEl.style.display = 'block';
    assumptionsEl.innerHTML = `
        <div style="
            background: rgba(0,0,0,0.2);
            border-left: 3px solid ${color};
            border-radius: 8px;
            padding: 10px 16px;
            font-size: 0.82rem;
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
            margin-top: 12px;
        ">
            <span style="color: var(--text-muted);">⚙️ Simulation Assumptions (${result.risk_preference} risk):</span>
            <span>Expected Return: <strong style="color:${color};">${result.assumed_annual_return}% / yr</strong></span>
            <span>Volatility: <strong style="color:${color};">${result.assumed_annual_volatility}% / yr</strong></span>
        </div>`;
}
```

---

## 6. [frontend/simulation.html](file:///c:/Users/pakza/Stocks/frontend/simulation.html)

### What changed
Added a container div for the simulation assumptions banner (populated by [simulation.js](file:///c:/Users/pakza/Stocks/frontend/js/simulation.js)).

### Added — inside the Goal Analysis card
```html
<!-- Simulation Assumptions (risk-preference-specific) -->
<div id="simulationAssumptions" style="display:none; padding: 0 var(--spacing-md) var(--spacing-md);"></div>
```

---

## 7. [frontend/js/rebalance.js](file:///c:/Users/pakza/Stocks/frontend/js/rebalance.js)

### 7a. [renderAllocationOverview()](file:///c:/Users/pakza/Stocks/frontend/js/rebalance.js#178-256) — risk-aware target donut

#### Before
```javascript
const targetWeight = (100 / numHoldings).toFixed(1);
// Always equal slices, ignores risk
```

#### After
```javascript
// Use backend's max_single_stock_weight for the target donut
const maxSingle = rebalancing?.max_single_stock_weight ?? (100 / allocation.length);
const rawEqual = 100.0 / numHoldings;
const cappedEqual = Math.min(rawEqual, maxSingle);

const targetAllocation = allocation.map(a => ({
    symbol: a.symbol,
    weight: cappedEqual   // capped at risk-appropriate limit
}));
```

### 7b. [renderDriftDetails()](file:///c:/Users/pakza/Stocks/frontend/js/rebalance.js#291-337) — risk-aware threshold for "Balanced" status

#### Before
```javascript
const targetWeight = 100 / numHoldings;  // always equal weight
if (absDeviation < 2) { status = 'Balanced'; }  // hardcoded 2%
```

#### After
```javascript
const maxSingle = rebalancing.max_single_stock_weight ?? (100 / allocation.length);
const targetWeight = Math.min(rawEqual, maxSingle);

// Threshold matches the backend drift_threshold for each risk level
const driftThreshold = rebalancing.risk_preference === 'low' ? 4
    : rebalancing.risk_preference === 'high' ? 8 : 5;

if (absDeviation < driftThreshold / 2) { status = 'Balanced'; }
```

### 7c. [renderAdjustmentSuggestions()](file:///c:/Users/pakza/Stocks/frontend/js/rebalance.js#418-463) — shows strategy description + reason column

#### Added — strategy description below the badge
```javascript
const strategyDesc = rebalancing.strategy_description || '';
const badgeEl = document.getElementById('strategyBadge');
if (strategyDesc && badgeEl) {
    let descEl = document.getElementById('strategyDesc');
    if (!descEl) {
        descEl = document.createElement('p');
        descEl.id = 'strategyDesc';
        descEl.style.cssText = 'font-size:0.78rem;color:var(--text-muted);margin-top:4px;';
        badgeEl.parentNode.insertBefore(descEl, badgeEl.nextSibling);
    }
    descEl.textContent = strategyDesc;
}
```

#### Added — new "Reason" column in adjustments table
```javascript
// Each suggestion now has a `reason` field from backend, shown in the table
<td style="font-size:0.78rem;color:var(--text-muted);">${s.reason || ''}</td>
```

---

## Summary of All Files Changed

| File | Type | What Changed |
|---|---|---|
| [backend/services/monte_carlo.py](file:///c:/Users/pakza/Stocks/backend/services/monte_carlo.py) | Backend | Risk-adjusted mu & sigma per risk_preference |
| [backend/services/portfolio_service.py](file:///c:/Users/pakza/Stocks/backend/services/portfolio_service.py) | Backend | Returns expected_annual_return in portfolio data |
| [backend/services/rebalancing.py](file:///c:/Users/pakza/Stocks/backend/services/rebalancing.py) | Backend | Full risk-aware strategy system; fixed HTTP 500 crash |
| [frontend/js/goals.js](file:///c:/Users/pakza/Stocks/frontend/js/goals.js) | Frontend | Goal cards show expected return bar with color |
| [frontend/js/simulation.js](file:///c:/Users/pakza/Stocks/frontend/js/simulation.js) | Frontend | Shows simulation assumptions (return %, volatility) |
| [frontend/simulation.html](file:///c:/Users/pakza/Stocks/frontend/simulation.html) | Frontend | Added container div for assumptions banner |
| [frontend/js/rebalance.js](file:///c:/Users/pakza/Stocks/frontend/js/rebalance.js) | Frontend | Target weights, drift threshold, reason column now risk-aware |
