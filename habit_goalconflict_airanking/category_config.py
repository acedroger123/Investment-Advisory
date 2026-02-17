ALLOWED_CATEGORIES = {
    "Fixed": [
        "rent",
        "insurance",
        "loan payments",
    ],
    "Variable": [
        "Food and groceries",
        "utilities",
        "transport",
        "medical",
    ],
    "Discretionary": [
        "dinning out",
        "shopping",
        "entertainment",
        "subscriptions",
        "travel",
    ],
}

CATEGORY_TO_NATURE = {
    category.strip().lower(): nature
    for nature, categories in ALLOWED_CATEGORIES.items()
    for category in categories
}

ALLOWED_CATEGORY_SET = set(CATEGORY_TO_NATURE.keys())
