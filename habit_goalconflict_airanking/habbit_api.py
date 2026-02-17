# main.py
from fastapi import FastAPI
from pydantic import BaseModel
from habbit import HabitPredictor  

app = FastAPI(title="Habit Detection API", version="1.0")

predictor = HabitPredictor()

class HabitInput(BaseModel):
    avg_weekly_frequency: int
    consistency: float
    average_spend: float
    weeks_active: int
    weekend_ratio: float
    night_ratio: float

@app.post("/habits/detect")
def detect_habit(data: HabitInput):
  
    result = predictor.predict(data.dict())  
    return result

@app.get("/")
def root():
    return {"msg": "Habit API is running"}
