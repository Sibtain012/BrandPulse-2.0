"""
Co-occurrence runner (spawned by routes/cooccurrence.js).

Usage:
    python run_cooccurrence.py <request_id> <keyword> <platform>

  platform = reddit | twitter

Reads cleaned text from the silver tables for the given request_id, computes
PMI co-occurrence against <keyword>, and UPSERTs rows into
public.fact_keyword_cooccurrence.

Self-contained DB connection (reads DB_* from .env via os.environ) so it does
NOT depend on config.settings import paths — can be spawned from any cwd.

Prints a JSON line to stdout: {"success": true, "tokensFound": N}
"""

import json
import os
import sys

import psycopg2

# Allow importing sibling modules regardless of cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cooccurrence_counter import analyze  # noqa: E402

# Load .env (project root is two levels up from this file).
try:
    from dotenv import load_dotenv

    _root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    load_dotenv(os.path.join(_root, ".env"))
except Exception:
    pass  # env may already be present in the spawned process


def get_connection():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


def fetch_documents(cur, request_id, platform):
    """Return list[str] of cleaned documents for the analysis."""
    docs = []
    if platform == "twitter":
        cur.execute(
            "SELECT text_clean FROM silver_twitter_tweets WHERE global_keyword_id = %s",
            (request_id,),
        )
        docs += [r[0] for r in cur.fetchall() if r[0]]
    else:  # reddit
        cur.execute(
            "SELECT title_clean, body_clean FROM silver_reddit_posts WHERE global_keyword_id = %s",
            (request_id,),
        )
        for title, body in cur.fetchall():
            docs.append(" ".join(p for p in (title, body) if p))
        cur.execute(
            """
            SELECT c.comment_body_clean
            FROM silver_reddit_comments c
            JOIN silver_reddit_posts p ON c.silver_post_id = p.silver_post_id
            WHERE p.global_keyword_id = %s
            """,
            (request_id,),
        )
        docs += [r[0] for r in cur.fetchall() if r[0]]
    return docs


UPSERT_SQL = """
INSERT INTO fact_keyword_cooccurrence
  (request_id, platform_id, primary_keyword, cooccur_token,
   cooccurrence_count, pmi_score,
   total_documents, docs_with_primary, docs_with_token, docs_with_both)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (request_id, primary_keyword, cooccur_token)
DO UPDATE SET
  cooccurrence_count = EXCLUDED.cooccurrence_count,
  pmi_score          = EXCLUDED.pmi_score,
  total_documents    = EXCLUDED.total_documents,
  docs_with_primary  = EXCLUDED.docs_with_primary,
  docs_with_token    = EXCLUDED.docs_with_token,
  docs_with_both     = EXCLUDED.docs_with_both,
  computed_at        = CURRENT_TIMESTAMP
"""


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "usage: run_cooccurrence.py <request_id> <keyword> <platform>"}))
        sys.exit(1)

    request_id = int(sys.argv[1])
    keyword = sys.argv[2]
    platform = sys.argv[3].lower()
    platform_id = 2 if platform == "twitter" else 1

    conn = get_connection()
    try:
        with conn.cursor() as cur:
            documents = fetch_documents(cur, request_id, platform)
            results = analyze(documents, keyword)

            primary = keyword.lower().strip()
            for token, d in results.items():
                cur.execute(
                    UPSERT_SQL,
                    (
                        request_id,
                        platform_id,
                        primary,
                        token,
                        d["count"],
                        d["pmi_score"],
                        d["total_documents"],
                        d["docs_with_primary"],
                        d["docs_with_token"],
                        d["docs_with_both"],
                    ),
                )
        conn.commit()
        print(json.dumps({
            "success": True,
            "tokensFound": len(results),
            "documents": len(documents),
        }))
    except Exception as e:  # noqa: BLE001
        conn.rollback()
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
