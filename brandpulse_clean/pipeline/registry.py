"""
BrandPulse Clean – Platform Registry
====================================
Maps string platform identifiers (e.g., 'reddit', 'twitter') to their
respective pipeline classes.

Source: New architectural decision to replace if/else branching
in the orchestrator.

ARCHITECTURAL FIX:
    When adding a new platform (like Twitter), simply create a
    `TwitterPipeline` class and add `'twitter': TwitterPipeline` to
    `PLATFORM_REGISTRY`. The orchestrator (brandpulse_master.py equivalent)
    requires zero changes.
"""

from pipeline.bronze.reddit_ingest import ingest_keyword as ingest_reddit
from pipeline.silver.reddit_processor import run_silver as process_reddit
from pipeline.bronze.twitter_ingest import ingest_keyword as ingest_twitter
from pipeline.silver.twitter_processor import run_silver_twitter
from pipeline.gold.aggregator import run_gold_etl


class RedditPipeline:
    """Standardized interface for executing Reddit ETL stages."""

    def ingest(self, keyword, request_id):
        ingest_reddit(keyword, request_id)

    def process(self, request_id, mode='sentiment'):
        process_reddit(request_id, mode=mode)

    def aggregate(self, keyword, request_id, mode='sentiment'):
        run_gold_etl(keyword, request_id, platform='reddit', mode=mode)


class TwitterPipeline:
    """Standardized interface for executing Twitter ETL stages."""

    def ingest(self, keyword, request_id):
        ingest_twitter(keyword, request_id)

    def process(self, request_id, mode='sentiment'):
        run_silver_twitter(request_id, mode=mode)

    def aggregate(self, keyword, request_id, mode='sentiment'):
        run_gold_etl(keyword, request_id, platform='twitter', mode=mode)


# Central registry mapping platform names to Runner implementations
PLATFORM_REGISTRY = {
    'reddit': RedditPipeline,
    'twitter': TwitterPipeline,
}


def get_pipeline(platform: str):
    """
    Factory function yielding an initialized Pipeline runner based on
    the requested platform string.
    
    Parameters
    ----------
    platform : str
        Target platform string. e.g. "reddit".
    
    Returns
    -------
    Instance of the registered Pipeline runner.
    
    Raises
    ------
    ValueError
        If the platform string is not found in PLATFORM_REGISTRY.
    """
    platform_key = platform.strip().lower()
    if platform_key not in PLATFORM_REGISTRY:
        raise ValueError(
            f"Platform '{platform}' not supported. "
            f"Available platforms: {list(PLATFORM_REGISTRY.keys())}"
        )
    return PLATFORM_REGISTRY[platform_key]()
