import pandas as pd
import joblib

kmeans = joblib.load("model/kmeans_model.joblib")
scaler = joblib.load("model/scaler.joblib")
stock_features = pd.read_pickle("model/stock_features.pkl")

def user_return(current_amount: float, goal_amount: float, years: float) -> float:
    if goal_amount <= current_amount:
        raise ValueError("Goal amount must be greater than current amount")
    if years <= 0:
        raise ValueError("Invalid time horizon")
    return (goal_amount / current_amount) ** (1 / years) - 1


def recommendations(
    current_amount: float,
    goal_amount: float,
    years: float,
    risk: str,
    owned_stocks: list[str] | None = None,
    top: int = 10,
) -> dict:

    owned_stocks = owned_stocks or []
    risk = risk.lower()

    required_return = user_return(current_amount, goal_amount, years)

    filtered = stock_features[stock_features["risks"] == risk]

    if owned_stocks:
        filtered = filtered[~filtered.index.isin(owned_stocks)]

    candidates = filtered[filtered["annual_return"] >= required_return]

    if candidates.empty:
        return {
            "required_return": round(required_return, 4),
            "msg": "No stocks match your goal with the selected risk level",
            "recommend": [],
        }

    top_stocks = candidates.sort_values("annual_return", ascending=False).head(top)

    recommendations_list = []
    for ticker, row in top_stocks.iterrows():
        recommendations_list.append({
            "ticker": ticker,
            "annual_return": round(row["annual_return"], 4),
            "volatility": round(row["volatility"], 4),
            "risks": row["risks"],
        })

    return {
        "required_return": round(required_return, 4),
        "msg": f"Top {len(recommendations_list)} stocks based on historical data",
        "recommend": recommendations_list,
    }
