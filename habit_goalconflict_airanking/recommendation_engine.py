import joblib
import pandas as pd

try:
    from .nlp_ranker import rank_templates
    from .recommendation_ranking_model import (
        RecommendationRankingPersonalizationModel,
        build_ranking_input,
    )
except ImportError:
    from nlp_ranker import rank_templates
    from recommendation_ranking_model import (
        RecommendationRankingPersonalizationModel,
        build_ranking_input,
    )


TEMPLATE_LIBRARY = {
    "time_shift": [
        "Plan this category earlier in the day and use a consistent purchase window.",
        "Shift purchases to a planned daytime slot to improve spending consistency.",
    ],
    "home_substitution": [
        "Replace one paid convenience purchase this week with a home-prepared alternative.",
        "Try a home-first routine three days a week, then buy only what is still needed.",
    ],
    "bundle_plan": [
        "Batch this category into 1-2 planned purchases per week instead of many small spends.",
        "Create a short list and buy once per cycle to reduce repeat purchases.",
    ],
    "low_cost_swap": [
        "Switch to one lower-cost alternative item each cycle while keeping the same habit need.",
        "Keep the behavior but choose budget-tier options for at least half of purchases.",
    ],
    "cooldown_rule": [
        "Route unplanned purchases in this category into the next scheduled spending cycle.",
        "If an item is outside your plan, re-evaluate it in the next planned review.",
    ],
}

INTENSITY_MULTIPLIER = {"Low": 0.9, "Medium": 1.0, "High": 1.15}


def _load_model():
    for path in ("strategy_ranker.pkl", "strategy_ranker_model.pkl"):
        try:
            return joblib.load(path)
        except Exception:
            continue
    return None


_STRATEGY_MODEL = _load_model()
_RANKING_MODEL = RecommendationRankingPersonalizationModel()


def _ml_or_heuristic_score(profile: dict, effort: float, cost_impact: float) -> float:
    confidence = float(profile["confidence"])
    frequency = float(profile["frequency"])
    spend = float(profile["spend"])
    base_risk = min(1.0, 0.5 * confidence + 0.3 * (frequency / 7.0) + 0.2 * (spend / 1000.0))

    if _STRATEGY_MODEL is not None:
        features = pd.DataFrame(
            [[base_risk, frequency, spend, effort, cost_impact]],
            columns=["habit_confidence", "frequency", "spend", "effort", "cost_impact"],
        )
        proba = _STRATEGY_MODEL.predict_proba(features)[0][1]
        return float(proba)

    heuristic = 0.55 * base_risk + 0.35 * cost_impact - 0.3 * effort
    return float(max(0.0, min(1.0, heuristic)))


def _template_boost(template_key: str, profile: dict) -> float:
    category = str(profile.get("category", "")).strip().lower()
    weekend_ratio = float(profile.get("weekend_ratio", 0))
    night_ratio = float(profile.get("night_ratio", 0))
    frequency = float(profile.get("frequency", 0))
    spend = float(profile.get("spend", 0))
    consistency = float(profile.get("consistency", 0))

    boost = 0.0

    if weekend_ratio >= 0.6 and template_key == "bundle_plan":
        boost += 0.2
    if night_ratio >= 0.6 and template_key == "time_shift":
        boost += 0.18
    if frequency >= 5 and template_key == "bundle_plan":
        boost += 0.12
    if spend >= 2000 and template_key == "low_cost_swap":
        boost += 0.12
    if consistency >= 0.75 and template_key == "low_cost_swap":
        boost += 0.08

    if category == "dinning out":
        if template_key == "home_substitution":
            boost += 0.22
        if template_key == "time_shift":
            boost += 0.1
    elif category == "shopping":
        if template_key == "low_cost_swap":
            boost += 0.24
        if template_key == "bundle_plan":
            boost += 0.1
    elif category == "subscriptions":
        if template_key == "bundle_plan":
            boost += 0.25
        if template_key == "low_cost_swap":
            boost += 0.1
    elif category == "travel":
        if template_key == "bundle_plan":
            boost += 0.2
        if template_key == "low_cost_swap":
            boost += 0.12

    return boost


