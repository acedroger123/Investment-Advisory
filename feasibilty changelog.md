# Goal Feasibility — Full Code Changelog

---

## 🆕 NEW: [backend/services/goal_feasibility.py](file:///c:/Users/pakza/Stocks/backend/services/goal_feasibility.py)

Complete new service. Calculates feasibility, required capital, profit needed, and three options.

```python
"""
Goal Feasibility Service - Evaluates whether a financial goal is achievable
and provides concrete alternative options when it is not.
"""
from datetime import date, timedelta
from typing import Dict


# Risk level benchmarks: expected annual return (realistic) and max (optimistic ceiling)
RISK_BENCHMARKS = {
    "low":      {"expected": 0.10, "max": 0.12, "label": "Low"},
    "moderate": {"expected": 0.14, "max": 0.20, "label": "Moderate"},
    "high":     {"expected": 0.20, "max": 0.30, "label": "High"},
}

RISK_TIERS = ["low", "moderate", "high"]
MIN_DAYS = 30


def check_feasibility(
    target_amount: float,
    profit_buffer: float,
    deadline: date,
    risk_preference: str,
) -> Dict:
    target_value = target_amount * (1 + profit_buffer)
    today = date.today()
    days_remaining = (deadline - today).days
    years = days_remaining / 365.25

    benchmark = RISK_BENCHMARKS.get(risk_preference, RISK_BENCHMARKS["moderate"])
    expected_return = benchmark["expected"]
    max_return = benchmark["max"]

    # Required capital: lump sum needed today at expected return
    if years > 0:
        required_capital = target_value / ((1 + expected_return) ** years)
    else:
        required_capital = target_value

    profit_needed = target_value
    required_return_pct = round(expected_return * 100, 1)

    # --- Classification: scale check + timeline check ---
    TINY_GOAL_THRESHOLD = 25_000

    min_feasible_years   = {"low": 5.0, "moderate": 3.0, "high": 2.0}
    min_challenging_years = {"low": 1.0, "moderate": 0.5, "high": 0.25}

    min_f = min_feasible_years.get(risk_preference, 3.0)
    min_c = min_challenging_years.get(risk_preference, 0.5)
    years_adj = years + 0.01  # absorb 365 vs 365.25 rounding

    if days_remaining < MIN_DAYS:
        level = "impossible"
        summary = f"Timeline is too short ({days_remaining} days). Stock market investing requires at least a month."
    elif required_capital <= TINY_GOAL_THRESHOLD:
        level = "feasible"
        summary = f"This is a small, very achievable goal — only ~{required_capital:,.0f} needs to be accumulated in stocks. 🟢"
    elif years_adj >= min_f:
        level = "feasible"
        summary = f"This goal is realistic — you have {round(years, 1)} years, enough for compounding at ~{round(expected_return*100,0):.0f}%/yr to make a real difference. 🟢"
    elif years_adj >= min_c:
        level = "challenging"
        summary = f"This goal is ambitious — {round(years, 1)} years is a short window for {risk_preference} risk investing. Consider extending your deadline. 🟡"
    else:
        level = "impossible"
        summary = f"Very unlikely in {round(years, 1)} years — the timeline is too compressed for {risk_preference} risk returns to close the gap. 🔴"

    option_a = _option_extend_deadline(target_value, expected_return, max_return, today, deadline, risk_preference)
    option_b = _option_lower_target(target_value, profit_buffer, expected_return, max_return, years, days_remaining)
    option_c = _option_upgrade_risk(target_value, years, days_remaining, risk_preference)

    return {
        "feasibility_level": level,
        "required_capital": round(required_capital, 2),
        "profit_needed": round(profit_needed, 2),
        "required_return_pct": required_return_pct,
        "target_value": round(target_value, 2),
        "days_remaining": days_remaining,
        "years": round(years, 2),
        "risk_preference": risk_preference,
        "summary": summary,
        "options": {
            "option_a": option_a,
            "option_b": option_b,
            "option_c": option_c,
        },
    }


def _option_extend_deadline(target_value, expected_return, max_return, today, current_deadline, risk_preference):
    """Option A: exact extra years needed to reach the feasible threshold."""
    min_feasible_years = {"low": 5.0, "moderate": 3.0, "high": 2.0}
    target_years = min_feasible_years.get(risk_preference, 3.0)
    current_years = (current_deadline - today).days / 365.25

    if current_years >= target_years:
        extra_years = 1
    else:
        import math
        extra_years = math.ceil(target_years - current_years)

    new_total_days = int((current_years + extra_years) * 365.25)
    new_deadline = today + timedelta(days=new_total_days)
    return {
        "label": "Extend Deadline",
        "description": f"Add {extra_years} year{'s' if extra_years > 1 else ''} → new deadline {new_deadline.isoformat()} (total {round(current_years + extra_years, 0):.0f} years)",
        "new_deadline": new_deadline.isoformat(),
        "extra_years": extra_years,
    }


def _option_lower_target(target_value, profit_buffer, expected_return, max_return, years, days_remaining):
    """Option B: lower target to what's achievable at 50% of ideal capital."""
    if years <= 0:
        feasible_target_value = target_value * 0.5
    else:
        ideal_capital = target_value / ((1 + expected_return) ** years)
        conservative_capital = ideal_capital * 0.5
        feasible_target_value = conservative_capital * ((1 + expected_return) ** years)

    feasible_target_amount = feasible_target_value / (1 + profit_buffer)
    return {
        "label": "Lower Target",
        "description": f"Reduce target to ₹{feasible_target_amount:,.0f} (achievable at {round(expected_return * 100, 0):.0f}%/yr)",
        "new_target_amount": round(feasible_target_amount, 2),
        "new_target_value": round(feasible_target_value, 2),
    }


def _option_upgrade_risk(target_value, years, days_remaining, risk_preference):
    """Option C: upgrade to the next risk tier."""
    current_idx = RISK_TIERS.index(risk_preference) if risk_preference in RISK_TIERS else 1
    if current_idx >= len(RISK_TIERS) - 1:
        return {"label": "Upgrade Risk", "description": "Already at highest risk level.", "new_risk": risk_preference, "available": False}

    next_risk = RISK_TIERS[current_idx + 1]
    next_benchmark = RISK_BENCHMARKS[next_risk]
    next_expected = next_benchmark["expected"]

    if years > 0:
        required_capital_at_next = target_value / ((1 + next_expected) ** years)
        conservative = required_capital_at_next * 0.5
        implied = (target_value / conservative) ** (1 / years) - 1 if conservative > 0 else float("inf")
        within_next = implied <= next_benchmark["max"]
    else:
        within_next = False

    feasibility_note = "becomes feasible" if within_next else "still challenging, but more realistic"
    return {
        "label": f"Switch to {next_benchmark['label']} Risk",
        "description": f"Upgrade to {next_benchmark['label']} risk (~{round(next_expected * 100, 0):.0f}%/yr expected) — goal {feasibility_note}.",
        "new_risk": next_risk,
        "available": True,
    }
```

