ALLOWED_CATEGORIES = {
    "Fixed": [
        "rent",
        "insurance",
        "loan payments",
        "emi",
        "other - fixed",
    ],
    "Variable": [
        "food and groceries",
        "utilities",
        "transport",
        "medical",
        "other - variable",
    ],
    "Discretionary": [
        "dining out",
        "shopping",
        "entertainment",
        "subscriptions",
        "travel",
        "other - discretionary",
    ],
}

CATEGORY_TO_NATURE = {
    category.strip().lower(): nature
    for nature, categories in ALLOWED_CATEGORIES.items()
    for category in categories
}

ALLOWED_CATEGORY_SET = set(CATEGORY_TO_NATURE.keys())
