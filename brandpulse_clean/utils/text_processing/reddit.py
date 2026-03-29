"""
BrandPulse Clean – Reddit Text Processing
=========================================
Reddit-specific text cleaning and validation logic.

Source: ETL_2/silver_layer.py
"""

import re
from utils.text_processing.base import clean_text


def clean_reddit_text(text: str) -> str:
    """
    Apply generic cleaning first, then Reddit-specific cleaning:
    1. Strip markdown links [text](url) -> text
    2. Strip markdown styling characters (*, #, _, |, >)
    3. Normalize double quotes
    """
    if not text:
        return ""
    
    # Apply base, platform-agnostic cleaning
    cleaned = clean_text(text)
    
    # Reddit-specific markdown stripping
    cleaned = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', cleaned)
    cleaned = re.sub(r'[\*#_\|>]', '', cleaned)
    
    # Quote normalization
    cleaned = cleaned.replace('""', '"')
    
    return cleaned.strip()


def is_eligible_comment(comment: dict) -> bool:
    """
    Check if a Reddit comment is eligible for processing.
    Filters out empty bodies, [deleted]/automoderator authors, 
    and extremely short comments (< 5 words).
    (Kept exactly as written in silver_layer.py)
    """
    body = comment.get("body", "")
    author = comment.get("author", "")
    if not body or author.lower() in ["[deleted]", "automoderator"]:
        return False
    return len(body.split()) >= 5
