"""
BrandPulse Clean – Gold Aggregator Router
===========================================
Thin router to direct gold layer aggregation to the correct
platform-specific aggregator.

Source: ETL_2/gold_layer.py

ARCHITECTURAL FIX:
    Removed all SQL from the orchestrator. This script simply routes
    to the correct platform module (e.g., reddit_aggregator.py).
    When Twitter is added, it will be mapped here without touching
    Reddit logic.
"""

from pipeline.gold.reddit_aggregator import run_reddit_gold
from pipeline.gold.twitter_aggregator import run_twitter_gold


def run_gold_etl(keyword, request_id, platform='reddit', mode='sentiment'):
    """
    Route the gold ETL process to the appropriate platform aggregator.
    
    Parameters
    ----------
    keyword : str
        The search term being processed.
    request_id : int or str
        The global_keyword_id from the database.
    platform : str
        The platform to process (default: 'reddit').
    mode : str
        'sentiment' (default) or 'intent'. Passed through to aggregator.
    
    Raises
    ------
    ValueError
        If an unsupported platform is passed.
    """
    if platform == 'reddit':
        run_reddit_gold(keyword, request_id, mode=mode)
    elif platform == 'twitter':
        run_twitter_gold(keyword, request_id, mode=mode)
    else:
        raise ValueError(f"Unsupported platform: {platform}")
