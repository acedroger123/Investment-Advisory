from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Any
from fastapi.middleware.cors import CORSMiddleware

# Standard absolute imports
try:
    from habbit import RuleEnhancedHabitDetector
    from recommendation_engine import recommend_ranked_behaviors
    from transaction_analyzer import analyze_transaction
    from category_config import CATEGORY_TO_NATURE
    from conflict_detection_model import ExpenseGoalConflictModel
except ImportError as e:
    print(f"CRITICAL ERROR: Could not find a module or class: {e}")
    raise

app = FastAPI(title="Habit Intelligence System", version="3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8002", "http://127.0.0.1:8002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
detector = RuleEnhancedHabitDetector()
conflict_model = ExpenseGoalConflictModel()


def _goal_map(active_goals: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(g.get("goal_name", "")).strip(): g for g in active_goals}


def _build_primary_focus(goal_conflict: dict[str, Any], active_goals: list[dict[str, Any]], monthly_capacity: float) -> dict[str, Any]:
    goal_lookup = _goal_map(active_goals)
    scored_goals: list[dict[str, Any]] = []

    for gc in goal_conflict.get("goal_conflicts", []):
        goal_name = str(gc.get("goal_name", "")).strip()
        source_goal = goal_lookup.get(goal_name, {})
        priority = max(1, min(int(gc.get("priority", source_goal.get("priority", 3))), 5))
        goal_priority = priority / 5.0
        conflict_severity = min(max(float(gc.get("conflict_score", 0.0)), 0.0), 1.0)

        monthly_required = max(float(gc.get("monthly_required", 0.0)), 0.0)
        if monthly_required <= 0:
            feasibility_drop = 0.0
        else:
            feasibility = min(monthly_capacity / monthly_required, 1.0) if monthly_capacity > 0 else 0.0
            feasibility_drop = 1.0 - feasibility

        global_priority_score = goal_priority * conflict_severity * feasibility_drop
        scored_goals.append(
            {
                "goal_name": goal_name,
                "goal_type": gc.get("goal_type", source_goal.get("goal_type", "General")),
                "goal_priority": round(goal_priority, 4),
                "conflict_severity": round(conflict_severity, 4),
                "feasibility_drop": round(feasibility_drop, 4),
                "global_priority_score": round(global_priority_score, 4),
            }
        )

    if not scored_goals:
        return {
            "message": "No active goal pressure detected right now.",
            "global_priority_formula": "GoalPriority x ConflictSeverity x FeasibilityDrop",
            "scored_goals": [],
        }

    scored_goals.sort(key=lambda x: x["global_priority_score"], reverse=True)
    top = scored_goals[0]
    return {
        "message": f"Your current financial priority should be strengthening your {top['goal_name']}.",
        "global_priority_formula": "GoalPriority x ConflictSeverity x FeasibilityDrop",
        "top_goal": top,
        "scored_goals": scored_goals,
    }


def _monthly_direction(
    goal_conflict: dict[str, Any],
    habit_result: dict[str, Any],
    profile: dict[str, Any],
    alerts: list[str],
) -> str:
    overall_score = float(goal_conflict.get("overall_conflict_score", 0.0))
    intensity = str(habit_result.get("habit_intensity", "Low")).lower()
    category = str(profile.get("category", "discretionary")).replace("_", " ")

    if overall_score >= 0.75 or intensity == "high":
        return f"This month's key focus: Control discretionary spending in {category} to prevent liquidity risk."
    if overall_score >= 0.5 or len(alerts) >= 2:
        return f"This month's key focus: Stabilize {category} spending and enforce weekly caps."
    return f"This month's key focus: Maintain {category} discipline and preserve monthly savings consistency."


def _personalized_roadmap(
    primary_focus: dict[str, Any], 
    profile: dict[str, Any], 
    goal_conflict: dict[str, Any],
    expense_breakdown: dict[str, Any] | None = None,
) -> list[str]:
    top_goal = primary_focus.get("top_goal", {})
    goal_name = str(top_goal.get("goal_name", "core goals")).strip() or "core goals"
    category = str(profile.get("category", "discretionary spending")).strip()
    conflict_score = float(goal_conflict.get("overall_conflict_score", 0.0))
    
    # Get top spending categories from actual expense data
    top_categories = []
    if expense_breakdown:
        category_details = expense_breakdown.get("category_details", {})
        sorted_cats = sorted(category_details.items(), key=lambda x: x[1].get("monthly_total", 0), reverse=True)
        top_categories = [cat for cat, _ in sorted_cats[:3]]
    
    # Dynamic Step 1: Focus on the most impactful goal
    step_1 = f"Step 1: Stabilize {goal_name} reserves."
    
    # Dynamic Step 2: Target actual spending categories
    if top_categories:
        top_cat = top_categories[0]
        step_2 = f"Step 2: Reduce {top_cat} spending by 15-20% and redirect to {goal_name}."
    else:
        step_2 = f"Step 2: Optimize {category} cash flow and remove leakage."
    
    # Dynamic Step 3: Based on conflict severity
    if conflict_score >= 0.7:
        step_3 = "Step 3: Implement weekly spending caps until conflict score drops below 50%."
    elif conflict_score >= 0.5:
        step_3 = "Step 3: Set up auto-transfer on payday before discretionary access."
    elif conflict_score >= 0.3:
        step_3 = "Step 3: Increase long-term allocation efficiency after one low-conflict cycle."
    else:
        step_3 = "Step 3: Maintain current discipline and review monthly to catch early deviations."
    
    return [step_1, step_2, step_3]


def _financial_alignment_score(
    goal_conflict: dict[str, Any],
    habit_result: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    conflict_score = min(max(float(goal_conflict.get("overall_conflict_score", 0.0)), 0.0), 1.0)
    habit_conf = min(max(float(habit_result.get("confidence", 0.0)), 0.0), 1.0)
    consistency = min(max(float(profile.get("consistency", 0.5)), 0.0), 1.0)
    weekend_ratio = min(max(float(profile.get("weekend_ratio", 0.0)), 0.0), 1.0)

    alignment = (
        0.45 * (1.0 - conflict_score)
        + 0.25 * (1.0 - habit_conf)
        + 0.20 * consistency
        + 0.10 * (1.0 - weekend_ratio)
    )
    score_pct = round(min(max(alignment * 100.0, 0.0), 100.0), 1)
    if score_pct >= 85:
        label = "Strongly Aligned"
    elif score_pct >= 70:
        label = "Moderate Optimization Needed"
    elif score_pct >= 55:
        label = "Alignment At Risk"
    else:
        label = "Critical Realignment Needed"

    return {"score_pct": score_pct, "label": label}


def _recommendation_impact_summary(
    ranked_recommendations: list[dict[str, Any]],
    goal_conflict: dict[str, Any],
    expense_breakdown: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not ranked_recommendations:
        return {
            "potential_savings_monthly": 0.0,
            "goal_gap_covered_pct": 0.0,
            "timeline_reduction_months": 0.0,
        }

    top = ranked_recommendations[:3]
    avg_score = sum(float(x.get("score", 0.0)) for x in top) / len(top)
    
    # Use actual expense data for realistic savings calculation
    if expense_breakdown and expense_breakdown.get("total_monthly_discretionary", 0) > 0:
        total_monthly = expense_breakdown["total_monthly_discretionary"]
        # Realistic savings: 15-35% of discretionary spending based on recommendation quality
        savings_rate = 0.15 + (avg_score * 0.20)  # 15% to 35%
        potential_savings_monthly = round(total_monthly * savings_rate, 2)
    else:
        # Fallback to formula if no expense data
        potential_savings_monthly = round(2200.0 + avg_score * 7800.0, 2)

    top_goal = max(
        goal_conflict.get("goal_conflicts", [{}]),
        key=lambda x: float(x.get("conflict_score", 0.0)),
        default={},
    )
    monthly_required = max(float(top_goal.get("monthly_required", 0.0)), 1.0)
    goal_gap_covered_pct = round(min((potential_savings_monthly / monthly_required) * 100.0, 100.0), 1)

    timeline_reduction_months = round(
        max(0.8, sum(float(x.get("goal_timeline_reduction_months", 0.0)) for x in top) / len(top)),
        1,
    )
    return {
        "potential_savings_monthly": potential_savings_monthly,
        "goal_gap_covered_pct": goal_gap_covered_pct,
        "timeline_reduction_months": timeline_reduction_months,
    }


class ActiveGoal(BaseModel):
    goal_id: int | None = None
    goal_name: str
    goal_type: str = "General"
    target_amount: float
    current_amount: float
    timeline_months: int
    priority: int = 3
    protected_categories: list[str] = Field(default_factory=list)


class ExpenseBreakdown(BaseModel):
    total_monthly_discretionary: float = 0.0
    category_details: dict[str, Any] = Field(default_factory=dict)
    expense_count: int = 0
    date_range_weeks: int = 1


def _calculate_goal_specific_savings(
    goal_conflicts: list[dict[str, Any]],
    expense_breakdown: dict[str, Any] | None,
    total_potential_savings: float,
) -> list[dict[str, Any]]:
    """Calculate realistic savings amounts per goal based on actual expenses."""
    if not goal_conflicts:
        return []
    
    quick_wins = []
    total_monthly = expense_breakdown.get("total_monthly_discretionary", 0) if expense_breakdown else 0
    category_details = expense_breakdown.get("category_details", {}) if expense_breakdown else {}
    
    for gc in goal_conflicts[:5]:  # Top 5 goals max
        goal_name = gc.get("goal_name", "Goal")
        conflict_score = float(gc.get("conflict_score", 0.3))
        monthly_required = float(gc.get("monthly_required", 0))
        
        # Calculate difficulty based on conflict score
        if conflict_score >= 0.7:
            difficulty = "Hard"
        elif conflict_score >= 0.45:
            difficulty = "Moderate"
        else:
            difficulty = "Easy"
        
        # Calculate potential savings for this goal based on actual spending
        if total_monthly > 0:
            # Higher conflict = more potential savings by reducing that conflict
            savings_potential_rate = 0.10 + (conflict_score * 0.15)  # 10-25%
            goal_savings = round(total_monthly * savings_potential_rate, 0)
        else:
            # Fallback formula if no expense data
            goal_savings = round(3000 + conflict_score * 5000, 0)
        
        # Calculate gap coverage percentage
        gap_coverage = round((goal_savings / monthly_required) * 100, 1) if monthly_required > 0 else 0
        gap_coverage = min(gap_coverage, 100)  # Cap at 100%
        
        quick_wins.append({
            "goal_name": goal_name,
            "difficulty": difficulty,
            "monthly_savings": goal_savings,
            "gap_coverage_pct": gap_coverage,
            "conflict_score": round(conflict_score, 3),
            "monthly_required": round(monthly_required, 2),
        })
    
    return quick_wins


class HabitInput(BaseModel):
    avg_weekly_frequency: int
    consistency: float
    average_spend: float
    weeks_active: int
    weekend_ratio: float
    night_ratio: float
    category: str = "Food and groceries"
    transaction_amount: float
    transaction_hour: int
    monthly_savings_capacity: float = 0.0
    active_goals: list[ActiveGoal] = Field(default_factory=list)
    expense_breakdown: ExpenseBreakdown | None = None


class GoalConflictRequest(BaseModel):
    habit_detection: dict[str, Any]
    profile: dict[str, Any]
    active_goals: list[ActiveGoal]
    monthly_savings_capacity: float = 0.0


@app.post("/habits/analyze")
def analyze(data: HabitInput):
    category_key = data.category.strip().lower()
    if category_key not in CATEGORY_TO_NATURE:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Unsupported category.",
                "allowed_categories": sorted(CATEGORY_TO_NATURE.keys()),
            },
        )

    features = {
        "avg_weekly_frequency": data.avg_weekly_frequency,
        "consistency": data.consistency,
        "average_spend": data.average_spend,
        "weeks_active": data.weeks_active,
        "weekend_ratio": data.weekend_ratio,
        "night_ratio": data.night_ratio,
    }
    habit_result = detector.predict(features, data.category)

    profile = {
        "confidence": habit_result["confidence"],
        "frequency": data.avg_weekly_frequency,
        "consistency": data.consistency,
        "weeks_active": data.weeks_active,
        "spend": data.average_spend,
        "night_ratio": data.night_ratio,
        "weekend_ratio": data.weekend_ratio,
        "category": category_key,
        "expense_nature": CATEGORY_TO_NATURE[category_key],
        "habit_intensity": habit_result["habit_intensity"],
    }

    transaction = {
        "amount": data.transaction_amount,
        "is_late_night": data.transaction_hour >= 22,
    }
    transaction_messages = analyze_transaction(transaction, profile)
    alerts = transaction_messages[:2]
    is_fixed = CATEGORY_TO_NATURE[category_key] == "Fixed"
    intervention_level = "Low" if is_fixed else habit_result["habit_intensity"]
    habit_confidence = 0.0 if is_fixed else habit_result["confidence"]
    goal_conflict = conflict_model.detect_conflicts(
        habit_detection=habit_result,
        active_goals=[goal.model_dump() for goal in data.active_goals],
        profile=profile,
        context={"monthly_savings_capacity": data.monthly_savings_capacity},
    )
    ranked_recommendations = recommend_ranked_behaviors(
        habit_detection=habit_result,
        profile=profile,
        upstream_outputs={
            "habit_detection": habit_result,
            "goal_conflict": goal_conflict,
            "transaction_analysis": {"alerts": alerts},
            "active_goals": [goal.model_dump() for goal in data.active_goals],
        },
        top_k=10,
    )
    recommendations = [item["recommendation"] for item in ranked_recommendations]
    primary_strategy = recommendations[0] if recommendations else "Set a weekly spending cap."
    active_goals = [goal.model_dump() for goal in data.active_goals]
    primary_focus = _build_primary_focus(
        goal_conflict=goal_conflict,
        active_goals=active_goals,
        monthly_capacity=max(float(data.monthly_savings_capacity), 0.0),
    )
    monthly_strategic_direction = _monthly_direction(
        goal_conflict=goal_conflict,
        habit_result=habit_result,
        profile=profile,
        alerts=alerts,
    )
    # Define expense_breakdown_dict BEFORE using it
    expense_breakdown_dict = data.expense_breakdown.model_dump() if data.expense_breakdown else None
    personalized_roadmap = _personalized_roadmap(
        primary_focus=primary_focus,
        profile=profile,
        goal_conflict=goal_conflict,
        expense_breakdown=expense_breakdown_dict,
    )
    financial_alignment = _financial_alignment_score(
        goal_conflict=goal_conflict,
        habit_result=habit_result,
        profile=profile,
    )
    impact_summary = _recommendation_impact_summary(
        ranked_recommendations=ranked_recommendations,
        goal_conflict=goal_conflict,
        expense_breakdown=expense_breakdown_dict,
    )
    
    # Calculate goal-specific Quick Wins with actual expense data
    quick_wins = _calculate_goal_specific_savings(
        goal_conflicts=goal_conflict.get("goal_conflicts", []),
        expense_breakdown=expense_breakdown_dict,
        total_potential_savings=impact_summary.get("potential_savings_monthly", 0),
    )

    unified_summary = (
        f"{intervention_level} intervention: {primary_strategy} "
        f"Key alert: {alerts[0]}"
    )
    if len(alerts) > 1:
        unified_summary += f" Also, {alerts[1]}"
    if goal_conflict["alerts"]:
        unified_summary += f" Goal conflict: {goal_conflict['alerts'][0]['message']}"

    # Include actual expense summary for transparency
    expense_summary = None
    if expense_breakdown_dict:
        expense_summary = {
            "total_monthly_discretionary": expense_breakdown_dict.get("total_monthly_discretionary", 0),
            "expense_count": expense_breakdown_dict.get("expense_count", 0),
            "date_range_weeks": expense_breakdown_dict.get("date_range_weeks", 1),
            "top_categories": list(expense_breakdown_dict.get("category_details", {}).keys())[:5],
        }

    return {
        "habit_detected": habit_result["habit_detected"],
        "habit_category": habit_result["habit_category"],
        "habit_intensity": habit_result["habit_intensity"],
        "habit_confidence": habit_confidence,
        "habit_scores": habit_result.get("scores", {}),
        "primary_strategy": primary_strategy,
        "transaction_alert": alerts,
        "goal_conflict": goal_conflict,
        "ranked_recommendations": ranked_recommendations,
        "quick_wins": quick_wins,  # NEW: Goal-specific savings based on actual expenses
        "ai_guidance": {
            "primary_financial_focus_area": primary_focus,
            "monthly_strategic_direction": monthly_strategic_direction,
            "personalized_roadmap_suggestion": personalized_roadmap,
            "financial_alignment_score": financial_alignment,
            "impact_summary": impact_summary,
        },
        "unified_summary": unified_summary,
        "intervention_level": intervention_level,
        "analyzed_category": category_key,
        "spending_profile": {
            "avg_weekly_frequency": data.avg_weekly_frequency,
            "consistency": round(data.consistency, 2),
            "average_spend": round(data.average_spend, 2),
            "weeks_active": data.weeks_active,
            "weekend_ratio": round(data.weekend_ratio, 2),
        },
        "expense_summary": expense_summary,  # NEW: Shows what expense data was used
    }


@app.post("/habits/goal-conflicts")
def detect_goal_conflicts(data: GoalConflictRequest):
    result = conflict_model.detect_conflicts(
        habit_detection=data.habit_detection,
        active_goals=[goal.model_dump() for goal in data.active_goals],
        profile=data.profile,
        context={"monthly_savings_capacity": data.monthly_savings_capacity},
    )
    return result


@app.get("/")
def root():
    return {"status": "Habit Intelligence System running"}
