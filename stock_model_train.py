import yfinance as yf
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import joblib
from datetime import datetime, timedelta

tickers = [
    'AAPL','MSFT','GOOGL','GOOG','AMZN','META','NVDA','TSLA','ADBE','CRM',
    'INTC','CSCO','ORCL','IBM','AMD','QCOM','TXN','AVGO','NOW','SNOW',
    'INTU','AMAT','LRCX','MU','PANW','FTNT','ANET','SHOP','UBER','SQ',

    'JPM','BAC','WFC','GS','MS','C','BLK','SCHW','AXP','USB',
    'PNC','TFC','COF','BK','STT','DFS','AIG','MET','PRU','ALL',

    'JNJ','UNH','PFE','ABT','TMO','MRK','ABBV','DHR','LLY','BMY',
    'AMGN','GILD','ISRG','VRTX','MDT','REGN','CI','ELV','ZTS','BDX',

    'WMT','HD','MCD','NKE','SBUX','TGT','LOW','COST','DIS','BKNG',
    'ROST','TJX','MAR','HLT','YUM','EBAY','ETSY','CMG','DG','DLTR',

    'BA','HON','UNP','CAT','GE','MMM','LMT','RTX','DE','EMR',
    'UPS','FDX','CSX','NSC','WM','ETN','ITW','PH','ROK','PCAR',

    'XOM','CVX','COP','SLB','EOG','VLO','MPC','PSX','OXY','HAL',
    'BKR','DVN','FANG','APA','HES',

    'T','VZ','TMUS','CMCSA','NFLX','DISCA','DISCK','PARA',

    'PG','KO','PEP','PM','CL','MDLZ','EL','KMB','GIS','KHC',
    'HSY','MKC','SJM','STZ','TAP',

    'AMT','PLD','CCI','EQIX','PSA','SPG','DLR','O','VTR','WELL',
    'AVB','EQR','ESS','BXP','ARE',

    'NEE','DUK','SO','D','AEP','EXC','SRE','XEL','ED','PEG'
]



def fetch_stiock_data(tickers, years=10 ):
    end_date = datetime.today()
    start_date = end_date - timedelta(days=years*365)
    data = yf.download(tickers, start=start_date, end=end_date, auto_adjust=True,progress=False)['Close']
    return data

def calculate_features(prices):
    prices = prices.dropna(axis=1,thresh=int(0.8*len(prices)))
    daily_returns = prices.pct_change().dropna()
    annual_return = daily_returns.mean() * 252
    volatility = daily_returns.std() * np.sqrt(252)
    features = pd.DataFrame({
        'annual_return': annual_return,
        'volatility': volatility
    }).dropna()
    return features

def train_kmeans(features, n_clusters=3):
    scaler = StandardScaler()
    scaled_features = scaler.fit_transform(features)

    kmeans =KMeans(n_clusters=n_clusters, random_state=42)
    features['cluster'] = kmeans.fit_predict(scaled_features)

    cluster_vol = features.groupby('cluster')['volatility'].mean().sort_values()
    risk_mapping = {cluster_vol.index[0]:'low',
                    cluster_vol.index[1]:'medium',
                    cluster_vol.index[2]:'high'}
    features['risks'] = features['cluster'].map(risk_mapping)

    return features, kmeans, scaler

if __name__ == "__main__":
    prices = fetch_stiock_data(tickers)
    features = calculate_features(prices)
    stock_features, kmeans, scaler = train_kmeans(features)

    joblib.dump(kmeans, 'kmeans_model.joblib')
    joblib.dump(scaler, 'scaler.joblib')
    stock_features.to_pickle('stock_features.pkl')

    print("The model is trained and saved successfully.")

    print("Prices:", prices.shape)
    print("Features:", features.shape)
    print(features.head())
    print(features.groupby('risks')['volatility'].mean())


