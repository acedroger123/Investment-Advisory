import pandas as pd
df = pd.read_pickle("stock_features.pkl") 
df.to_csv("stock_features_four.csv")
print("saved to csv file")