import numpy as np
from sklearn.ensemble import RandomForestRegressor

class ConfidenceMLModel:
    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=120,
            max_depth=6,
            random_state=42
        )
        self._train()

    def _train(self):
        # Features:
        # savings_ratio, investment_style, capacity_ratio
        X = np.array([
            [0.05, 0.3, 0.4],
            [0.15, 0.6, 0.9],
            [0.25, 0.6, 1.2],
            [0.35, 0.9, 1.5],
            [0.10, 0.3, 0.6],
            [0.30, 0.9, 2.0]
        ])

        # Confidence score (0–100)
        y = np.array([25, 55, 70, 90, 40, 95])

        self.model.fit(X, y)

    def predict(self, features):
        return self.model.predict(features)