---

## 🆕 NEW: [backend/tests/test_goal_feasibility.py](file:///c:/Users/pakza/Stocks/backend/tests/test_goal_feasibility.py)

17 unit tests — pure logic, no database or HTTP.

```python
"""
Unit tests for the goal feasibility service.
"""
import pytest
from datetime import date, timedelta
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from services.goal_feasibility import check_feasibility, RISK_BENCHMARKS


def future(years=3):
    return date.today() + timedelta(days=int(years * 365))


class TestGoalFeasibility:

    # Feasibility levels
    def test_moderate_3yr_small_target_is_feasible(self):
        result = check_feasibility(100_000, 0.10, future(3.1), "moderate")
        assert result["feasibility_level"] == "feasible"

    def test_very_large_target_short_timeline_is_impossible(self):
        deadline = date.today() + timedelta(days=20)
        result = check_feasibility(5_000_000, 0.10, deadline, "high")
        assert result["feasibility_level"] == "impossible"

    def test_below_30_days_is_impossible(self):
        deadline = date.today() + timedelta(days=20)
        result = check_feasibility(10_000, 0.10, deadline, "low")
        assert result["feasibility_level"] == "impossible"

    def test_aggressive_target_moderate_risk_is_challenging_or_impossible(self):
        result = check_feasibility(500_000, 0.10, future(2), "moderate")
        assert result["feasibility_level"] in ("challenging", "impossible")

    # Required capital
    def test_required_capital_is_less_than_target_value(self):
        result = check_feasibility(500_000, 0.10, future(5), "moderate")
        assert result["required_capital"] < result["target_value"]

    def test_target_value_includes_profit_buffer(self):
        result = check_feasibility(100_000, 0.10, future(3), "moderate")
        assert result["target_value"] == pytest.approx(110_000.0)

    def test_profit_needed_equals_target_value(self):
        result = check_feasibility(200_000, 0.15, future(4), "high")
        assert result["profit_needed"] == pytest.approx(result["target_value"])

    # Option A
    def test_option_a_returns_later_deadline(self):
        deadline = future(1)
        result = check_feasibility(1_000_000, 0.10, deadline, "moderate")
        assert date.fromisoformat(result["options"]["option_a"]["new_deadline"]) > deadline

    def test_option_a_has_positive_extra_years(self):
        result = check_feasibility(2_000_000, 0.10, future(2), "low")
        assert result["options"]["option_a"]["extra_years"] >= 1

    # Option B
    def test_option_b_lower_target_is_less_than_original(self):
        result = check_feasibility(5_000_000, 0.10, future(2), "moderate")
        assert result["options"]["option_b"]["new_target_amount"] < 5_000_000

    def test_option_b_target_value_less_than_original(self):
        result = check_feasibility(2_000_000, 0.10, future(3), "low")
        assert result["options"]["option_b"]["new_target_value"] < result["target_value"]

    # Option C
    def test_option_c_low_upgrades_to_moderate(self):
        result = check_feasibility(500_000, 0.10, future(3), "low")
        assert result["options"]["option_c"]["new_risk"] == "moderate"

    def test_option_c_moderate_upgrades_to_high(self):
        result = check_feasibility(500_000, 0.10, future(2), "moderate")
        assert result["options"]["option_c"]["new_risk"] == "high"

    def test_option_c_high_risk_not_available(self):
        result = check_feasibility(500_000, 0.10, future(2), "high")
        assert result["options"]["option_c"]["available"] is False

    # Structural
    def test_result_has_all_required_keys(self):
        result = check_feasibility(300_000, 0.10, future(3), "moderate")
        required = {"feasibility_level", "required_capital", "profit_needed", "target_value", "days_remaining", "years", "summary", "options"}
        assert required.issubset(result.keys())

    def test_options_has_three_entries(self):
        result = check_feasibility(300_000, 0.10, future(3), "moderate")
        assert set(result["options"].keys()) == {"option_a", "option_b", "option_c"}

    def test_summary_is_non_empty_string(self):
        result = check_feasibility(100_000, 0.10, future(3), "moderate")
        assert isinstance(result["summary"], str) and len(result["summary"]) > 0
```

