import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

class HabitMLModel:
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = RandomForestClassifier(
            n_estimators=150,
            max_depth=6,
            random_state=42
        )
        self._train_model()

    def _train_model(self):

        X = np.array([
            [2.5, 0.8, 300, 6],   
            [2.0, 0.7, 280, 5],   
            [1.7, 0.6, 260, 4],   
            [1.3, 0.45, 220, 3],  
            [1.0, 0.35, 200, 2],  
            [0.7, 0.2, 150, 1],   
            [0.3, 0.1, 100, 0],   
            [0.1, 0.0, 80, 0],    
        ])

        y = [
            "habit",
            "habit",
            "habit",
            "emerging_habit",
            "emerging_habit",
            "no_habit",
            "no_habit",
            "no_habit"
        ]

        X_scaled = self.scaler.fit_transform(X)
        self.model.fit(X_scaled, y)

    def predict(self, df: pd.DataFrame):
        features = df[
            ["avg_weekly_frequency", "consistency",
             "average_spend", "weeks_active"]
        ]

        scaled = self.scaler.transform(features)
        labels = self.model.predict(scaled)
        probabilities = self.model.predict_proba(scaled)

        results = []
        for i, row in df.iterrows():
            strength = round(np.max(probabilities[i]) * 100, 2)
            results.append({
                "category": row["category"],
                "habit_label": labels[i],
                "habit_strength": strength
            })

        return results
