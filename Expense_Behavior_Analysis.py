import pandas as pd
import numpy as np
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

class Expensebehavoiur:
    def __init__(self, z_threshold=2.5, overspend=1.5, n_cluster=3):
        self.z_threshold=z_threshold
        self.overspend=overspend
        self.n_cluster=n_cluster


    def preprocess(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df["month"] = df["timestamp"].dt.to_period("M")
        df["day"] = df["timestamp"].dt.dayofweek
        df["hour"] = df["timestamp"].dt.hour
        return df
    
    def stablity(self, df: pd.DataFrame) -> pd.DataFrame:
        records = []

        for(month, category), group in df.groupby(["month", "category"]):
            mean = group["amount"].mean()
            std = group["amount"].std()
            cv = (std/mean)* 100 if mean > 0 else 0

            stablity_score = round(max(0,100 - cv),2)

            records.append({
                "month": str(month),
                "category": category,
                "mean_spend": round(mean,2),
                "stablity_score": stablity_score
            })
        return pd.DataFrame(records)
    
    def overspending(self, df: pd.DataFrame) -> pd.DataFrame:
        df= df.copy()
        df["is_overspending"] = False

        for category in df["category"].unique():
            category_data = df[df["category"]==category]
            median = category_data["amount"].median()
            threshold = median*self.overspend

            df.loc[(df["category"]==category)&(df["amount"]>threshold), "is_overspending"] = True

        return df[["timestamp", "category", "amount", "is_overspending"]]
    
    def anomalies(self, df: pd.DataFrame) -> pd.DataFrame:
        df=df.copy()
        df["is_anomaly"] = False

        for category in df ["category"].unique():
            category_data = df[df["category"]==category]
            if len(category_data) <3:
                continue

            z_scores =np.abs(stats.zscore(category_data["amount"]))
            df.loc[category_data.index, "is_anomaly"] = z_scores > self.z_threshold
        
        return df[["timestamp", "category", "amount", "is_anomaly"]]
    
    def cluster_expnse(self, df: pd.DataFrame) -> pd.DataFrame:
        features = df[["amount", "hour", "day"]]

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(features)

        kmeans = KMeans(n_clusters = self.n_cluster, random_state=42, n_init=10)
        
        df["cluster"] = kmeans.fit_predict(X_scaled)

        cluster_means = df.groupby("cluster")["amount"].mean().sort_values()
        labels = ["low", "medium", "high"]
        mapping = {cluster: label for cluster, label in zip(cluster_means.index, labels) }

        df["cluster_label"] = df["cluster"].map(mapping)
        return df[["timestamp", "category", "amount","cluster_label"]]
    
    def volatility(self, df: pd.DataFrame) -> float:
        return round(df["amount"].std(),2)
    
    def summary(self, stability_df: pd.DataFrame, overspend_df: pd.DataFrame, volatile: float)-> dict:
        avg_stabiltiy = stability_df["stablity_score"].mean()
        overspend_rate = overspend_df["is_overspending"].mean()

        if avg_stabiltiy >=70:
            stability_level = "stable" 
        elif avg_stabiltiy >=40:
            stability_level = "Moderate"
        else: 
            stability_level = "Unstable"

        if volatile <100:
            volatility_level = "low"
        elif volatile <300:
            volatility_level = "Medium"
        else:
            volatility_level = "High"

        
        return{
            "stability_level": stability_level,
            "stablity_score": round(avg_stabiltiy,2),
            "volatility_level": volatility_level,
            "oversepnding": bool(overspend_rate >0.25)
        }
    

    def analyse(self, df: pd.DataFrame) -> dict:
        df = self.preprocess(df)

        stability_df = self.stablity(df)
        overspend_df = self.overspending(df)
        anomaly_df = self.anomalies(df)
        cluster_df = self.cluster_expnse(df)
        voaltility = self.volatility(df)

        summarise = self.summary(stability_df,overspend_df,voaltility)

        return{
            "behvour summary": summarise,
            "category stabliity": stability_df,
            "overspending":overspend_df,
            "anomaly": anomaly_df,
            "expense_clusters": cluster_df
        }



    


        