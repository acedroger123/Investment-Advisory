import unittest

from recommendation_engine import recommend_ranked_behaviors
from recommendation_ranking_model import RankingInput, RecommendationRankingPersonalizationModel


class RecommendationRankingPersonalizationModelTests(unittest.TestCase):
    def setUp(self):
        self.model = RecommendationRankingPersonalizationModel()

    def test_returns_ranked_recommendations_with_explainability_fields(self):
        ranking_input = RankingInput(
            habit_severity=0.82,
            goal_feasibility=0.35,
            risk_awareness=0.55,
            user_profile={"behavior_style": "balanced"},
            upstream_outputs={
                "goal_conflict": {"overall_conflict_score": 0.71},
                "habit_detection": {"confidence": 0.84},
                "transaction_analysis": {"alerts": ["late-night spend", "budget overrun"]},
            },
        )
        candidates = [
            {"recommendation": "Set a weekly budget cap and track adherence.", "base_score": 0.72},
            {"recommendation": "Immediate action required: freeze non-essential spending for one cycle.", "base_score": 0.65},
            {"recommendation": "Review expenses monthly and monitor trend drift.", "base_score": 0.60},
        ]

        ranked = self.model.rank(candidates=candidates, ranking_input=ranking_input, top_k=3)

        self.assertEqual(len(ranked), 3)
        self.assertEqual([x["rank"] for x in ranked], [1, 2, 3])
        self.assertGreaterEqual(ranked[0]["score"], ranked[1]["score"])
        self.assertGreaterEqual(ranked[1]["score"], ranked[2]["score"])
        self.assertIn("score_breakdown", ranked[0])
        self.assertIn("why_ranked", ranked[0])
        self.assertIn("impacts_goal", ranked[0])
        self.assertIn("feasibility_impact_pct", ranked[0])
        self.assertIn("goal_success_probability_before", ranked[0])
        self.assertIn("goal_success_probability_after", ranked[0])
        self.assertIn("difficulty_level", ranked[0])
        self.assertIn("score_tier", ranked[0])

    def test_profile_personalization_prefers_light_touch_for_conservative_user(self):
        ranking_input = RankingInput(
            habit_severity=0.40,
            goal_feasibility=0.72,
            risk_awareness=0.80,
            user_profile={"behavior_style": "conservative"},
            upstream_outputs={},
        )
        candidates = [
            {"recommendation": "Immediate action required: freeze non-essential shopping.", "base_score": 0.78},
            {"recommendation": "Review spending weekly and track against a planned cap.", "base_score": 0.72},
        ]

        ranked = self.model.rank(candidates=candidates, ranking_input=ranking_input, top_k=2)

        self.assertEqual(ranked[0]["recommendation"], candidates[1]["recommendation"])

    def test_rationales_are_not_repetitive_for_top_ranked_items(self):
        ranking_input = RankingInput(
            habit_severity=0.84,
            goal_feasibility=0.32,
            risk_awareness=0.48,
            user_profile={
                "behavior_style": "balanced",
                "frequency": 6,
                "night_ratio": 0.62,
                "consistency": 0.58,
            },
            upstream_outputs={
                "goal_conflict": {
                    "overall_conflict_score": 0.74,
                    "goal_conflicts": [{"goal_name": "Emergency Fund", "conflict_score": 0.74}],
                },
                "habit_detection": {"confidence": 0.86},
                "transaction_analysis": {"alerts": ["late-night spend", "budget overrun"]},
            },
        )
        candidates = [
            {"recommendation": "Immediate action required: freeze non-essential shopping for one cycle.", "base_score": 0.73, "template_key": "cooldown_rule"},
            {"recommendation": "Batch purchases into fewer planned sessions.", "base_score": 0.69, "template_key": "bundle_plan"},
            {"recommendation": "Shift purchases to daytime windows.", "base_score": 0.65, "template_key": "time_shift"},
        ]
        ranked = self.model.rank(candidates=candidates, ranking_input=ranking_input, top_k=3)
        reasons = [x["why_ranked"] for x in ranked]
        self.assertGreater(len(set(reasons)), 1)


class RecommendationEngineIntegrationTests(unittest.TestCase):
    def test_engine_returns_ranked_list_for_behavioral_habit_case(self):
        habit_detection = {
            "habit_detected": True,
            "habit_intensity": "High",
            "confidence": 0.88,
            "habit_category": "repeat convenience purchase behavior",
        }
        profile = {
            "confidence": 0.88,
            "frequency": 6,
            "consistency": 0.8,
            "weeks_active": 10,
            "spend": 2500,
            "night_ratio": 0.5,
            "weekend_ratio": 0.6,
            "category": "shopping",
            "expense_nature": "Variable",
            "habit_intensity": "High",
            "behavior_style": "balanced",
        }
        upstream_outputs = {
            "goal_conflict": {"overall_conflict_score": 0.69},
            "habit_detection": {"confidence": 0.88},
            "transaction_analysis": {"alerts": ["large transaction", "late-night transaction"]},
        }

        ranked = recommend_ranked_behaviors(
            habit_detection=habit_detection,
            profile=profile,
            upstream_outputs=upstream_outputs,
            top_k=4,
        )

        self.assertTrue(ranked)
        self.assertLessEqual(len(ranked), 4)
        self.assertIn("recommendation", ranked[0])
        self.assertIn("score", ranked[0])
        self.assertIn("rank", ranked[0])


if __name__ == "__main__":
    unittest.main()
