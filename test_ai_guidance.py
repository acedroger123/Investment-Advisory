import unittest

from habit_recomendation_api import (
    _build_primary_focus,
    _monthly_direction,
    _personalized_roadmap,
)


class AIGuidanceTests(unittest.TestCase):
    def test_primary_focus_uses_global_priority_score_formula(self):
        goal_conflict = {
            "goal_conflicts": [
                {
                    "goal_name": "Emergency Fund",
                    "goal_type": "Emergency Fund",
                    "priority": 5,
                    "conflict_score": 0.8,
                    "monthly_required": 20000,
                },
                {
                    "goal_name": "Vacation",
                    "goal_type": "Travel",
                    "priority": 3,
                    "conflict_score": 0.9,
                    "monthly_required": 6000,
                },
            ]
        }
        active_goals = [
            {"goal_name": "Emergency Fund", "priority": 5},
            {"goal_name": "Vacation", "priority": 3},
        ]

        result = _build_primary_focus(
            goal_conflict=goal_conflict,
            active_goals=active_goals,
            monthly_capacity=7000,
        )

        self.assertEqual(result["top_goal"]["goal_name"], "Emergency Fund")
        self.assertIn("GoalPriority x ConflictSeverity x FeasibilityDrop", result["global_priority_formula"])

    def test_monthly_direction_and_roadmap_are_generated(self):
        goal_conflict = {"overall_conflict_score": 0.7}
        habit_result = {"habit_intensity": "High"}
        profile = {"category": "shopping"}
        alerts = ["late-night spend", "budget overrun"]

        direction = _monthly_direction(goal_conflict, habit_result, profile, alerts)
        self.assertIn("This month's key focus", direction)

        primary_focus = {"top_goal": {"goal_name": "Emergency Fund"}}
        roadmap = _personalized_roadmap(primary_focus, profile, goal_conflict)
        self.assertEqual(len(roadmap), 3)
        self.assertTrue(roadmap[0].startswith("Step 1:"))


if __name__ == "__main__":
    unittest.main()
