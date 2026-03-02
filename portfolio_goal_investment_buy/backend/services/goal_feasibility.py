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

# Risk tier order for Option C (upgrade)
RISK_TIERS = ["low", "moderate", "high"]

# Minimum days to consider a goal investable at all
MIN_DAYS = 30


def check_feasibility(
    target_amount: float,
    profit_buffer: float,
    deadline: date,
    risk_preference: str,
) -> Dict:
    """
    Evaluate goal feasibility at creation time.

    Parameters
    ----------
    target_amount     : the raw target (before profit buffer)
    profit_buffer     : e.g. 0.10 for 10 %
    deadline          : goal deadline date
    risk_preference   : "low" | "moderate" | "high"

    Returns a dict with:
    - feasibility_level  : "feasible" | "challenging" | "impossible"
    - required_capital   : lump-sum needed today to reach target_value
    - profit_needed      : target_value (profit needed from zero investment)
    - required_return_pct: annualised return implied by investing ~required_capital
    - options            : list of alternatives (A, B, C) to make goal feasible
    - summary            : human-readable one-liner
    """
    target_value = target_amount * (1 + profit_buffer)
    today = date.today()
    days_remaining = (deadline - today).days
    years = days_remaining / 365.25

    benchmark = RISK_BENCHMARKS.get(risk_preference, RISK_BENCHMARKS["moderate"])
    expected_return = benchmark["expected"]
    max_return = benchmark["max"]

    # --- Key metrics --------------------------------------------------------

    # Capital needed: how much to invest today as a lump sum (using expected return)
    if years > 0:
        required_capital = target_value / ((1 + expected_return) ** years)
    else:
        required_capital = target_value  # degenerate

    # Profit needed from zero — always == target_value (you'd need the whole amount as profit)
    profit_needed = target_value

    # Required annualised return implied by the expected-return lump sum scenario
    # (used only for display / classification)
    required_return_pct = round(expected_return * 100, 1)

    # --- Feasibility classification -----------------------------------------
    # Simple, intuitive approach: at goal creation time, we don't know how much
    # the user will invest. So we classify based on whether the TIMELINE is
    # sufficient to realistically reach the target at the expected return,
    # given a sensible investing pace.
    #
    # We check: what is the MINIMUM years needed so that ₹1 invested at
    # expected_return grows to (growth_multiple) times itself?
    # growth_multiple here = 1 / (required_capital / target_value)
    # Since required_capital = target_value / (1 + expected_return)^years,
    # the growth multiple is exactly (1 + expected_return)^years.
    #
    # Classification by comparing required return to max_return directly:
    # - Feasible:    expected_return is within the risk level's MAX range
    # - Challenging: required return would be between max_return and max_return * 2
    # - Impossible:  timeline < MIN_DAYS OR target is astronomically large for the period
    #
    # from a starting point equal to 'required_capital * factor'?
    # Factor = 1.0 means "user invests the exact ideal lump sum" → always = expected_return
    # Instead we use another question: How many years does it take at max_return to
    # grow to the target from required_capital?
    #
    # --- Feasibility classification -----------------------------------------
    # Two signals combined:
    #
    # 1. SCALE CHECK: if required_capital is tiny (< ₹25,000), the goal is
    #    so small that virtually any investing pace achieves it → always feasible.
    #
    # 2. TIMELINE CHECK: does the deadline give enough time for compounding
    #    to meaningfully help, given the risk level?
    #    Thresholds (using years + small epsilon to absorb date rounding):
    #      low:      >= 5 yr → feasible, >= 1 yr → challenging, else impossible
    #      moderate: >= 3 yr → feasible, >= 0.5 yr → challenging, else impossible
    #      high:     >= 2 yr → feasible, >= 0.25 yr → challenging, else impossible
    #    ('1 year deadline' → 365 days / 365.25 = 0.9993 yr; epsilon prevents
    #     this from falling below a 1.0 threshold accidentally.)

    TINY_GOAL_THRESHOLD = 25_000  # ₹25,000 — always feasible regardless of timeline

    min_feasible_years   = {"low": 5.0, "moderate": 3.0, "high": 2.0}
    min_challenging_years = {"low": 1.0, "moderate": 0.5, "high": 0.25}

    min_f = min_feasible_years.get(risk_preference, 3.0)
    min_c = min_challenging_years.get(risk_preference, 0.5)

    # Small epsilon absorbs the 365 vs 365.25 rounding difference
    years_adj = years + 0.01

    if days_remaining < MIN_DAYS:
        level = "impossible"
        summary = (
            f"Timeline is too short ({days_remaining} days). "
            "Stock market investing requires at least a month."
        )
    elif required_capital <= TINY_GOAL_THRESHOLD:
        # Scale check: goal is so small it's trivially achievable
        level = "feasible"
        summary = (
            f"This is a small, very achievable goal — "
            f"only ~{required_capital:,.0f} needs to be accumulated in stocks. 🟢"
        )
    elif years_adj >= min_f:
        level = "feasible"
        summary = (
            f"This goal is realistic — you have {round(years, 1)} years, enough for "
            f"compounding at ~{round(expected_return*100,0):.0f}%/yr to make a real difference. 🟢"
        )
    elif years_adj >= min_c:
        level = "challenging"
        summary = (
            f"This goal is ambitious — {round(years, 1)} years is a short window for "
            f"{risk_preference} risk investing. Consider extending your deadline. 🟡"
        )
    else:
        level = "impossible"
        summary = (
            f"Very unlikely in {round(years, 1)} years — the timeline is too compressed "
            f"for {risk_preference} risk returns to close the gap. 🔴"
        )







    # --- Option A: Extend deadline ------------------------------------------
    option_a = _option_extend_deadline(
        target_value, expected_return, max_return, today, deadline, risk_preference
    )

    # --- Option B: Lower target ---------------------------------------------
    option_b = _option_lower_target(
        target_value, profit_buffer, expected_return, max_return, years, days_remaining
    )

    # --- Option C: Upgrade risk level ---------------------------------------
    option_c = _option_upgrade_risk(
        target_value, years, days_remaining, risk_preference
    )

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


