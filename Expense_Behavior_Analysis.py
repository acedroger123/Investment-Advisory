import pandas as pd
import numpy as np
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

try:
    from category_config import CATEGORY_TO_NATURE
except ImportError:
    CATEGORY_TO_NATURE = {}


class Expensebehavoiur:
    def __init__(self, z_threshold=2.5, overspend=1.5, n_cluster=3, monthly_income=0.0):
        self.z_threshold = z_threshold
        self.n_cluster = n_cluster
        self.monthly_income = monthly_income

        if monthly_income <= 0:
            self.overspend = overspend
        elif monthly_income <= 20000:
            self.overspend = 1.2
        elif monthly_income <= 50000:
            self.overspend = 1.35
        elif monthly_income <= 100000:
            self.overspend = 1.5
        else:
            self.overspend = 1.8

    def preprocess(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df["month"] = df["timestamp"].dt.to_period("M")
        df["day"] = df["timestamp"].dt.dayofweek
        df["hour"] = df["timestamp"].dt.hour
        return df

    def stablity(self, df: pd.DataFrame) -> pd.DataFrame:
        records = []

        for (month, category), group in df.groupby(["month", "category"]):
            mean = group["amount"].mean()
            std = group["amount"].std()

            if pd.isna(std):
                monthly_totals = (
                    df[df["category"] == category]
                    .groupby("month")["amount"]
                    .sum()
                )
                if len(monthly_totals) >= 2:
                    cross_mean = monthly_totals.mean()
                    cross_std = monthly_totals.std()
                    cv = (cross_std / cross_mean) * 100 if cross_mean > 0 else 0
                else:
                    cv = 0
            elif mean <= 0:
                cv = 0
            else:
                cv = (std / mean) * 100

            stablity_score = round(max(0, 100 - cv), 2)

            records.append({
                "month": str(month),
                "category": category,
                "mean_spend": round(mean, 2),
                "stablity_score": stablity_score
            })
        return pd.DataFrame(records)

    def overspending(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["is_overspending"] = False

        df_behavioral = df[
            df["category"].str.strip().str.lower().map(
                lambda c: CATEGORY_TO_NATURE.get(c, "Variable")
            ) != "Fixed"
        ]

        for category in df_behavioral["category"].unique():
            category_data = df_behavioral[df_behavioral["category"] == category]
            median = category_data["amount"].median()
            threshold = median * self.overspend
            df.loc[
                (df["category"] == category) & (df["amount"] > threshold),
                "is_overspending"
            ] = True

        mask_non_fixed = df["category"].str.strip().str.lower().map(
            lambda c: CATEGORY_TO_NATURE.get(c, "Variable")
        ) != "Fixed"
        return df.loc[mask_non_fixed, ["timestamp", "category", "amount", "is_overspending"]]

    def anomalies(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["is_anomaly"] = False

        for category in df["category"].unique():
            category_data = df[df["category"] == category]
            if len(category_data) < 3:
                continue

            z_scores = np.abs(stats.zscore(category_data["amount"]))
            df.loc[category_data.index, "is_anomaly"] = z_scores > self.z_threshold

        return df[["timestamp", "category", "amount", "is_anomaly"]]

    def cluster_expnse(self, df: pd.DataFrame) -> pd.DataFrame:
        mask_non_fixed = df["category"].str.strip().str.lower().map(
            lambda c: CATEGORY_TO_NATURE.get(c, "Variable")
        ) != "Fixed"
        df_behavioral = df[mask_non_fixed].copy()

        if df_behavioral.empty or len(df_behavioral) < self.n_cluster:
            df_behavioral["cluster_label"] = "low"
            return df_behavioral[["timestamp", "category", "amount", "cluster_label"]]

        features = df_behavioral[["amount", "hour", "day"]]
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(features)

        kmeans = KMeans(n_clusters=self.n_cluster, random_state=42, n_init=10)
        df_behavioral["cluster"] = kmeans.fit_predict(X_scaled)

        cluster_means = df_behavioral.groupby("cluster")["amount"].mean().sort_values()
        labels = ["low", "medium", "high"]
        mapping = {cluster: label for cluster, label in zip(cluster_means.index, labels)}

        df_behavioral["cluster_label"] = df_behavioral["cluster"].map(mapping)
        return df_behavioral[["timestamp", "category", "amount", "cluster_label"]]

    def volatility(self, df: pd.DataFrame) -> float:
        return round(df["amount"].std(), 2)

    def summary(self, stability_df: pd.DataFrame, overspend_df: pd.DataFrame, volatile: float) -> dict:
        avg_stabiltiy = stability_df["stablity_score"].mean()
        overspend_rate = overspend_df["is_overspending"].mean()

        if avg_stabiltiy >= 70:
            stability_level = "stable"
        elif avg_stabiltiy >= 40:
            stability_level = "Moderate"
        else:
            stability_level = "Unstable"

        if volatile < 100:
            volatility_level = "low"
        elif volatile < 300:
            volatility_level = "Medium"
        else:
            volatility_level = "High"

        return {
            "stability_level": stability_level,
            "stablity_score": round(avg_stabiltiy, 2),
            "volatility_level": volatility_level,
            "oversepnding": bool(overspend_rate > 0.25)
        }

    def analyse(self, df: pd.DataFrame) -> dict:
        df = self.preprocess(df)

        stability_df = self.stablity(df)
        overspend_df = self.overspending(df)
        anomaly_df = self.anomalies(df)
        cluster_df = self.cluster_expnse(df)
        voaltility = self.volatility(df)

        summarise = self.summary(stability_df, overspend_df, voaltility)

        return {
            "behvour summary": summarise,
            "category stabliity": stability_df,
            "overspending": overspend_df,
            "anomaly": anomaly_df,
            "expense_clusters": cluster_df
        }
