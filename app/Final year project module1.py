import pandas as pd
import os




def encode_age(value):
    mapping = {
        "Below 25": 0,
        "25–35": 1,
        "36–45": 2,
        "46–55": 3,
        "Above 55": 4
    }
    return mapping[value]

def encode_income(value):
    mapping = {
        "Below 20,000": 0,
        "20,000 – 50,000": 1,
        "50,001 – 1,00,000": 2,
        "Above 1,00,000": 3
    }
    return mapping[value]

def encode_savings(value):
    mapping = {
        "Less than 10%": 0,
        "10–20%": 1,
        "21–30%": 2,
        "More than 30%": 3
    }
    return mapping[value]

def encode_experience(value):
    mapping = {
        "No experience": 0,
        "Less than 1 year": 1,
        "1–3 years": 2,
        "More than 3 years": 3
    }
    return mapping[value]

def encode_financial_comfort(value):
    mapping = {
        "Not comfortable": 0,
        "Somewhat comfortable": 1,
        "Comfortable": 2,
        "Very comfortable": 3
    }
    return mapping[value]

def encode_loss_reaction(value):
    mapping = {
        "Withdraw immediately": 0,
        "Wait for recovery": 1,
        "Invest more": 2,
        "Not sure": 1
    }
    return mapping[value]

def encode_return_priority(value):
    mapping = {
        "Capital protection": 0,
        "Balance between safety and growth": 1,
        "High returns even with high risk": 2
    }
    return mapping[value]

def encode_volatility(value):
    mapping = {
        "Very uncomfortable": 0,
        "Slightly uncomfortable": 1,
        "Neutral": 2,
        "Comfortable": 3
    }
    return mapping[value]

def calculate_risk_label(row):
    risk_score = (
        row["loss_reaction"] +
        row["return_priority"] +
        row["volatility_comfort"] +
        row["financial_comfort"]
    )

    if risk_score <= 3:
        return 0
    elif risk_score <= 6:
        return 1
    else:
        return 2

def preprocess(input_csv, output_csv):
    df = pd.read_csv(input_csv)


    df = df.drop(columns=["Name", "Timestamp"], errors="ignore")

    df["age_group"] = df["Age group"].apply(encode_age)
    df["income_range"] = df["Monthly Income"].apply(encode_income)
    df["savings_percent"] = df["Savings %"].apply(encode_savings)
    df["investment_experience"] = df["Investment Experience"].apply(encode_experience)
    df["financial_comfort"] = df["Financial Comfort"].apply(encode_financial_comfort)
    df["loss_reaction"] = df["Reaction to 10% loss"].apply(encode_loss_reaction)
    df["return_priority"] = df["Risk vs Return Preference"].apply(encode_return_priority)
    df["volatility_comfort"] = df["Volatility Comfort"].apply(encode_volatility)

    df["instruments_used_count"] = (
        df["Instruments Used"]
        .fillna("")
        .apply(lambda x: len([i for i in x.split(",") if i.strip()]))
    )

    df["risk_label"] = df.apply(calculate_risk_label, axis=1)

    final_columns = [
        "age_group",
        "income_range",
        "savings_percent",
        "investment_experience",
        "instruments_used_count",
        "financial_comfort",
        "loss_reaction",
        "return_priority",
        "volatility_comfort",
        "risk_label"
    ]

    df[final_columns].to_csv(output_csv, index=False)

if __name__ == "__main__":
    preprocess(
       r"C:\Users\Ashis_bc67jy2\Downloads\survey_raw.csv",
       r"C:\Users\Ashis_bc67jy2\Downloads\risk_dataset.csv"
    )
