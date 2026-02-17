from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
from Expense_Behavior_Analysis import Expensebehavoiur

app = FastAPI(title="Expense Behaviour Analysis API")

analyser = Expensebehavoiur()

class Expense(BaseModel):
    timestamp: str
    category: str
    amount: float

class ExpenseRequest(BaseModel):
    expenses: list[Expense]

@app.post("/analyse-expenses")
def analyse_expense(request: ExpenseRequest):
    try:
        df = pd.DataFrame([e.dict() for e in request.expenses])
        result = analyser.analyse(df)

        return {
            "behavior_summary": result["behvour summary"],
            "category_stability": result["category stabliity"].to_dict(orient="records"),
            "overspending": result["overspending"].to_dict(orient="records"),
            "anomaly": result["anomaly"].to_dict(orient="records"),
            "expense_clusters": result["expense_clusters"].to_dict(orient="records")
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
