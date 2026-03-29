"""
BrandPulse Clean – Structured Logging
=======================================
Drop-in replacement for the scattered print() calls across ETL_2/*.py.

Uses Python's built-in ``logging`` module only — zero third-party deps.

Prefix format matches the original print statements:
    [BRONZE]        – bronze ingestion layer
    [SILVER]        – silver processing layer
    [GOLD]          – gold aggregation layer
    [ORCHESTRATOR]  – pipeline orchestrator

Usage:
    from utils.logging import get_logger
    logger = get_logger("BRONZE")
    logger.info("Ingesting keyword: %s", keyword)
    # output → 2026-03-29 17:51:38 [BRONZE] INFO: Ingesting keyword: tesla
"""

import logging
import sys


# ---------------------------------------------------------------------------
# Shared formatter — mirrors original prefix style
# ---------------------------------------------------------------------------
_LOG_FORMAT = "%(asctime)s [%(name)s] %(levelname)s: %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Track already-configured loggers to avoid duplicate handlers
_configured_loggers: set = set()


def get_logger(layer: str) -> logging.Logger:
    """
    Return a named logger for the given pipeline layer.

    Parameters
    ----------
    layer : str
        One of "BRONZE", "SILVER", "GOLD", "ORCHESTRATOR" (or any custom
        string for future layers).

    Returns
    -------
    logging.Logger
        A logger that writes to stderr with the prefix format:
        ``2026-03-29 17:51:38 [BRONZE] INFO: message``
    """
    logger = logging.getLogger(layer)

    if layer not in _configured_loggers:
        logger.setLevel(logging.DEBUG)

        handler = logging.StreamHandler(sys.stderr)
        handler.setLevel(logging.DEBUG)
        handler.setFormatter(
            logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT)
        )

        logger.addHandler(handler)
        logger.propagate = False  # Don't bubble to root logger
        _configured_loggers.add(layer)

    return logger
