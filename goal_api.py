from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

from data_preprocessor import preprocess_goal_data
from ml_confidence_model import ConfidenceMLModel
from feasibility_engine import GoalFeasibilityEngine

app = FastAPI(
    title="Goal Feasibility Assessment API",
    version="1.0.0"
)

ml_model = ConfidenceMLModel()
engine = GoalFeasibilityEngine(ml_model)

class GoalRequest(BaseModel):
    income: float
    savings_ratio: float
    investment_style: float
    monthly_capacity: float
    goal_amount: float
    timeline_months: int

@app.post("/goal/assess")
def assess_goal(req: GoalRequest):
    return engine.evaluate(req.dict())

@app.get("/goal/batch")
def run_on_dataset():
    df = preprocess_goal_data("data/goal_data.csv")
    results = []

    for _, row in df.iterrows():
        results.append(engine.evaluate(row.to_dict()))

    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004, reload=True)
