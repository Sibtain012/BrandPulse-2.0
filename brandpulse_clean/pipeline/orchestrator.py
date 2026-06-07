"""
BrandPulse Clean – Pipeline Orchestrator
==========================================
Coordinates the three ETL stages (Bronze → Silver → Gold) for any
registered platform using the platform registry.

Source: ETL_2/brandpulse_master.py

ARCHITECTURAL FIXES:
    1. Module-level psycopg2.connect() removed from update_status_by_id().
       Now calls get_pg_connection() from database/postgres.py.
    2. All Twitter imports and if/else platform branching removed.
       Replaced with registry-based dispatch via get_pipeline().
    3. Hardcoded status strings ('COMPLETED', 'FAILED') replaced with
       PipelineStatus enum values.

COMPATIBILITY NOTE:
    update_status_by_id() is preserved exactly as written in the original.
    It updates global_keywords.status and last_run_at, which is how the
    MERN backend (routes/pipeline.js) checks pipeline progress.
    run_pipeline() signature is preserved: (keyword, request_id, platform='reddit')
"""

from database.postgres import get_pg_connection
from models.enums import PipelineStatus
from pipeline.registry import get_pipeline


def update_status_by_id(request_id, status):
    """Signals the current state to the MERN backend using the Request ID."""
    try:
        conn = get_pg_connection()
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


def run_pipeline(keyword, request_id, platform='reddit', mode='sentiment'):
    """
    Main pipeline orchestrator. Executes Bronze → Silver → Gold
    for the given keyword and platform using the registry pattern.

    Parameters
    ----------
    keyword : str
        The search term to process.
    request_id : str or int
        The global_keyword_id from the MERN backend.
    platform : str
        Target platform (default: 'reddit').
    mode : str
        'sentiment' (default) or 'intent'. Controls which model runs
        and which silver/gold tables receive the output.
    """
    print(f"--- STARTING PIPELINE FOR: {keyword} (Request ID: {request_id}, Platform: {platform}, Mode: {mode}) ---")

    try:
        pipeline = get_pipeline(platform)

        # 1. BRONZE: Fetch from platform (mode-agnostic — raw data is raw data)
        print(f"[STEP 1/3] Ingesting raw {platform} data into MongoDB...")
        pipeline.ingest(keyword, request_id)

        # 2. SILVER: Classify with AI model (mode-aware)
        print(f"[STEP 2/3] Cleaning text and running {mode} analysis for {platform}...")
        pipeline.process(request_id, mode=mode)

        # 3. GOLD: Aggregate into Fact Tables (mode-aware)
        print("[STEP 3/3] Aggregating results for the Dashboard...")
        pipeline.aggregate(keyword, request_id, mode=mode)

        # SUCCESS SIGNAL: Updates the specific request record to COMPLETED
        update_status_by_id(request_id, PipelineStatus.COMPLETED.value)
        print(f"--- PIPELINE COMPLETED SUCCESSFULLY FOR: {keyword} ({platform}, {mode}) ---")

    except Exception as e:
        # FAILURE SIGNAL: Updates the specific request record to FAILED
        print(f"--- PIPELINE FAILED AT ERROR: {str(e)} ---")
        update_status_by_id(request_id, PipelineStatus.FAILED.value)
        raise e
