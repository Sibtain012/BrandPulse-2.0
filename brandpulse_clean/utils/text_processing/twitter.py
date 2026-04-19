"""
BrandPulse Clean – Twitter Text Processing
==========================================
Twitter-specific text cleaning and validation logic.
Mirrors: utils/text_processing/reddit.py
"""

import re
from utils.text_processing.base import clean_text


def clean_twitter_text(text: str) -> str:
    """
    Apply generic cleaning first, then Twitter-specific cleaning:
    1. Strip @mentions (privacy: no usernames in cleaned text)
    2. Strip #hashtags (noise for sentiment)
    3. Strip 'RT :' retweet prefix if it slipped through the filter
    """
    if not text:
        return ""

    cleaned = clean_text(text)               # handles URLs, HTML entities, whitespace

    cleaned = re.sub(r'@\w+', '', cleaned)   # remove @mentions
    cleaned = re.sub(r'#\w+', '', cleaned)   # remove #hashtags
    cleaned = re.sub(r'^RT\s*:\s*', '', cleaned)  # strip retweet prefix

    return cleaned.strip()


def is_eligible_tweet(tweet: dict) -> bool:
    """
    Check if a raw tweet dict is eligible for silver processing.
    Mirrors: utils/text_processing/reddit.is_eligible_comment()

    Rules (same rationale as Reddit filters):
    - Must have text
    - Must be English (lang == 'en')
    - Must not be a pure retweet (text starts with 'RT @')
    - Cleaned text must be >= 5 words
    """
    text = tweet.get("text", "")
    if not text:
        return False
    if tweet.get("lang", "") != "en":
        return False
    if text.strip().startswith("RT @"):
        return False

    cleaned = clean_twitter_text(text)
    return len(cleaned.split()) >= 5
