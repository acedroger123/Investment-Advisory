import numpy as np
import pandas as pd

np.random.seed(42)

N = 500

data = {
    "avg_weekly_frequency": np.random.randint(1, 10, N),
    "consistency": np.round(np.random.uniform(0.2, 1.0, N), 2),
    "average_spend": np.random.randint(200, 5000, N),
    "weeks_active": np.random.randint(2, 52, N),
    "weekend_ratio": np.round(np.random.uniform(0, 1, N), 2),
    "night_ratio": np.round(np.random.uniform(0, 1, N), 2)
}

df = pd.DataFrame(data)

df["is_habit"] = (
    (df["avg_weekly_frequency"] >= 4) &
    (df["consistency"] >= 0.6) &
    (df["weeks_active"] >= 8)
).astype(int)

df.to_csv("data/synthetic_habits.csv", index=False)
print("✅ Synthetic habit dataset created (500 records)")
