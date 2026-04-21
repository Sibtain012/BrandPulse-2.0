"""
BrandPulse Clean – Intent Classification Pipeline
====================================================
HuggingFace intent inference, lazy-loaded to avoid loading a
large model on every import.

Sibling of: pipeline/silver/sentiment.py

The intent model classifies text into three categories:
  - Complaint — user is dissatisfied, has an issue
  - Inquiry   — user is asking a question, seeking information
  - Praise    — user is expressing positive feedback

MODEL_NAME is read from config/settings.py (INTENT_MODEL env var),
defaulting to "ibrahimtime/bertweet-intent-classifier-v2".
"""

from typing import List

from transformers import pipeline
import torch

from config.settings import INTENT_MODEL

# ---------------------------------------------------------------------------
# Label map — the intent model config.json shows id2label:
#   0 → Complaint, 1 → Inquiry, 2 → Praise
# The model returns human-readable labels directly, but we keep
# LABEL_N fallbacks for safety.
# ---------------------------------------------------------------------------
LABEL_MAP = {
    "LABEL_0": "Complaint",
    "LABEL_1": "Inquiry",
    "LABEL_2": "Praise",
    # Identity mappings — model returns these directly per config.json
    "Complaint": "Complaint",
    "Inquiry": "Inquiry",
    "Praise": "Praise",
}

# ---------------------------------------------------------------------------
# Lazy singleton — model is loaded on first call to run_intent_batch()
# ---------------------------------------------------------------------------
_intent_pipeline = None


def _get_intent_pipeline():
    """
    Return the HuggingFace intent pipeline, loading the model on
    first call and caching it for subsequent calls.

    Uses INTENT_MODEL from config/settings.py, which defaults to
    "ibrahimtime/bertweet-intent-classifier-v2" but can be overridden
    via the INTENT_MODEL environment variable.
    """
    global _intent_pipeline
    if _intent_pipeline is None:
        print(f"[INTENT] Loading intent model: {INTENT_MODEL}")
        try:
            _intent_pipeline = pipeline(
                "text-classification",
                model=INTENT_MODEL,
                tokenizer=INTENT_MODEL,
                truncation=True,
                max_length=128,
                device=0 if torch.cuda.is_available() else -1,
            )
            print(f"[INTENT] Model loaded successfully on device={'cuda' if torch.cuda.is_available() else 'cpu'}")
        except Exception as e:
            print(f"[INTENT] CRITICAL: Failed to load intent model: {e}")
            raise
    return _intent_pipeline


def run_intent_batch(texts: List[str]) -> List[dict]:
    """
    Run batch intent inference on a list of text strings.

    Parameters
    ----------
    texts : List[str]
        Cleaned text strings to classify.

    Returns
    -------
    List[dict]
        Each dict has keys:
            "label" – human-readable label ("Complaint", "Inquiry", "Praise")
            "score" – confidence score rounded to 4 decimal places

    Example
    -------
        results = run_intent_batch(["my wifi is broken", "what are your hours", "love this product"])
        # [{"label": "Complaint", "score": 0.9721},
        #  {"label": "Inquiry",   "score": 0.8834},
        #  {"label": "Praise",    "score": 0.9512}]
    """
    if not texts:
        return []
    print(f"[INTENT] Running inference on {len(texts)} texts...")
    ip = _get_intent_pipeline()
    results = ip(texts)
    print(f"[INTENT] Inference complete. Sample label: {results[0]['label'] if results else 'N/A'}")
    return [
        {
            "label": LABEL_MAP.get(r["label"], r["label"]),
            "score": round(float(r["score"]), 4),
        }
        for r in results
    ]
