import pandas as pd
import numpy as np
import os

np.random.seed(42)

rows = []

# Number of synthetic samples
N = 800

for _ in range(N):

    # --- Simulate user behavior profile ---
    habit_confidence = np.random.uniform(0.4, 0.95)
    frequency = np.random.randint(1, 8)
    spend = np.random.uniform(100, 800)

    # --- Simulate strategy properties ---
    effort = np.random.uniform(0.1, 0.9)
    cost_impact = np.random.uniform(0.2, 0.9)

    # --- Compute synthetic "suitability logic" ---
    freq_score = min(frequency / 7, 1)
    spend_score = min(spend / 800, 1)

    risk = 0.5 * habit_confidence + 0.3 * freq_score + 0.2 * spend_score

    suitability_score = (
        0.5 * risk +
        0.3 * cost_impact -
        0.4 * effort
    )

    label = 1 if suitability_score > 0.4 else 0

    rows.append([
        habit_confidence,
        frequency,
        spend,
        effort,
        cost_impact,
        label
    ])


df = pd.DataFrame(rows, columns=[
    "habit_confidence",
    "frequency",
    "spend",
    "effort",
    "cost_impact",
    "label"
])

os.makedirs("data", exist_ok=True)
df.to_csv("strategy_training_data.csv", index=False)

print("✅ Synthetic strategy training data generated!")
print(df.head())