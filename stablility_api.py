from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import pandas as pd
from Expense_Behavior_Analysis import Expensebehavoiur

app = FastAPI(title="Financial & Expense Analysis API")

analyser = Expensebehavoiur()

class Expense(BaseModel):
    timestamp: str
    category: str
    amount: float

class ExpenseRequest(BaseModel):
    user_id: str
    expenses: List[Expense]

def map_financial_profile(summary: dict) -> dict:
    stability = summary['stablity_score']
    overspend = summary['oversepnding']
    volatility = summary['volatility_level']

    if stability < 40 or overspend:
        profile = "Unstable"
    elif stability < 60:
        profile = "Moderate"
    elif stability >= 60 and volatility == "low":
        profile = "Stable / Growth-Ready"
    else:
        profile = "Conservative"

    confidence = min(max(stability / 100, 0.5), 0.99)  

    return {
        "profile_label": profile,
        "confidence": round(confidence, 2),
        "stability_score": round(stability, 2)
    }

@app.post("/analyze-financial-profile")
def analyze_financial_profile(request: ExpenseRequest):
    try:
        df = pd.DataFrame([e.dict() for e in request.expenses])

        result = analyser.analyse(df)
        expense_summary = result["behvour summary"]

        profile = map_financial_profile(expense_summary)

        return {
            "user_id": request.user_id,
            "financial_profile": profile,
            "expense_summary": expense_summary,
            "category_stability": result["category stabliity"].to_dict(orient="records"),
            "overspending": result["overspending"].to_dict(orient="records"),
            "anomaly": result["anomaly"].to_dict(orient="records"),
            "expense_clusters": result["expense_clusters"].to_dict(orient="records")
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
