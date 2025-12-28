from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    response_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"))

    age_group = Column(Integer)
    income_range = Column(Integer)
    savings_percent = Column(Integer)
    investment_experience = Column(Integer)
    instruments_used_count = Column(Integer)
    financial_comfort = Column(Integer)
    loss_reaction = Column(Integer)
    return_priority = Column(Integer)
    volatility_comfort = Column(Integer)

    risk_label = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
