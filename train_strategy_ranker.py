import pandas as pd
import joblib
from sklearn.linear_model import LogisticRegression
import os

df = pd.read_csv("strategy_training_data.csv")

X = df.drop("label", axis=1)
y = df["label"]

model = LogisticRegression()
model.fit(X, y)

os.makedirs("model", exist_ok=True)
joblib.dump(model, "strategy_ranker.pkl")

print("✅ Strategy ranking model trained")