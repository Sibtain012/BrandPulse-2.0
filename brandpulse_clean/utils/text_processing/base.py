"""
BrandPulse Clean – Base Text Processing
========================================
Platform-agnostic base functions for cleaning text, hashing authors, 
and aggregating sentiment.

These functions contain ZERO database side effects. They are pure data 
transformations intended to be shared across all platform processors 
(Reddit, Twitter, etc.).

Source: ETL_2/silver_layer.py
"""

import re
import html
import hashlib
from typing import List, Tuple

# Shared whitespace pattern
WHITESPACE_PATTERN = re.compile(r"\s+")


def clean_text(text: str) -> str:
    """
    Apply generic, platform-agnostic text cleaning:
    1. Unescape HTML entities
    2. Remove URLs (http/www)
    3. Normalize whitespace to single spaces
    
    Returns stripped, cleaned text.
    """
    if not text: 
        return ""
    
    text = html.unescape(text)
    
    # Remove URLs
    text = re.sub(r'http\S+|www\S+', '', text)
    
    # Normalize whitespace
    text = WHITESPACE_PATTERN.sub(" ", text)
    
    return text.strip()


def hash_author(author: str):
    """
    Hash an author name to a SHA256 hex string for privacy.
    (Kept exactly as written in silver_layer.py)
    """
    if not author or author.lower() in ["[deleted]", "automoderator"]:
        return None
    return hashlib.sha256(author.encode()).hexdigest()


def aggregate_sentiment(sentiments: List[dict]) -> Tuple[str, float]:
    """
    Given a list of sentiment dicts [{'label': 'Positive', 'score': 0.8}, ...],
    aggregate them into a single (label, score) tuple based on strong signals.
    (Kept exactly as written in silver_layer.py)
    """
    if not sentiments: 
        return ("Neutral", 0.0)
    
    strong_signals = [s for s in sentiments if s["score"] > 0.7]
    if not strong_signals: 
        return ("Neutral", 0.5)
    
    pos_count = sum(1 for s in strong_signals if s["label"] == "Positive")
    neg_count = sum(1 for s in strong_signals if s["label"] == "Negative")
    
    if pos_count > neg_count:
        return ("Positive", round(pos_count / len(strong_signals), 4))
    elif neg_count > pos_count:
        return ("Negative", round(neg_count / len(strong_signals), 4))
    
    return ("Neutral", 0.0)