def _light_touch_strategy(profile: dict) -> str:
    category = str(profile.get("category", "")).strip().lower()
    weekend_ratio = float(profile.get("weekend_ratio", 0))
    frequency = float(profile.get("frequency", 0))
    spend = float(profile.get("spend", 0))

    if category == "subscriptions":
        return "Review active subscriptions monthly and remove low-value renewals."
    if category == "travel":
        return "Set a travel spending envelope per trip and confirm bookings against that limit."
    if weekend_ratio >= 0.6:
        return "Set a weekend budget cap for this category and track adherence weekly."
    if spend >= 2000:
        return "Set a per-transaction budget limit and review exceptions at month-end."
    if frequency >= 3:
        return "Use pre-planned purchase slots for this category and avoid unscheduled repeats."
    return "No strong behavioral pattern is currently detected; continue periodic category monitoring."


def recommend_alternative_behaviors(habit_detection: dict, profile: dict, top_k: int = 3):
    ranked = recommend_ranked_behaviors(
        habit_detection=habit_detection,
        profile=profile,
        upstream_outputs={},
        top_k=top_k,
    )
    return [item["recommendation"] for item in ranked]


def recommend_ranked_behaviors(
    habit_detection: dict,
    profile: dict,
    upstream_outputs: dict | None = None,
    top_k: int = 5,
):
    upstream_outputs = upstream_outputs or {}
    if profile.get("expense_nature") == "Fixed":
        fixed_recommendation = "Keep payment dates consistent and track any recurring cost revisions."
        return [
            {
                "rank": 1,
                "recommendation": fixed_recommendation,
                "score": 0.9,
                "score_pct": 90.0,
                "score_tier": "Critical",
                "score_breakdown": {
                    "base_score": 0.9,
                    "habit_severity": 0.2,
                    "goal_pressure": 0.2,
                    "risk_fit": 0.8,
                    "profile_fit": 0.8,
                    "urgency_signal": 0.4,
                    "upstream_signal": 0.2,
                },
                "why_ranked": "Fixed-expense category requires a stability-first recommendation.",
                "impacts_goal": "Cash Flow Stability",
                "feasibility_impact_pct": -4.0,
                "goal_success_probability_before": 84.0,
                "goal_success_probability_after": 90.0,
                "goal_timeline_reduction_months": 1.1,
                "difficulty_level": "Easy",
                "technical_why": "Dominant factor: stability control for fixed obligations.",
            }
        ]

    if not habit_detection["habit_detected"]:
        light_touch = _light_touch_strategy(profile)
        return [
            {
                "rank": 1,
                "recommendation": light_touch,
                "score": 0.74,
                "score_pct": 74.0,
                "score_tier": "High",
                "score_breakdown": {
                    "base_score": 0.74,
                    "habit_severity": 0.25,
                    "goal_pressure": 0.2,
                    "risk_fit": 0.75,
                    "profile_fit": 0.75,
                    "urgency_signal": 0.3,
                    "upstream_signal": 0.25,
                },
                "why_ranked": "Habit signal is weak, so a low-friction recommendation is prioritized.",
                "impacts_goal": "Savings Consistency",
                "feasibility_impact_pct": -6.0,
                "goal_success_probability_before": 66.0,
                "goal_success_probability_after": 74.0,
                "goal_timeline_reduction_months": 1.6,
                "difficulty_level": "Easy",
                "technical_why": "Dominant factor: low-friction intervention fit under weak habit signal.",
            }
        ]

    habit_desc = habit_detection["habit_category"]
    ranked_templates = rank_templates(habit_desc, top_k=top_k + 2)

    intensity_factor = INTENSITY_MULTIPLIER.get(profile.get("habit_intensity", "Medium"), 1.0)

    scored_recommendations = []
    for template_key, nlp_score in ranked_templates:
        for suggestion in TEMPLATE_LIBRARY[template_key]:
            effort = 0.35 if template_key in {"time_shift", "home_substitution"} else 0.5
            cost_impact = min(1.0, (0.45 + nlp_score) * intensity_factor)
            ml_score = _ml_or_heuristic_score(profile, effort, cost_impact)
            final_score = 0.6 * ml_score + 0.4 * float(nlp_score) + _template_boost(template_key, profile)

            scored_recommendations.append(
                {
                    "recommendation": suggestion,
                    "base_score": min(max(final_score, 0.0), 1.0),
                    "template_key": template_key,
                    "nlp_score": round(float(nlp_score), 4),
                    "ml_score": round(float(ml_score), 4),
                }
            )

    ranking_input = build_ranking_input(
        habit_detection=habit_detection,
        profile=profile,
        upstream_outputs=upstream_outputs,
    )
    ranked = _RANKING_MODEL.rank(
        candidates=scored_recommendations,
        ranking_input=ranking_input,
        top_k=top_k,
    )
    return ranked
