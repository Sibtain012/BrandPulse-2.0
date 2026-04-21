"""
BrandPulse Clean – Main Entry Point
===================================
CLI entry point invoked by the MERN backend (routes/pipeline.js).
Usage: python main.py <keyword> <request_id> [platform] [mode]
"""

import sys
from pipeline.orchestrator import run_pipeline

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python main.py <keyword> <request_id> [platform] [mode]")
        sys.exit(1)

    keyword = sys.argv[1]
    request_id = sys.argv[2]
    platform = sys.argv[3] if len(sys.argv) > 3 else "reddit"
    mode = sys.argv[4] if len(sys.argv) > 4 else "sentiment"

    try:
        run_pipeline(keyword, request_id, platform, mode)
        sys.exit(0)
    except Exception as e:
        print(f"Pipeline failed: {e}")
        sys.exit(1)
