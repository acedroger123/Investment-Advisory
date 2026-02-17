import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

PROFILE_LABELS = {
    0: "Unstable",
    1: "Conservative",
    2: "Moderate",
    3: "Stable / Growth-Ready"
}

FEATURE_COLUMNS = [
    "expense_volatility",
    "savings_ratio",
    "fixed_to_discretionary_ratio"
]

def train_financial_stability_model(data: pd.DataFrame, save_path="financial_stability_model.pkl"):


    X = data[FEATURE_COLUMNS]
    y = data["profile_label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=6,
        random_state=42,
        class_weight="balanced"
    )

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)

    print("Financial Stability Model Evaluation")
    print(classification_report(y_test, y_pred, target_names=PROFILE_LABELS.values()))

    joblib.dump(model, save_path)
    print(f" Model saved at {save_path}")

    return model

def predict_financial_profile(
    expense_volatility: float,
    savings_ratio: float,
    fixed_to_discretionary_ratio: float,
    model_path="financial_stability_model.pkl"
):


    model = joblib.load(model_path)

    X = np.array([[
        expense_volatility,
        savings_ratio,
        fixed_to_discretionary_ratio
    ]])

    prediction = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0]

    return {
        "profile_label": PROFILE_LABELS[prediction],
        "confidence": round(float(np.max(probabilities)), 2),
        "distribution": {
            PROFILE_LABELS[i]: round(float(prob), 2)
            for i, prob in enumerate(probabilities)
        }
    }
