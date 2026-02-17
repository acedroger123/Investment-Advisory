import os
import pandas as pd

# ... (keep the MAP definitions at the top)

def preprocess_goal_data(csv_path: str):
    # This change ensures it finds the CSV in the same folder as the script
    base_path = os.path.dirname(__file__)
    actual_path = os.path.join(base_path, "goal_data.csv")
    
    df = pd.read_csv(actual_path)

    # ... (keep the rest of the mapping logic below)
