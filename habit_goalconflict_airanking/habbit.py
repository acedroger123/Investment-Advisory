import joblib
import pandas as pd

from category_config import CATEGORY_TO_NATURE


class RuleEnhancedHabitDetector:
    def __init__(self, model_path: str = "habit_model.pkl"):
        self.model = joblib.load(model_path)

    def _rule_score(self, behavior_features: dict) -> float:
        score = 0.0

        if behavior_features["avg_weekly_frequency"] >= 4:
            score += 0.25
        if behavior_features["consistency"] >= 0.6:
            score += 0.2
        if behavior_features["weeks_active"] >= 8:
            score += 0.2
        if behavior_features["weekend_ratio"] >= 0.55:
            score += 0.15
        if behavior_features["night_ratio"] >= 0.45:
            score += 0.2

        return min(max(score, 0.0), 1.0)

    def _ml_score(self, behavior_features: dict) -> float:
        df = pd.DataFrame([behavior_features])
        return float(self.model.predict_proba(df)[0][1])

    def _habit_intensity(self, combined_score: float) -> str:
        if combined_score >= 0.75:
            return "High"
        if combined_score >= 0.5:
            return "Medium"
        return "Low"

    def _habit_category(self, category: str, behavior_features: dict) -> str:
        category_key = category.strip().lower()
        nature = CATEGORY_TO_NATURE.get(category_key, "")

        if nature == "Fixed":
            return f"Recurring fixed-payment pattern ({category})"
        if behavior_features["night_ratio"] >= 0.5 and category_key in {
            "food and groceries",
            "dinning out",
        }:
            return "Late-night food spending"
        if behavior_features["weekend_ratio"] >= 0.55:
            return f"Weekend-heavy {category} spending"
        if behavior_features["avg_weekly_frequency"] >= 5:
            return f"High-frequency {category} spending"
        return f"Recurring {category} spending"

    def predict(self, behavior_features: dict, category: str) -> dict:
        category_key = category.strip().lower()
        nature = CATEGORY_TO_NATURE.get(category_key, "")

        if nature == "Fixed":
            # Fixed expenses skip behavioral scoring and always return low intervention.
            habit_detected = False
            habit_intensity = "Low"
            confidence = 0.0
            scores = {
                "ml_score": 0.0,
                "rule_score": 0.0,
            }
        else:
            ml_score = self._ml_score(behavior_features)
            rule_score = self._rule_score(behavior_features)
            combined_score = 0.7 * ml_score + 0.3 * rule_score
            habit_detected = combined_score >= 0.5
            habit_intensity = self._habit_intensity(combined_score)
            confidence = combined_score
            scores = {
                "ml_score": round(ml_score, 3),
                "rule_score": round(rule_score, 3),
            }

        return {
            "habit_detected": habit_detected,
            "habit_category": self._habit_category(category, behavior_features),
            "habit_intensity": habit_intensity,
            "confidence": round(confidence, 3),
            "scores": scores,
        }


class HabitPredictor:
    """
    Backward-compatible wrapper for legacy endpoints.
    """

    def __init__(self, model_path: str = "habit_model.pkl"):
        self.detector = RuleEnhancedHabitDetector(model_path=model_path)

    def predict(self, behavior_features: dict) -> dict:
        result = self.detector.predict(behavior_features, category="General")
        return {
            "habit_detected": result["habit_detected"],
            "confidence": result["confidence"],
        }
