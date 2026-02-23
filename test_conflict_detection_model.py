import unittest

from conflict_detection_model import ExpenseGoalConflictModel


class ExpenseGoalConflictModelTests(unittest.TestCase):
    def setUp(self):
        self.model = ExpenseGoalConflictModel()

    def test_detects_high_conflict_when_behavior_and_goal_pressure_are_high(self):
        habit_detection = {
            "habit_detected": True,
            "habit_intensity": "High",
            "confidence": 0.88,
        }
        profile = {
            "category": "shopping",
            "spend": 3200,
            "frequency": 6,
            "weekend_ratio": 0.7,
            "night_ratio": 0.5,
            "consistency": 0.8,
        }
        goals = [
            {
                "goal_name": "Build Emergency Buffer",
                "goal_type": "Emergency Fund",
                "target_amount": 12000,
                "current_amount": 1000,
                "timeline_months": 8,
                "priority": 5,
                "protected_categories": ["shopping"],
            }
        ]

        result = self.model.detect_conflicts(
            habit_detection=habit_detection,
            active_goals=goals,
            profile=profile,
            context={"monthly_savings_capacity": 900},
        )

        self.assertTrue(result["conflict_detected"])
        self.assertIn(result["overall_severity"], {"High", "Critical"})
        self.assertGreaterEqual(result["overall_conflict_score"], 0.62)
        self.assertTrue(result["alerts"])

    def test_returns_low_conflict_when_behavior_is_stable_and_goal_is_feasible(self):
        habit_detection = {
            "habit_detected": False,
            "habit_intensity": "Low",
            "confidence": 0.22,
        }
        profile = {
            "category": "transport",
            "spend": 600,
            "frequency": 2,
            "weekend_ratio": 0.2,
            "night_ratio": 0.1,
            "consistency": 0.5,
        }
        goals = [
            {
                "goal_name": "Vacation Fund",
                "goal_type": "Travel",
                "target_amount": 3000,
                "current_amount": 1800,
                "timeline_months": 10,
                "priority": 2,
                "protected_categories": [],
            }
        ]

        result = self.model.detect_conflicts(
            habit_detection=habit_detection,
            active_goals=goals,
            profile=profile,
            context={"monthly_savings_capacity": 700},
        )

        self.assertFalse(result["conflict_detected"])
        self.assertEqual(result["overall_severity"], "Low")
        self.assertLess(result["overall_conflict_score"], 0.42)


if __name__ == "__main__":
    unittest.main()