# ---------------------------------------------------------------------------
# Option helpers
# ---------------------------------------------------------------------------

def _option_extend_deadline(
    target_value: float,
    expected_return: float,
    max_return: float,
    today: date,
    current_deadline: date,
    risk_preference: str,
) -> Dict:
    """
    Option A: How many extra years are needed for the goal to become feasible?
    Uses the same threshold as the main classification:
      low → 5 yr, moderate → 3 yr, high → 2 yr
    Calculates the exact extra years needed and rounds up to the nearest whole year.
    """
    min_feasible_years = {"low": 5.0, "moderate": 3.0, "high": 2.0}
    target_years = min_feasible_years.get(risk_preference, 3.0)

    current_years = (current_deadline - today).days / 365.25

    if current_years >= target_years:
        # Already meets the feasible threshold — suggest 1 extra year as a buffer
        extra_years = 1
    else:
        import math
        extra_years = math.ceil(target_years - current_years)

    # Build the new deadline
    new_total_days = int((current_years + extra_years) * 365.25)
    new_deadline = today + timedelta(days=new_total_days)

    return {
        "label": "Extend Deadline",
        "description": (
            f"Add {extra_years} year{'s' if extra_years > 1 else ''} "
            f"→ new deadline {new_deadline.isoformat()} "
            f"(total {round(current_years + extra_years, 0):.0f} years)"
        ),
        "new_deadline": new_deadline.isoformat(),
        "extra_years": extra_years,
    }



def _option_lower_target(
    target_value: float,
    profit_buffer: float,
    expected_return: float,
    max_return: float,
    years: float,
    days_remaining: int,
) -> Dict:
    """
    Option B: Maximum target achievable in the given timeline.
    Assumes investor puts in the ideal lump-sum capital (based on expected return)
    and the portfolio grows at expected_return.

    Since required_capital = target / (1+r)^n, and the investor can invest
    an amount = required_capital (for the *max* achievable target),
    the max target = required_capital * (1+r)^n at expected_return.

    Simplified: max_target = current_target * (expected_return / actual_needed_return).
    We just pick: the ideal lump-sum grows at expected_return over the period.
    A sensible benchmark: assume investor puts in 50 % of ideal capital.
    Max target = 0.5 * required_ideal_capital * (1 + expected_return)^years.
    """
    if years <= 0:
        feasible_target_value = target_value * 0.5
    else:
        ideal_capital = target_value / ((1 + expected_return) ** years)
        conservative_capital = ideal_capital * 0.5
        feasible_target_value = conservative_capital * ((1 + expected_return) ** years)

    # Back out target_amount from target_value
    feasible_target_amount = feasible_target_value / (1 + profit_buffer)

    return {
        "label": "Lower Target",
        "description": (
            f"Reduce target to ₹{feasible_target_amount:,.0f} "
            f"(achievable at {round(expected_return * 100, 0):.0f}%/yr)"
        ),
        "new_target_amount": round(feasible_target_amount, 2),
        "new_target_value": round(feasible_target_value, 2),
    }


def _option_upgrade_risk(
    target_value: float,
    years: float,
    days_remaining: int,
    risk_preference: str,
) -> Dict:
    """
    Option C: Switch to the next risk tier.
    Returns None if already at highest risk.
    """
    current_idx = RISK_TIERS.index(risk_preference) if risk_preference in RISK_TIERS else 1

    if current_idx >= len(RISK_TIERS) - 1:
        return {
            "label": "Upgrade Risk",
            "description": "Already at highest risk level (High). No further upgrade available.",
            "new_risk": risk_preference,
            "available": False,
        }

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
        "description": (
            f"Upgrade to {next_benchmark['label']} risk (~{round(next_expected * 100, 0):.0f}%/yr expected) "
            f"— goal {feasibility_note}."
        ),
        "new_risk": next_risk,
        "available": True,
    }
