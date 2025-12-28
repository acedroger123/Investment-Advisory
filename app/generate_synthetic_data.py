import pandas as pd
import numpy as np

np.random.seed(42)

rows = 50

data = {
    "age_group": np.random.randint(0, 4, rows),
    "income_range": np.random.randint(0, 4, rows),
    "savings_percent": np.random.randint(0, 4, rows),
    "investment_experience": np.random.randint(0, 4, rows),
    "instruments_used_count": np.random.randint(0, 5, rows),
    "financial_comfort": np.random.randint(0, 4, rows),
    "loss_reaction": np.random.randint(0, 4, rows),
    "return_priority": np.random.randint(0, 4, rows),
    "volatility_comfort": np.random.randint(0, 4, rows),
}

df = pd.DataFrame(data)

def label(row):
    if row["income_range"] >= 3 and row["volatility_comfort"] >= 3:
        return 2
    if row["income_range"] <= 1 and row["volatility_comfort"] <= 1:
        return 0
    return 1

df["risk_label"] = df.apply(label, axis=1)

df.to_csv("synthetic_risk_data.csv", index=False)
print("Synthetic data generated:", len(df))
