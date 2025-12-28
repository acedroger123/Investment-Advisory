from pydantic import BaseModel

class SurveyCreate(BaseModel):
    age_group: int
    income_range: int
    savings_percent: int
    investment_experience: int
    instruments_used_count: int
    financial_comfort: int
    loss_reaction: int
    return_priority: int
    volatility_comfort: int

class UserCreate(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

