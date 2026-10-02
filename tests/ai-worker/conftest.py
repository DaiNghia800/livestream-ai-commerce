"""
conftest.py — Configure pytest to find AI Worker source modules.

This file adds 'services/ai-worker/' to Python's import path
so tests can import process_comment and parse_intent directly.
"""

import sys
from pathlib import Path

# Add the ai-worker source directory to sys.path
AI_WORKER_DIR = Path(__file__).resolve().parents[2] / "services" / "ai-worker"
sys.path.insert(0, str(AI_WORKER_DIR))
