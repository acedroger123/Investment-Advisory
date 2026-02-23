def analyze_transaction(transaction, user_profile):
    """
    Micro-level analysis of a single expense against a learned habit profile.
    """
    messages = []

    avg_spend = float(user_profile["spend"])
    confidence = float(user_profile["confidence"])
    frequency = float(user_profile.get("frequency", 0))
    consistency = float(user_profile.get("consistency", 0))
    weekend_ratio = float(user_profile.get("weekend_ratio", 0))
    nature = user_profile.get("expense_nature", "")

    if nature == "Fixed":
        if transaction["amount"] > avg_spend * 1.1:
            messages.append("This fixed expense is above its usual level and may indicate a price increase.")
        if consistency < 0.6:
            messages.append("Fixed-payment timing appears less regular than usual; review due-date consistency.")
        if not messages:
            messages.append("Fixed expense behavior is stable and payment consistency is on track.")
        return messages[:2]

    if transaction["amount"] > avg_spend * 1.25:
        messages.append("This expense is above your recent average for this category.")

    if weekend_ratio >= 0.55:
        messages.append("Spending in this category is concentrated on weekends.")

    if transaction["is_late_night"] and nature in {"Variable", "Discretionary"}:
        messages.append("This transaction occurred in a late-hour window where costs often trend higher.")

    if frequency >= 4:
        messages.append("Weekly transaction frequency in this category is elevated.")

    if consistency >= 0.7 and confidence >= 0.6:
        messages.append("This category shows a strengthening recurring spending pattern.")

    if not messages:
        messages.append("This transaction is within your normal pattern for this category.")

    return messages[:2]
