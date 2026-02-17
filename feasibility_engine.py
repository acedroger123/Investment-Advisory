import math

class GoalFeasibilityEngine:
    def __init__(self, ml_model):
        self.ml_model = ml_model

    def evaluate(self, user):
        goal_amount = user["goal_amount"]
        timeline = user["timeline_months"]
        capacity = user["monthly_capacity"]

        if capacity <= 0:
            return self._fail_response()

        required_monthly = goal_amount / timeline
        capacity_ratio = capacity / required_monthly

        # Feasibility classification
        if capacity_ratio >= 1:
            feasibility = "High"
        elif capacity_ratio >= 0.8:
            feasibility = "Medium"
        else:
            feasibility = "Low"

        # ML confidence
        ml_score = self.ml_model.predict([[
            user["savings_ratio"],
            user["investment_style"],
            capacity_ratio
        ]])[0]

        buffer_months = max(1, int(ml_score / 25))

        # Timeline Adjustment Logic
        adjusted_timeline = None
        timeline_extension = 0

        if feasibility != "High":
            raw_timeline = goal_amount / capacity
            adjusted_timeline = math.ceil(raw_timeline + buffer_months)
            timeline_extension = adjusted_timeline - timeline

        return {
            "feasibility": feasibility,
            "confidence_score": round(float(ml_score), 2),
            "required_monthly_saving": round(required_monthly, 2),
            "current_capacity": capacity,
            "capacity_ratio": round(capacity_ratio, 2),
            "original_timeline_months": timeline,
            "recommended_timeline_months": adjusted_timeline,
            "timeline_extension_months": max(timeline_extension, 0),
            "buffer_months": buffer_months,
            "explanation": self._explain(feasibility, timeline_extension)
        }

    def _fail_response(self):
        return {
            "feasibility": "Low",
            "confidence_score": 0,
            "explanation": "No disposable income available for this goal."
        }

    def _explain(self, feasibility, extension):
        if feasibility == "High":
            return "Goal is achievable within the planned timeline."
        if feasibility == "Medium":
            return f"Goal becomes safer if timeline is extended by {extension} months."
        return f"Goal is unrealistic for the given timeline. Extend timeline by at least {extension} months."
