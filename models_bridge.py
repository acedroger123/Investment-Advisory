import joblib # or pickle
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI()

# Load the models your friend made
# Ensure these .joblib files are in a folder named 'models'
model_stability = joblib.load("models/stability_model.joblib")
model_recommend = joblib.load("models/recommendation_model.joblib")
model_expenses = joblib.load("models/expense_predictor.joblib")

class UserData(BaseModel):
    income: float
    total_expenses: float
    savings: float
    age: int
    risk_score: float

@app.post("/predict/stability")
async def predict_stability(data: UserData):
    # Convert incoming JSON to the array format your model expects
    input_features = np.array([[data.income, data.total_expenses, data.savings]])
    prediction = model_stability.predict(input_features)
    return {"stability_score": float(prediction[0])}

@app.post("/predict/recommendations")
async def get_ai_recommendations(data: UserData):
    # This matches your recommendation.js requirements
    # Your model processes the data and returns the specific advice
    features = np.array([[data.income, data.savings, data.risk_score]])
    result = model_recommend.predict(features)
    return {"advice_code": result[0]}
