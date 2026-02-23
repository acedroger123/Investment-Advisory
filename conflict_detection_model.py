from __future__ import annotations

from dataclasses import dataclass
from typing import Any


INTENSITY_SCORE = {"Low": 0.3, "Medium": 0.6, "High": 0.9}
SEVERITY_THRESHOLDS = {
    "Critical": 0.8,
    "High": 0.62,
    "Medium": 0.42,
}

GOAL_CATEGORY_CONFLICT_WEIGHTS = {
    "Emergency Fund": {
        "dinning out": 0.3,
        "shopping": 0.28,
        "entertainment": 0.25,
        "subscriptions": 0.2,
        "travel": 0.25,
    },
    "Debt Reduction": {
        "dinning out": 0.25,
        "shopping": 0.27,
        "entertainment": 0.2,
        "subscriptions": 0.22,
        "travel": 0.28,
    },
    "Investment": {
        "dinning out": 0.22,
        "shopping": 0.25,
        "entertainment": 0.22,
        "subscriptions": 0.2,
        "travel": 0.25,
    },
}

GOAL_ALIGNMENT_WEIGHTS = {
    "travel": {"Travel": 0.24},
    "medical": {"Medical Reserve": 0.22},
    "loan payments": {"Debt Reduction": 0.26},
}


@dataclass
class GoalConflictInput:
    goal_name: str
    target_amount: float
    current_amount: float
    timeline_months: int
    priority: int = 3
    protected_categories: list[str] | None = None
    goal_type: str = "General"


