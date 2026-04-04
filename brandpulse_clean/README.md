# BrandPulse Clean ETL Pipeline

This repository contains the refactored, modular ETL architecture for the BrandPulse pipeline. It separates the execution stages into strict Bronze (Ingestion), Silver (Processing & ML), and Gold (Aggregation) layers.

## Overview

- **Modular Architecture:** Platform abstractions remove `if/else` branching. Adding Twitter is as simple as creating a `twitter_ingest.py` and adding it to the registry.
- **Lazy Database Loading:** Module-level connections caused premature connection attempts upon import. These have been migrated to context-aware `get_pg_connection()` and lazy `pymongo` loaders in `database/`.
- **Text Utilities Isolated:** Generic whitespace stripping and Hash generation are separated from Reddit-specific markdown handling (`utils/text_processing/`).

## Setup

1. Copy the example environment variables:
   ```bash
   cp .env.example .env
   ```
2. Fill in the keys in `.env`.
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

This Python module is spawned directly from the MERN backend (e.g. `routes/pipeline.js`). 

**Command:**
```bash
python main.py "keyword" requestId reddit
```

**Example:**
```bash
python main.py "tesla" 42 reddit
```

## Exit Codes
* **`0`**: Pipeline (Bronze -> Silver -> Gold) succeeded. Backend marks the job as `COMPLETED`.
* **`1`**: Pipeline failed. Exception was printed to stdout. Backend catches this and marks the job as `FAILED`.
