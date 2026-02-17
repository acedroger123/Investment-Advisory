import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

df = pd.read_csv("synthetic_habits_data_one.csv")

X = df.drop("is_habit", axis=1)
y = df["is_habit"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = RandomForestClassifier(
    n_estimators=120,
    max_depth=6,
    random_state=42
)

model.fit(X_train, y_train)

preds = model.predict(X_test)
accuracy = accuracy_score(y_test, preds)

joblib.dump(model, "habit_model.pkl")

print("Habit model trained")
print("Accuracy:", round(accuracy, 2))
