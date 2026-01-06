import sys
import os
import psycopg2
from dotenv import load_dotenv

# Import your layer logic
from bronze_reddit_ingest import ingest_keyword
from silver_layer import run_silver
from gold_layer import run_gold_etl

# Load environment variables for DB connection
load_dotenv()
PG_DSN = os.getenv("POSTGRES_DSN")

# CHANGE 1: Use requestId instead of keyword for updates
def update_status_by_id(request_id, status):
    """Signals the current state to the MERN backend using the Request ID."""
    try:
        conn = psycopg2.connect(PG_DSN)
        with conn.cursor() as cur:
            # We use global_keyword_id to ensure we update the specific user request
            cur.execute(
                "UPDATE global_keywords SET status = %s, last_run_at = NOW() WHERE global_keyword_id = %s",
                (status, request_id)
            )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[ORCHESTRATOR ERROR]: Failed to update status to {status} for ID {request_id}: {e}")


# CHANGE 2: Accept requestId as an argument
def run_pipeline(keyword, request_id):
    print(f"--- STARTING PIPELINE FOR: {keyword} (Request ID: {request_id}) ---")

    try:
        # 1. BRONZE: Fetch from Reddit
        print("[STEP 1/3] Ingesting raw data into MongoDB...")
        ingest_keyword(keyword, request_id)

        # 2. SILVER: Analyze with RoBERTa AI
        print("[STEP 2/3] Cleaning text and running sentiment analysis...")
        run_silver(request_id)

        # 3. GOLD: Aggregate into Fact Tables
        print("[STEP 3/3] Aggregating results for the Dashboard...")
        run_gold_etl(keyword, request_id)

        # SUCCESS SIGNAL: Updates the specific request record to COMPLETED
        update_status_by_id(request_id, 'COMPLETED')
        print(f"--- PIPELINE COMPLETED SUCCESSFULLY FOR: {keyword} ---")

    except Exception as e:
        # FAILURE SIGNAL: Updates the specific request record to FAILED
        print(f"--- PIPELINE FAILED AT ERROR: {str(e)} ---")
        update_status_by_id(request_id, 'FAILED')
        # Exit with error code so Node.js pipeline.js catches it immediately
        sys.exit(1)


if __name__ == "__main__":
    import sys
    # Node.js passes [keyword, requestId]
    if len(sys.argv) > 2:
        keyword = sys.argv[1]
        request_id = sys.argv[2]
        run_pipeline(keyword, request_id)
    else:
        print("Error: Missing arguments")
        sys.exit(1)