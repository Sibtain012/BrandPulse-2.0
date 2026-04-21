"""
BrandPulse Clean – Domain Enums
================================
Replaces all hardcoded status strings, platform names, and content-type IDs
scattered across ETL_2/*.py with type-safe enum values.

Values are taken verbatim from:
- PostgreSQL ENUM type  `pipeline_status`  → PipelineStatus
- dim_platform table                        → Platform
- dim_content_type table                    → ContentType
- dim_sentiment table                       → SentimentLabel

Usage:
    from models.enums import PipelineStatus, Platform
    update_status_by_id(request_id, PipelineStatus.PROCESSING.value)
"""

from enum import Enum


# ---------------------------------------------------------------------------
# Pipeline Status — matches PostgreSQL ENUM `pipeline_status` exactly
# Used in: bronze_reddit_ingest.py (mark_keyword_status),
#          brandpulse_master.py (update_status_by_id)
# Values: 'IDLE', 'PROCESSING', 'COMPLETED', 'FAILED'
# ---------------------------------------------------------------------------
class PipelineStatus(str, Enum):
    IDLE = "IDLE"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# ---------------------------------------------------------------------------
# Platform — matches dim_platform rows exactly
# IDs mirror dim_platform.platform_id in PostgreSQL:
#   reddit  → 1
#   twitter → 2
# ---------------------------------------------------------------------------
class Platform(str, Enum):
    REDDIT = "reddit"
    TWITTER = "twitter"

    @property
    def dim_id(self) -> int:
        """Return the corresponding dim_platform.platform_id."""
        return _PLATFORM_DIM_IDS[self]


_PLATFORM_DIM_IDS = {
    Platform.REDDIT: 1,
    Platform.TWITTER: 2,
}


# ---------------------------------------------------------------------------
# Content Type — matches dim_content_type rows exactly
# IDs mirror dim_content_type.content_type_id in PostgreSQL:
#   post    → 1  (used in gold INSERT_POST_SENTIMENT_SQL)
#   comment → 2  (used in gold INSERT_COMMENT_SENTIMENT_SQL)
#   tweet   → 3  (used in gold INSERT_TWEET_SENTIMENT_SQL)
# ---------------------------------------------------------------------------
class ContentType(str, Enum):
    POST = "post"
    COMMENT = "comment"
    TWEET = "tweet"

    @property
    def dim_id(self) -> int:
        """Return the corresponding dim_content_type.content_type_id."""
        return _CONTENT_TYPE_DIM_IDS[self]


_CONTENT_TYPE_DIM_IDS = {
    ContentType.POST: 1,
    ContentType.COMMENT: 2,
    ContentType.TWEET: 3,
}


# ---------------------------------------------------------------------------
# Sentiment Label — matches dim_sentiment rows exactly
# IDs mirror dim_sentiment.sentiment_id in PostgreSQL:
#   Negative → 1
#   Neutral  → 2
#   Positive → 3
# NOTE: Title case is canonical. The ETL must normalize casing when writing.
# (See: analysis_history.dominant_sentiment inconsistent casing bug)
# ---------------------------------------------------------------------------
class SentimentLabel(str, Enum):
    NEGATIVE = "Negative"
    NEUTRAL = "Neutral"
    POSITIVE = "Positive"

    @property
    def dim_id(self) -> int:
        """Return the corresponding dim_sentiment.sentiment_id."""
        return _SENTIMENT_DIM_IDS[self]


_SENTIMENT_DIM_IDS = {
    SentimentLabel.NEGATIVE: 1,
    SentimentLabel.NEUTRAL: 2,
    SentimentLabel.POSITIVE: 3,
}


# ---------------------------------------------------------------------------
# Intent Label — matches dim_intent rows exactly
# IDs mirror dim_intent.intent_id in PostgreSQL:
#   Complaint → 1
#   Inquiry   → 2
#   Praise    → 3
# ---------------------------------------------------------------------------
class IntentLabel(str, Enum):
    COMPLAINT = "Complaint"
    INQUIRY = "Inquiry"
    PRAISE = "Praise"

    @property
    def dim_id(self) -> int:
        """Return the corresponding dim_intent.intent_id."""
        return _INTENT_DIM_IDS[self]


_INTENT_DIM_IDS = {
    IntentLabel.COMPLAINT: 1,
    IntentLabel.INQUIRY: 2,
    IntentLabel.PRAISE: 3,
}


# ---------------------------------------------------------------------------
# Analysis Mode — sentinel values for mode parameter throughout the pipeline
# ---------------------------------------------------------------------------
class AnalysisMode(str, Enum):
    SENTIMENT = "sentiment"
    INTENT = "intent"
