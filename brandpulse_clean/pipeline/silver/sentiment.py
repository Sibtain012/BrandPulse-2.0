"""
BrandPulse Clean – Sentiment Pipeline
=======================================
HuggingFace sentiment inference, lazy-loaded to avoid loading a
large model on every import.

Source: ETL_2/silver_layer.py lines 32-86

ARCHITECTURAL FIX:
    In the original code, the sentiment pipeline was initialised at
    MODULE LEVEL:
        sentiment_pipeline = pipeline(...)   # ← loads model on import!
    This would trigger a full model download/load whenever any other
    module imported silver_layer.py, even for unrelated tasks.

    In this clean version the HuggingFace pipeline is created inside
    _get_sentiment_pipeline() on first call and cached in a module-level
    private variable.  The model is never loaded until the first call to
    run_sentiment_batch().

MODEL_NAME is read from config/settings.py (which reads SENTIMENT_MODEL
from the environment), defaulting to the value hardcoded in the
original: "ibrahimtime/bertweet-sentiment-finetuned".
"""

from typing import List

from transformers import pipeline
import torch

from config.settings import SENTIMENT_MODEL

# ---------------------------------------------------------------------------
# Label map — exactly as written in silver_layer.py line 46-50
# ---------------------------------------------------------------------------
LABEL_MAP = {
    "LABEL_0": "Negative",
    "LABEL_1": "Neutral",
    "LABEL_2": "Positive",
}

# ---------------------------------------------------------------------------
# Lazy singleton — model is loaded on first call to run_sentiment_batch()
# ---------------------------------------------------------------------------
_sentiment_pipeline = None


def _get_sentiment_pipeline():
    """
    Return the HuggingFace sentiment pipeline, loading the model on
    first call and caching it for subsequent calls.

    Uses SENTIMENT_MODEL from config/settings.py, which defaults to
    "ibrahimtime/bertweet-sentiment-finetuned" but can be overridden
    via the SENTIMENT_MODEL environment variable.
    """
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        _sentiment_pipeline = pipeline(
            "sentiment-analysis",
            model=SENTIMENT_MODEL,
            tokenizer=SENTIMENT_MODEL,
            truncation=True,
            max_length=128,
            device=0 if torch.cuda.is_available() else -1,
        )
    return _sentiment_pipeline


def run_sentiment_batch(texts: List[str]) -> List[dict]:
    """
    Run batch sentiment inference on a list of text strings.

    Parameters
    ----------
    texts : List[str]
        Cleaned text strings to classify.

    Returns
    -------
    List[dict]
        Each dict has keys:
            "label" – human-readable label ("Positive", "Neutral", "Negative")
            "score" – confidence score rounded to 4 decimal places

    Example
    -------
        results = run_sentiment_batch(["Great product!", "Terrible."])
        # [{"label": "Positive", "score": 0.9721},
        #  {"label": "Negative", "score": 0.8834}]
    """
    if not texts:
        return []
    sp = _get_sentiment_pipeline()
    results = sp(texts)
    return [
        {
            "label": LABEL_MAP.get(r["label"], "Neutral"),
            "score": round(float(r["score"]), 4),
        }
        for r in results
    ]