class ExpenseGoalConflictModel:
    """
    Rule-based conflict detector connecting detected spending behavior to active goals.
    """

    def detect_conflicts(
        self,
        habit_detection: dict[str, Any],
        active_goals: list[dict[str, Any]],
        profile: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        context = context or {}
        if not active_goals:
            return {
                "conflict_detected": False,
                "overall_conflict_score": 0.0,
                "overall_severity": "Low",
                "alerts": [],
                "explanation_text": "No active goals were provided, so no behavior-goal conflicts were evaluated.",
                "goal_conflicts": [],
            }

        behavior_pressure = self._behavior_pressure(habit_detection, profile)
        monthly_capacity = max(float(context.get("monthly_savings_capacity", 0.0)), 0.0)
        normalized_category = str(profile.get("category", "")).strip().lower()

        goal_conflicts = []
        for raw_goal in active_goals:
            goal = self._normalize_goal(raw_goal)
            category_conflict = self._category_conflict_penalty(goal, normalized_category)
            goal_pressure = self._goal_pressure(goal, monthly_capacity)
            alignment_discount = self._alignment_discount(goal, normalized_category)

            score = (
                0.45 * behavior_pressure
                + 0.35 * goal_pressure
                + 0.20 * category_conflict
                - alignment_discount
            )
            score = min(max(score, 0.0), 1.0)
            severity = self._severity(score)
            alert = self._build_alert(goal, profile, score, severity, goal_pressure)

            goal_conflicts.append(
                {
                    "goal_name": goal.goal_name,
                    "goal_type": goal.goal_type,
                    "severity": severity,
                    "conflict_score": round(score, 3),
                    "priority": goal.priority,
                    "monthly_required": round(self._monthly_required(goal), 2),
                    "recommended_action": alert["recommended_action"],
                    "explanation": alert["explanation"],
                }
            )

        goal_conflicts.sort(key=lambda x: x["conflict_score"], reverse=True)
        alerts = [
            {
                "goal_name": item["goal_name"],
                "severity": item["severity"],
                "message": item["explanation"],
                "recommended_action": item["recommended_action"],
            }
            for item in goal_conflicts
            if item["severity"] in {"Critical", "High", "Medium"}
        ][:5]

        overall_score = max(item["conflict_score"] for item in goal_conflicts)
        overall_severity = self._severity(overall_score)
        conflict_detected = overall_severity in {"Critical", "High", "Medium"}

        return {
            "conflict_detected": conflict_detected,
            "overall_conflict_score": round(overall_score, 3),
            "overall_severity": overall_severity,
            "alerts": alerts,
            "explanation_text": self._overall_explanation(
                conflict_detected,
                overall_severity,
                profile=profile,
                top_goal=goal_conflicts[0],
            ),
            "goal_conflicts": goal_conflicts,
        }

    def _normalize_goal(self, goal: dict[str, Any]) -> GoalConflictInput:
        goal_name = str(goal.get("goal_name", "Unnamed Goal")).strip() or "Unnamed Goal"
        return GoalConflictInput(
            goal_name=goal_name,
            target_amount=max(float(goal.get("target_amount", 0.0)), 0.0),
            current_amount=max(float(goal.get("current_amount", 0.0)), 0.0),
            timeline_months=max(int(goal.get("timeline_months", 1)), 1),
            priority=max(1, min(int(goal.get("priority", 3)), 5)),
            protected_categories=[str(c).strip().lower() for c in goal.get("protected_categories", [])],
            goal_type=str(goal.get("goal_type", "General")).strip() or "General",
        )

    def _behavior_pressure(self, habit_detection: dict[str, Any], profile: dict[str, Any]) -> float:
        confidence = float(habit_detection.get("confidence", 0.0))
        habit_detected = bool(habit_detection.get("habit_detected", False))
        intensity = str(habit_detection.get("habit_intensity", "Low"))
        spend = max(float(profile.get("spend", 0.0)), 0.0)
        frequency = max(float(profile.get("frequency", 0.0)), 0.0)
        weekend_ratio = min(max(float(profile.get("weekend_ratio", 0.0)), 0.0), 1.0)
        night_ratio = min(max(float(profile.get("night_ratio", 0.0)), 0.0), 1.0)
        consistency = min(max(float(profile.get("consistency", 0.0)), 0.0), 1.0)

        normalized_spend = min(spend / 4000.0, 1.0)
        normalized_frequency = min(frequency / 7.0, 1.0)
        intensity_score = INTENSITY_SCORE.get(intensity, 0.3)

        score = (
            0.28 * confidence
            + 0.20 * normalized_spend
            + 0.16 * normalized_frequency
            + 0.12 * weekend_ratio
            + 0.10 * night_ratio
            + 0.14 * consistency
        )
        if habit_detected:
            score += 0.12 * intensity_score

        return min(max(score, 0.0), 1.0)

    def _goal_pressure(self, goal: GoalConflictInput, monthly_capacity: float) -> float:
        remaining = max(goal.target_amount - goal.current_amount, 0.0)
        progress_ratio = 1.0 if goal.target_amount <= 0 else min(goal.current_amount / goal.target_amount, 1.0)
        urgency = min(1.0, 6.0 / goal.timeline_months)
        priority_weight = goal.priority / 5.0
        monthly_required = remaining / max(goal.timeline_months, 1)

        if monthly_capacity <= 0:
            affordability = 1.0 if monthly_required > 0 else 0.0
        else:
            affordability = min(monthly_required / monthly_capacity, 1.0)

        return min(
            max(
                0.40 * priority_weight
                + 0.25 * urgency
                + 0.20 * affordability
                + 0.15 * (1.0 - progress_ratio),
                0.0,
            ),
            1.0,
        )

    def _category_conflict_penalty(self, goal: GoalConflictInput, normalized_category: str) -> float:
        base_penalty = GOAL_CATEGORY_CONFLICT_WEIGHTS.get(goal.goal_type, {}).get(normalized_category, 0.12)
        if normalized_category in set(goal.protected_categories or []):
            base_penalty += 0.25
        return min(max(base_penalty, 0.0), 1.0)

    def _alignment_discount(self, goal: GoalConflictInput, normalized_category: str) -> float:
        return GOAL_ALIGNMENT_WEIGHTS.get(normalized_category, {}).get(goal.goal_type, 0.0)

    def _severity(self, score: float) -> str:
        for label, threshold in SEVERITY_THRESHOLDS.items():
            if score >= threshold:
                return label
        return "Low"

    def _monthly_required(self, goal: GoalConflictInput) -> float:
        return max(goal.target_amount - goal.current_amount, 0.0) / max(goal.timeline_months, 1)

    def _build_alert(
        self,
        goal: GoalConflictInput,
        profile: dict[str, Any],
        score: float,
        severity: str,
        goal_pressure: float,
    ) -> dict[str, str]:
        category = str(profile.get("category", "this category")).strip().lower()
        monthly_required = self._monthly_required(goal)

        explanation = (
            f"{severity} conflict: '{goal.goal_name}' may be delayed because "
            f"{category} spending behavior is competing with required monthly goal funding."
        )
        if goal_pressure >= 0.75:
            explanation += " Goal urgency and remaining funding gap are both high."

        action = (
            f"Reallocate a fixed monthly amount of at least {monthly_required:.2f} toward '{goal.goal_name}' "
            f"and set a category cap for {category}."
        )
        if score >= 0.8:
            action = (
                f"Immediate action required: freeze non-essential {category} spends for one cycle and redirect "
                f"at least {monthly_required:.2f} to '{goal.goal_name}'."
            )

        return {
            "explanation": explanation,
            "recommended_action": action,
        }

    def _overall_explanation(
        self,
        conflict_detected: bool,
        overall_severity: str,
        profile: dict[str, Any],
        top_goal: dict[str, Any],
    ) -> str:
        category = str(profile.get("category", "this category")).strip().lower()
        if not conflict_detected:
            return (
                f"Spending behavior in {category} is currently aligned with your active goals. "
                "Keep tracking monthly to catch early deviations."
            )
        return (
            f"{overall_severity} behavior-goal conflict detected. Current {category} spending pattern "
            f"creates the largest risk for goal '{top_goal['goal_name']}'."
        )
