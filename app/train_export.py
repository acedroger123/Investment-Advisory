import pandas as pd
from sqlalchemy import create_engine

engine = create_engine(
    "postgresql://postgres:root@localhost:5432/SignUp_SignIn_DB"
)
enginenew = create_engine(
    "postgresql://postgres:root@localhost:5432/investment_project"
)

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
volatility_comfort,
risk_label
FROM survey_responses
WHERE risk_label IS NOT NULL;
"""

df = pd.read_sql(query, engine)
df.to_csv("risk_training_data.csv", index=False)

print("Exported", len(df), "rows")
