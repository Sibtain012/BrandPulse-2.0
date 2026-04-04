"""
BrandPulse Clean – MongoDB Connections
=======================================
Provides a function to get MongoDB collection handles on demand.

Source: ETL_2/bronze_reddit_ingest.py lines 26-31

CRITICAL ARCHITECTURAL FIX:
    In the original code, MongoClient was instantiated at MODULE LEVEL:
        mongo = MongoClient(MONGO_URI)     # ← runs on import!
    This means any `import bronze_reddit_ingest` immediately opens a
    persistent connection to MongoDB, even if the module is imported
    for unit testing or introspection.

    In this clean version, connections are created INSIDE functions
    and returned to the caller. The caller controls the lifecycle.

Database name: "BrandPulse_1"  (preserved exactly)
Collection names:
    - "bronze_raw_reddit_data"   → bronze_col
    - "bronze_ingestion_jobs"    → jobs_col
    - "bronze_errors"            → errors_col
"""

from pymongo import MongoClient

from config.settings import MONGO_URI


# ---------------------------------------------------------------------------
# Singleton-style connection (lazy, created on first call)
# ---------------------------------------------------------------------------
_client = None


def _get_client():
    """Return a shared MongoClient instance, created on first call."""
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client


def get_mongo_collections():
    """
    Return the three Bronze-layer MongoDB collections.

    Returns
    -------
    tuple : (bronze_col, jobs_col, errors_col)
        bronze_col  – pymongo.collection.Collection for bronze_raw_reddit_data
        jobs_col    – pymongo.collection.Collection for bronze_ingestion_jobs
        errors_col  – pymongo.collection.Collection for bronze_errors

    Example
    -------
        from database.mongo import get_mongo_collections
        bronze_col, jobs_col, errors_col = get_mongo_collections()
    """
    client = _get_client()
    db = client["BrandPulse_1"]

    bronze_col = db["bronze_raw_reddit_data"]
    jobs_col = db["bronze_ingestion_jobs"]
    errors_col = db["bronze_errors"]

    return bronze_col, jobs_col, errors_col


