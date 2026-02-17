from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

from recommend import recommendations

app = FastAPI(
    title="Goal Based Stock Recommendation API",
    version="1.0.0"
)


class RecommendationRequest(BaseModel):
    current_amount: float = Field(..., gt=0)
    goal_amount: float = Field(..., gt=0)
    years: float = Field(..., gt=0)
    risk_tolerance: str = Field(..., pattern="^(low|medium|high)$")
    owned_stocks: Optional[List[str]] = []


class StockRecommendation(BaseModel):
    ticker: str
    annual_return: float
    volatility: float
    risks: str


class RecommendationResponse(BaseModel):
    required_return: float
    msg: str
    recommend: List[StockRecommendation]


@app.post("/recommend", response_model=RecommendationResponse)
def recommend_api(request: RecommendationRequest):
    try:
        return recommendations(
            current_amount=request.current_amount,
            goal_amount=request.goal_amount,
            years=request.years,
            risk=request.risk_tolerance,
            owned_stocks=request.owned_stocks,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}
