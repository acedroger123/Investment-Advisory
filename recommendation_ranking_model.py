from __future__ import annotations

from dataclasses import dataclass
from typing import Any


SEVERITY_MAP = {"Low": 0.3, "Medium": 0.6, "High": 0.9}
TEMPLATE_DIFFICULTY = {
    "time_shift": "Easy",
    "home_substitution": "Easy",
    "bundle_plan": "Moderate",
    "low_cost_swap": "Moderate",
    "cooldown_rule": "Behavioral Shift Required",
}


@dataclass
class RankingInput:
    habit_severity: float
    goal_feasibility: float
    risk_awareness: float
    user_profile: dict[str, Any]
    upstream_outputs: dict[str, Any]


class RecommendationRankingPersonalizationModel:
    """
    Context-aware scoring and ranking model for recommendation prioritization.
    """

    def rank(
        self,
        candidates: list[str] | list[dict[str, Any]],
        ranking_input: RankingInput,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        normalized = [self._normalize_candidate(c) for c in candidates]
        weights = self._context_weights(ranking_input)
        top_goal = self._top_goal(ranking_input.upstream_outputs)
        goal_feasibility = min(max(ranking_input.goal_feasibility, 0.0), 1.0)
        base_success_probability = max(20.0, min(95.0, round(goal_feasibility * 100.0, 1)))

        scored: list[dict[str, Any]] = []
        for candidate in normalized:
            profile_fit = self._profile_fit(candidate, ranking_input.user_profile)
            urgency = self._urgency_signal(candidate, ranking_input)
            risk_fit = self._risk_fit(candidate, ranking_input)
            upstream_signal = self._upstream_signal(ranking_input.upstream_outputs)
            base = candidate["base_score"]
            behavior_signals = self._behavior_signals(ranking_input)
            goal_pressure = 1.0 - ranking_input.goal_feasibility

            final_score = (
                weights["base"] * base
                + weights["severity"] * ranking_input.habit_severity
                + weights["goal"] * goal_pressure
                + weights["risk"] * risk_fit
                + weights["profile"] * profile_fit
                + weights["urgency"] * urgency
                + weights["upstream"] * upstream_signal
            )
            final_score = min(max(final_score, 0.0), 1.0)
            dominance = {
                "severity": weights["severity"] * ranking_input.habit_severity,
                "goal_pressure": weights["goal"] * goal_pressure,
                "frequency": weights["urgency"] * behavior_signals["frequency_pressure"],
                "night_spikes": weights["risk"] * behavior_signals["night_pressure"],
                "consistency_risk": weights["profile"] * (1.0 - behavior_signals["consistency"]),
            }
            dominant_factor = max(dominance, key=dominance.get)

            success_delta = self._success_delta(final_score, candidate)
            success_probability_after = min(98.0, round(base_success_probability + success_delta, 1))
            feasibility_impact_pct = round(-1.0 * min(20.0, 6.0 + 18.0 * final_score * goal_pressure), 1)
            goal_timeline_reduction = round(max(0.6, (success_probability_after - base_success_probability) / 5.0), 1)

            scored.append(
                {
                    "recommendation": candidate["recommendation"],
                    "raw_score": round(final_score, 4),
                    "score_breakdown": {
                        "base_score": round(base, 4),
                        "habit_severity": round(ranking_input.habit_severity, 4),
                        "goal_pressure": round(goal_pressure, 4),
                        "risk_fit": round(risk_fit, 4),
                        "profile_fit": round(profile_fit, 4),
                        "urgency_signal": round(urgency, 4),
                        "upstream_signal": round(upstream_signal, 4),
                    },
                    "dominant_factor": dominant_factor,
                    "why_ranked": self._rationale(
                        dominant_factor=dominant_factor,
                        candidate=candidate,
                        ranking_input=ranking_input,
                        top_goal=top_goal,
                        timeline_reduction=goal_timeline_reduction,
                        behavior_signals=behavior_signals,
                    ),
                    "impacts_goal": top_goal.get("goal_name", "Core Goal"),
                    "feasibility_impact_pct": feasibility_impact_pct,
                    "goal_success_probability_before": base_success_probability,
                    "goal_success_probability_after": success_probability_after,
                    "goal_timeline_reduction_months": goal_timeline_reduction,
                    "difficulty_level": TEMPLATE_DIFFICULTY.get(candidate["template_key"], "Moderate"),
                    "technical_why": self._technical_why(ranking_input, candidate, dominant_factor),
                    "template_key": candidate["template_key"],
                }
            )

        scored = self._calibrate_scores(scored)
        scored.sort(key=lambda x: x["score"], reverse=True)
        ranked = scored[: max(top_k, 1)]
        for idx, row in enumerate(ranked, start=1):
            row["rank"] = idx
        return ranked

    def _normalize_candidate(self, candidate: str | dict[str, Any]) -> dict[str, Any]:
        if isinstance(candidate, str):
            return {"recommendation": candidate, "base_score": 0.5, "template_key": "cooldown_rule"}
        return {
            "recommendation": str(candidate.get("recommendation", "")).strip(),
            "base_score": min(max(float(candidate.get("base_score", 0.5)), 0.0), 1.0),
            "template_key": str(candidate.get("template_key", "cooldown_rule")).strip(),
        }

    def _context_weights(self, ranking_input: RankingInput) -> dict[str, float]:
        weights = {
            "base": 0.18,
            "severity": 0.18,
            "goal": 0.16,
            "risk": 0.12,
            "profile": 0.14,
            "urgency": 0.12,
            "upstream": 0.10,
        }
        if ranking_input.goal_feasibility < 0.45:
            weights["goal"] += 0.06
            weights["urgency"] += 0.03
            weights["base"] -= 0.04
        if ranking_input.habit_severity > 0.75:
            weights["severity"] += 0.05
            weights["profile"] -= 0.02
        if ranking_input.risk_awareness < 0.4:
            weights["risk"] += 0.05
            weights["upstream"] -= 0.02
        return weights

    def _profile_fit(self, candidate: dict[str, Any], user_profile: dict[str, Any]) -> float:
        behavior_style = str(user_profile.get("behavior_style", "balanced")).lower()
        text = candidate["recommendation"].lower()
        template_key = candidate.get("template_key", "")

        strong_action = any(w in text for w in ("freeze", "immediate", "cap", "reallocate"))
        light_action = any(w in text for w in ("review", "monitor", "track", "planned"))

        if behavior_style in {"disciplined", "aggressive"}:
            return 0.9 if strong_action else 0.6
        if behavior_style in {"conservative", "light_touch"}:
            return 0.9 if light_action else 0.55
        if template_key in {"bundle_plan", "low_cost_swap"}:
            return 0.8
        return 0.75 if (strong_action or light_action) else 0.65

    def _urgency_signal(self, candidate: dict[str, Any], ranking_input: RankingInput) -> float:
        text = candidate["recommendation"].lower()
        template_key = candidate.get("template_key", "")
        urgent_action = any(w in text for w in ("immediate", "freeze", "at least", "redirect"))
        planned_action = any(w in text for w in ("weekly", "monthly", "planned", "schedule"))
        goal_pressure = 1.0 - ranking_input.goal_feasibility

        signal = 0.45 * goal_pressure + 0.25 * ranking_input.habit_severity
        if urgent_action:
            signal += 0.2
        if planned_action:
            signal += 0.1
        if template_key == "cooldown_rule":
            signal += 0.08
        return min(max(signal, 0.0), 1.0)

    def _risk_fit(self, candidate: dict[str, Any], ranking_input: RankingInput) -> float:
        text = candidate["recommendation"].lower()
        template_key = candidate.get("template_key", "")
        safe_action = any(w in text for w in ("planned", "review", "cap", "budget", "track"))
        high_control = any(w in text for w in ("freeze", "redirect", "reallocate"))

        fit = 0.35 * ranking_input.risk_awareness
        if safe_action:
            fit += 0.35
        if high_control and ranking_input.habit_severity > 0.75:
            fit += 0.2
        if template_key == "time_shift" and float(ranking_input.user_profile.get("night_ratio", 0.0)) >= 0.45:
            fit += 0.12
        return min(max(fit, 0.0), 1.0)

    def _upstream_signal(self, upstream_outputs: dict[str, Any]) -> float:
        conflict = float(self._dig(upstream_outputs, ["goal_conflict", "overall_conflict_score"], 0.0))
        habit_conf = float(self._dig(upstream_outputs, ["habit_detection", "confidence"], 0.0))
        transaction_alerts = self._dig(upstream_outputs, ["transaction_analysis", "alerts"], [])
        if not isinstance(transaction_alerts, list):
            transaction_alerts = []

        transaction_pressure = min(len(transaction_alerts) / 3.0, 1.0)
        signal = 0.45 * conflict + 0.35 * habit_conf + 0.20 * transaction_pressure
        return min(max(signal, 0.0), 1.0)

    def _rationale(
        self,
        dominant_factor: str,
        candidate: dict[str, Any],
        ranking_input: RankingInput,
        top_goal: dict[str, Any],
        timeline_reduction: float,
        behavior_signals: dict[str, float],
    ) -> str:
        goal_name = top_goal.get("goal_name", "primary goal")
        template_key = candidate.get("template_key")
        if template_key == "bundle_plan":
            return (
                "Frequency clustering behavior is increasing budget leakage risk "
                f"(current weekly frequency index: {behavior_signals['frequency_pressure']:.2f})."
            )
        if template_key == "time_shift":
            return "Night spending spikes are reducing your consistency score and increasing impulse exposure."
        if template_key == "low_cost_swap":
            return "High-ticket purchase concentration is impacting affordability; this action reduces unit cost pressure."
        if dominant_factor == "goal_pressure":
            return (
                f"High discretionary volatility is directly delaying your {goal_name} "
                f"timeline by about {timeline_reduction:.1f} months."
            )
        if dominant_factor == "frequency":
            return (
                "Frequency clustering behavior is increasing budget leakage risk "
                f"(current weekly frequency index: {behavior_signals['frequency_pressure']:.2f})."
            )
        if dominant_factor == "night_spikes":
            return (
                "Night spending spikes are reducing your consistency score and increasing impulse exposure."
            )
        if ranking_input.habit_severity >= 0.75:
            return "Persistent habit severity is amplifying financial friction; this recommendation directly targets that risk."
        return "Ranked for balanced impact on feasibility, risk control, and behavioral adherence."

    def _behavior_signals(self, ranking_input: RankingInput) -> dict[str, float]:
        frequency = min(max(float(ranking_input.user_profile.get("frequency", 0.0)) / 7.0, 0.0), 1.0)
        night_ratio = min(max(float(ranking_input.user_profile.get("night_ratio", 0.0)), 0.0), 1.0)
        consistency = min(max(float(ranking_input.user_profile.get("consistency", 0.5)), 0.0), 1.0)
        return {
            "frequency_pressure": frequency,
            "night_pressure": night_ratio,
            "consistency": consistency,
        }

    def _top_goal(self, upstream_outputs: dict[str, Any]) -> dict[str, Any]:
        conflicts = self._dig(upstream_outputs, ["goal_conflict", "goal_conflicts"], [])
        if not isinstance(conflicts, list) or not conflicts:
            return {"goal_name": "Emergency Fund"}
        return max(conflicts, key=lambda x: float(x.get("conflict_score", 0.0)))

    def _success_delta(self, score: float, candidate: dict[str, Any]) -> float:
        difficulty = TEMPLATE_DIFFICULTY.get(candidate.get("template_key", ""), "Moderate")
        multiplier = 1.0
        if difficulty == "Easy":
            multiplier = 1.15
        elif difficulty == "Behavioral Shift Required":
            multiplier = 0.85
        return round(min(22.0, max(6.0, (score * 18.0) * multiplier)), 1)

    def _score_tier(self, score_pct: float) -> str:
        if score_pct >= 85:
            return "Critical"
        if score_pct >= 70:
            return "High"
        if score_pct >= 55:
            return "Moderate"
        return "Low"

    def _calibrate_scores(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        raw = [float(x.get("raw_score", 0.0)) for x in rows]
        low = min(raw) if raw else 0.0
        high = max(raw) if raw else 1.0
        spread = max(high - low, 1e-6)

        calibrated = []
        for row in rows:
            normalized = (float(row["raw_score"]) - low) / spread
            widened = 0.55 + 0.43 * (normalized ** 0.82)
            score = round(min(max(widened, 0.0), 0.99), 4)
            score_pct = round(score * 100.0, 1)
            row["score"] = score
            row["score_pct"] = score_pct
            row["score_tier"] = self._score_tier(score_pct)
            calibrated.append(row)
        return calibrated

    def _technical_why(self, ranking_input: RankingInput, candidate: dict[str, Any], dominant_factor: str) -> str:
        goal_pressure = 1.0 - ranking_input.goal_feasibility
        return (
            f"Dominant factor: {dominant_factor}. "
            f"Template={candidate.get('template_key','na')}, "
            f"habit_severity={ranking_input.habit_severity:.2f}, "
            f"goal_pressure={goal_pressure:.2f}, "
            f"risk_awareness={ranking_input.risk_awareness:.2f}."
        )

    def _dig(self, data: dict[str, Any], keys: list[str], default: Any) -> Any:
        cur: Any = data
        for key in keys:
            if not isinstance(cur, dict):
                return default
            cur = cur.get(key)
        return default if cur is None else cur


def build_ranking_input(
    habit_detection: dict[str, Any],
    profile: dict[str, Any],
    upstream_outputs: dict[str, Any] | None = None,
) -> RankingInput:
    upstream_outputs = upstream_outputs or {}
    intensity = str(habit_detection.get("habit_intensity", "Low"))
    intensity_score = SEVERITY_MAP.get(intensity, 0.3)
    confidence = min(max(float(habit_detection.get("confidence", 0.0)), 0.0), 1.0)
    habit_severity = min(max(0.65 * intensity_score + 0.35 * confidence, 0.0), 1.0)

    goal_conflict = float(
        upstream_outputs.get("goal_conflict", {}).get("overall_conflict_score", 0.0)
    )
    goal_feasibility = min(max(1.0 - goal_conflict, 0.0), 1.0)

    consistency = min(max(float(profile.get("consistency", 0.5)), 0.0), 1.0)
    night_ratio = min(max(float(profile.get("night_ratio", 0.0)), 0.0), 1.0)
    risk_awareness = min(max(0.7 * consistency + 0.3 * (1.0 - night_ratio), 0.0), 1.0)

    user_profile = {
        "behavior_style": profile.get("behavior_style", "balanced"),
        "category": profile.get("category", ""),
        "habit_intensity": intensity,
        "frequency": profile.get("frequency", 0.0),
        "night_ratio": profile.get("night_ratio", 0.0),
        "weekend_ratio": profile.get("weekend_ratio", 0.0),
        "consistency": profile.get("consistency", 0.5),
    }

    return RankingInput(
        habit_severity=habit_severity,
        goal_feasibility=goal_feasibility,
        risk_awareness=risk_awareness,
        user_profile=user_profile,
        upstream_outputs=upstream_outputs,
    )
