import pandas as pd
from sqlalchemy import create_engine

DATABASE_URL = "postgresql://postgres:root@localhost:5432/investment_project"

engine = create_engine(DATABASE_URL)

query = """
SELECT
    age_group,
    income_range,
    savings_percent,
    investment_experience,
    instruments_used_count,
    financial_comfort,
    loss_reaction,
    return_priority,
    volatility_comfort
FROM survey_responses
"""

df = pd.read_sql(query, engine)

print(df)
