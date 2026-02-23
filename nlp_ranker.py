from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

TEMPLATES = {
    "time_shift": "move spending to planned daytime purchases",
    "home_substitution": "replace paid convenience with home alternatives",
    "bundle_plan": "group purchases into fewer planned sessions",
    "low_cost_swap": "swap high-cost items with lower-cost options",
    "cooldown_rule": "add a short waiting period before purchase",
}

_vectorizer = TfidfVectorizer()
_template_keys = list(TEMPLATES.keys())
_template_vectors = _vectorizer.fit_transform([TEMPLATES[k] for k in _template_keys])


def rank_templates(habit_description: str, top_k: int = 3):
    habit_vec = _vectorizer.transform([habit_description])
    similarities = cosine_similarity(habit_vec, _template_vectors)[0]
    ranked = sorted(
        zip(_template_keys, similarities),
        key=lambda x: x[1],
        reverse=True,
    )
    return ranked[:top_k]
