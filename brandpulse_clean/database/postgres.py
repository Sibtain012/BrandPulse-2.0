"""
BrandPulse Clean – PostgreSQL Connection
==========================================
Provides a function to get a psycopg2 connection on demand.

Source: ETL_2/silver_layer.py lines 29-30
        ETL_2/bronze_reddit_ingest.py lines 33-34

CRITICAL ARCHITECTURAL FIX:
    In the original code, psycopg2.connect() was called at MODULE LEVEL:
        pg_conn = psycopg2.connect(POSTGRES_URI)   # ← runs on import!
        pg_conn.autocommit = False
    This means any `import silver_layer` immediately opens a persistent
    PostgreSQL connection, even in unit tests or CLI --help scenarios.

    In this clean version, the connection is created INSIDE a function
    and returned to the caller. The caller controls commit/rollback
    and closing the connection.
"""

import psycopg2

from config.settings import POSTGRES_DSN


def get_pg_connection(autocommit: bool = False):
    """
    Create and return a new psycopg2 connection.

    Parameters
    ----------
    autocommit : bool, optional
        If False (default), the connection operates in transactional mode
        matching the original silver_layer.py and bronze_reddit_ingest.py
        behaviour where pg_conn.autocommit = False.

    Returns
    -------
    psycopg2.extensions.connection
        A live PostgreSQL connection. Caller is responsible for
        calling conn.commit(), conn.rollback(), and conn.close().

    Raises
    ------
    RuntimeError
        If POSTGRES_DSN is not configured.

    Example
    -------
        from database.postgres import get_pg_connection
        conn = get_pg_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            conn.commit()
        finally:
            conn.close()
    """
    if not POSTGRES_DSN:
        raise RuntimeError(
            "POSTGRES_DSN is not set. "
            "Check your .env file or config/settings.py."
        )

    conn = psycopg2.connect(POSTGRES_DSN)
    conn.autocommit = autocommit
    return conn
