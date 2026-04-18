"""
BrandPulse Clean – Centralized Configuration
=============================================
All environment variables are loaded once here and exported as constants.
Every other module imports from this file instead of calling os.getenv().

Source: ETL_2/.env
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load .env from the brandpulse_clean root (one level up from config/)
# ---------------------------------------------------------------------------
_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017/BrandPulse_1")

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
POSTGRES_DSN: str = os.getenv("POSTGRES_DSN", "")

# ---------------------------------------------------------------------------
# Reddit API
# ---------------------------------------------------------------------------
REDDIT_CLIENT_ID: str = os.getenv("REDDIT_CLIENT_ID", "")
REDDIT_CLIENT_SECRET: str = os.getenv("REDDIT_CLIENT_SECRET", "")
REDDIT_USER_AGENT: str = os.getenv("REDDIT_USER_AGENT", "BrandPulse-Ingestor/1.0")

# ---------------------------------------------------------------------------
# Twitter / RapidAPI
# ---------------------------------------------------------------------------
RAPIDAPI_KEY: str = os.getenv("RAPIDAPI_KEY", "")

# ---------------------------------------------------------------------------
# Sentiment Model
# ---------------------------------------------------------------------------
# Default matches the model used in ETL_2/silver_layer.py line 35.
# Override via SENTIMENT_MODEL env var without code changes.
SENTIMENT_MODEL: str = os.getenv(
    "SENTIMENT_MODEL",
    "ibrahimtime/bertweet-sentiment-finetuned",
)
