import random
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import SurveyResponse
from database import DATABASE_URL

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def generate_risk(row):
    if row["income_range"] >= 3 and row["volatility_comfort"] >= 3:
        return 2
    if row["income_range"] <= 1 and row["volatility_comfort"] <= 1:
        return 0
    return 1

records = []

for _ in range(50):
    row = {
        "age_group": random.randint(0, 3),
        "income_range": random.randint(0, 3),
        "savings_percent": random.randint(0, 3),
        "investment_experience": random.randint(0, 3),
        "instruments_used_count": random.randint(0, 4),
        "financial_comfort": random.randint(0, 3),
        "loss_reaction": random.randint(0, 3),
        "return_priority": random.randint(0, 3),
        "volatility_comfort": random.randint(0, 3),
    }

    risk = generate_risk(row)

    survey = SurveyResponse(
        user_id=1,
        risk_label=risk,
        **row
    )

    records.append(survey)

db.add_all(records)
db.commit()
db.close()

print("Inserted 50 fake survey records")