---

## ✏️ MODIFIED: [backend/routers/goals.py](file:///c:/Users/pakza/Stocks/backend/routers/goals.py)

### What changed
- Added import: `from services.goal_feasibility import check_feasibility`
- Added [FeasibilityCheck](file:///c:/Users/pakza/Stocks/backend/routers/goals.py#29-35) Pydantic schema
- Added `POST /goals/check-feasibility` endpoint
- [create_goal](file:///c:/Users/pakza/Stocks/backend/routers/goals.py#93-142) now calls [check_feasibility](file:///c:/Users/pakza/Stocks/backend/services/goal_feasibility.py#23-188) and returns [feasibility](file:///c:/Users/pakza/Stocks/backend/services/goal_feasibility.py#23-188) in response

```python
# New schema
class FeasibilityCheck(BaseModel):
    target_amount: float = Field(..., gt=0)
    profit_buffer: float = Field(default=0.10, ge=0, le=0.5)
    deadline: date
    risk_preference: str = Field(default="moderate", pattern="^(low|moderate|high)$")


# New endpoint — must be declared BEFORE /{goal_id} routes
@router.post("/check-feasibility", response_model=dict)
async def check_goal_feasibility(data: FeasibilityCheck):
    """Check feasibility of a goal before creating it."""
    if data.deadline <= date.today():
        raise HTTPException(status_code=400, detail="Deadline must be in the future")
    return check_feasibility(
        target_amount=data.target_amount,
        profit_buffer=data.profit_buffer,
        deadline=data.deadline,
        risk_preference=data.risk_preference,
    )


# create_goal now attaches feasibility to response
@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_goal(goal: GoalCreate, db: Session = Depends(get_db)):
    # ... (goal creation unchanged) ...
    feasibility = check_feasibility(
        target_amount=goal.target_amount,
        profit_buffer=goal.profit_buffer,
        deadline=goal.deadline,
        risk_preference=goal.risk_preference,
    )
    return {
        "message": "Goal created successfully",
        "goal": { ... },
        "feasibility": feasibility,   # ← added
    }
```

---

## ✏️ MODIFIED: [frontend/js/api.js](file:///c:/Users/pakza/Stocks/frontend/js/api.js)

### What changed
Added [checkFeasibility](file:///c:/Users/pakza/Stocks/frontend/js/api.js#69-75) method to `GoalsAPI`:

```javascript
async checkFeasibility(data) {
    return apiRequest('/goals/check-feasibility', {
        method: 'POST',
        body: JSON.stringify(data),
    });
},
```

---

## ✏️ MODIFIED: [frontend/goals.html](file:///c:/Users/pakza/Stocks/frontend/goals.html)

### What changed
Added `<div id="feasibilityPanel">` inside the Create Goal modal, between the risk dropdown and the form action buttons:

```html
<!-- Feasibility panel — shown dynamically after fields are filled -->
<div id="feasibilityPanel" style="display:none;"></div>
```

---

## ✏️ MODIFIED: [frontend/js/goals.js](file:///c:/Users/pakza/Stocks/frontend/js/goals.js)

### What changed

#### 1. Label renamed in [renderFeasibilityPanel](file:///c:/Users/pakza/Stocks/frontend/js/goals.js#197-262)
```diff
- <span>Capital Needed (lump sum)</span>
+ <span>Invest in Stocks Over Time</span>
```

#### 2. Option A button shows exact years
```diff
- 📅 ${optA.label}
+ 📅 Extend by ${optA.extra_years} Year${optA.extra_years > 1 ? 's' : ''}
```

#### 3. New functions added

```javascript
// Auto-trigger on field change (debounced 600ms)
function scheduleFeasibilityCheck() {
    clearTimeout(_feasibilityTimer);
    _feasibilityTimer = setTimeout(runFeasibilityCheck, 600);
}

async function runFeasibilityCheck() {
    const targetVal = document.getElementById('targetAmountInput').value;
    const bufferVal = document.getElementById('profitBuffer').value;
    const deadline  = document.getElementById('goalDeadline').value;
    const risk      = document.getElementById('riskPreference').value;

    if (!targetVal || !deadline) return;

    const panel = document.getElementById('feasibilityPanel');
    panel.style.display = 'block';
    panel.innerHTML = '<p>Checking feasibility…</p>';

    try {
        const result = await API.Goals.checkFeasibility({ target_amount: parseFloat(targetVal), profit_buffer: parseFloat(bufferVal || 10) / 100, deadline, risk_preference: risk });
        renderFeasibilityPanel(result);
    } catch (err) {
        panel.innerHTML = '';
        panel.style.display = 'none';
    }
}

// Renders color-coded panel with stats and option buttons
function renderFeasibilityPanel(r) {
    const level = r.feasibility_level;
    const colors = {
        feasible:    { bg: 'rgba(16,185,129,0.1)',  border: '#10b981', badge: '#10b981', icon: '🟢' },
        challenging: { bg: 'rgba(245,158,11,0.1)',  border: '#f59e0b', badge: '#f59e0b', icon: '🟡' },
        impossible:  { bg: 'rgba(239,68,68,0.1)',   border: '#ef4444', badge: '#ef4444', icon: '🔴' },
    };
    // ... renders panel with two stat cards + option buttons when not feasible ...
    window._lastFeasibilityResult = r;
}

// Pre-fills form field with option value and re-checks
function applyFeasibilityOption(opt) {
    const r = window._lastFeasibilityResult;
    if (opt === 'a') document.getElementById('goalDeadline').value = r.options.option_a.new_deadline;
    if (opt === 'b') document.getElementById('targetAmountInput').value = Math.round(r.options.option_b.new_target_amount);
    if (opt === 'c') document.getElementById('riskPreference').value = r.options.option_c.new_risk;
    runFeasibilityCheck();
}

// Hides the panel
function dismissFeasibilityPanel() {
    const panel = document.getElementById('feasibilityPanel');
    if (panel) { panel.innerHTML = ''; panel.style.display = 'none'; }
}
```

#### 4. [resetForm](file:///c:/Users/pakza/Stocks/frontend/js/goals.js#349-358) updated
```diff
  function resetForm() {
      document.getElementById('goalForm').reset();
      document.getElementById('goalId').value = '';
      document.getElementById('modalTitle').textContent = 'Create New Goal';
      document.getElementById('saveBtn').textContent = 'Save Goal';
      setMinDeadlineDate();
+     dismissFeasibilityPanel();
+     window._lastFeasibilityResult = null;
  }
```

#### 5. Event listeners wired on DOMContentLoaded
```javascript
function attachFeasibilityListeners() {
    ['targetAmountInput', 'profitBuffer', 'goalDeadline', 'riskPreference'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', scheduleFeasibilityCheck);
            el.addEventListener('blur',   scheduleFeasibilityCheck);
        }
    });
}
document.addEventListener('DOMContentLoaded', () => { attachFeasibilityListeners(); });
```
