"""
conftest.py — Configure pytest to find AI Worker source modules.

This file adds 'services/ai-worker/' to Python's import path
so tests can import process_comment and parse_intent directly.
"""

import sys
from pathlib import Path

# Add the ai-worker source directory to sys.path
AI_WORKER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_WORKER_DIR))

import pytest
from unittest.mock import patch


def pytest_configure(config):
    # Block dotenv before test-module imports can load gemini_client.
    guard = patch("dotenv.load_dotenv", return_value=False)
    guard.start()
    config.add_cleanup(guard.stop)


@pytest.fixture(autouse=True)
def offline_only(monkeypatch):
    """Fail on accidental network access or real waiting in every worker test."""
    def blocked(*args, **kwargs):
        raise AssertionError("Tests must mock network access and sleep")

    monkeypatch.setattr("socket.socket.connect", blocked)
    monkeypatch.setattr("socket.create_connection", blocked)
    monkeypatch.setattr("time.sleep", blocked)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
