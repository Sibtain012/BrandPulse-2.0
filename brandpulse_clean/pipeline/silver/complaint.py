"""
BrandPulse Clean – Complaint Classification Pipeline
======================================================
HuggingFace complaint inference, lazy-loaded to avoid loading a
large model on every import.

Sibling of: pipeline/silver/intent.py

The model classifies text into two categories:
  - Complaint     — user is reporting a problem / dissatisfaction
  - Non-Complaint — anything else

MODEL_NAME is read from config/settings.py (COMPLAINT_MODEL env var),
defaulting to "ibrahimtime/complaint-classifier-v2".

LABEL NORMALIZATION:
    The model was probed and emits lowercase/hyphen labels:
        'complaint' / 'non-complaint'   (id2label {0: non-complaint, 1: complaint})
    We normalize to canonical Title-case 'Complaint' / 'Non-Complaint'
    matching dim_complaint. LABEL_0/LABEL_1 fallbacks kept for safety.
"""

from typing import List

from transformers import pipeline
import torch

from config.settings import COMPLAINT_MODEL

# ---------------------------------------------------------------------------
# Label map — model id2label is {0: 'non-complaint', 1: 'complaint'}.
# Keys cover the raw label strings the pipeline may return, in any casing.
# ---------------------------------------------------------------------------
LABEL_MAP = {
    "LABEL_0": "Non-Complaint",
    "LABEL_1": "Complaint",
    "non-complaint": "Non-Complaint",
    "non_complaint": "Non-Complaint",
    "noncomplaint": "Non-Complaint",
    "complaint": "Complaint",
}


def _normalize(label: str) -> str:
    """Map a raw model label to the canonical dim_complaint label."""
    return LABEL_MAP.get(label, LABEL_MAP.get(label.lower(), label))


_complaint_pipeline = None


def _get_complaint_pipeline():
    """Return the HF complaint pipeline, loading the model on first call."""
    global _complaint_pipeline
    if _complaint_pipeline is None:
        print(f"[COMPLAINT] Loading complaint model: {COMPLAINT_MODEL}")
        try:
            _complaint_pipeline = pipeline(
                "text-classification",
                model=COMPLAINT_MODEL,
                tokenizer=COMPLAINT_MODEL,
                truncation=True,
                max_length=128,
                device=0 if torch.cuda.is_available() else -1,
            )
            print(f"[COMPLAINT] Model loaded on device={'cuda' if torch.cuda.is_available() else 'cpu'}")
        except Exception as e:
            print(f"[COMPLAINT] CRITICAL: Failed to load complaint model: {e}")
            raise
    return _complaint_pipeline


def run_complaint_batch(texts: List[str]) -> List[dict]:
    """
    Run batch complaint inference on a list of text strings.

    Returns
    -------
    List[dict] with keys:
        "label" – "Complaint" or "Non-Complaint"
        "score" – confidence rounded to 4 decimals
    """
    if not texts:
        return []
    print(f"[COMPLAINT] Running inference on {len(texts)} texts...")
    cp = _get_complaint_pipeline()
    results = cp(texts)
    print(f"[COMPLAINT] Inference complete. Sample: {results[0]['label'] if results else 'N/A'}")
    return [
        {
            "label": _normalize(r["label"]),
            "score": round(float(r["score"]), 4),
        }
        for r in results
    ]
