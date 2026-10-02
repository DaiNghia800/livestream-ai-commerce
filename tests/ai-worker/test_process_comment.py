"""
Tests for process_comment.process_comment_event()

Test strategy:
  - VALID EVENT: full happy path → status "ok" with intent
  - INVALID EVENTS: each validation rule triggers a specific error reason

Each test name follows: test_<what>_<condition>_<expected>
"""

import pytest
from process_comment import process_comment_event


# ── Helpers ──────────────────────────────────────────────────

def _make_valid_event(**overrides) -> dict:
    """Build a valid comment event, with optional field overrides."""
    base = {
        "schema_version": 1,
        "event_id": "11111111-1111-4111-8111-111111111111",
        "event_type": "comment.created",
        "occurred_at": "2026-10-01T03:00:00Z",
        "comment_id": "22222222-2222-4222-8222-222222222222",
        "session_id": "33333333-3333-4333-8333-333333333333",
        "customer_id": "44444444-4444-4444-8444-444444444444",
        "content": "Chốt A12 màu đen size M, 2 cái",
    }
    base.update(overrides)
    return base


# ── Happy Path ───────────────────────────────────────────────

class TestValidEvent:
    """Tests for valid events that should pass all validation."""

    def test_valid_event_returns_ok(self):
        event = _make_valid_event()
        result = process_comment_event(event)
        assert result["status"] == "ok"

    def test_valid_event_contains_content(self):
        event = _make_valid_event()
        result = process_comment_event(event)
        assert result["content"] == "Chốt A12 màu đen size M, 2 cái"

    def test_valid_event_contains_intent(self):
        event = _make_valid_event()
        result = process_comment_event(event)
        assert "intent" in result
        assert result["intent"]["has_intent"] is True

    def test_valid_event_passes_through_ids(self):
        event = _make_valid_event()
        result = process_comment_event(event)
        assert result["session_id"] == event["session_id"]
        assert result["customer_id"] == event["customer_id"]
        assert result["comment_id"] == event["comment_id"]


# ── Event Type Validation ────────────────────────────────────

class TestEventTypeValidation:
    """Tests for event_type checking."""

    def test_wrong_event_type_returns_error(self):
        event = _make_valid_event(event_type="order.completed")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["reason"] == "wrong_event_type"

    def test_missing_event_type_returns_error(self):
        event = _make_valid_event()
        del event["event_type"]
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["reason"] == "wrong_event_type"


# ── Required Fields Validation ───────────────────────────────

class TestRequiredFields:
    """Tests for missing required fields."""

    @pytest.mark.parametrize("field", [
        "comment_id",
        "session_id",
        "customer_id",
        "content",
    ])
    def test_missing_required_field_returns_error(self, field):
        event = _make_valid_event()
        del event[field]
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["reason"] == "missing_field"
        assert field in result["message"]


# ── Content Validation ───────────────────────────────────────

class TestContentValidation:
    """Tests for content field type and value checking."""

    def test_content_not_string_returns_error(self):
        event = _make_valid_event(content=12345)
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["reason"] == "invalid_type"

    def test_content_null_returns_error(self):
        event = _make_valid_event(content=None)
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["reason"] == "invalid_type"

    def test_empty_content_returns_error(self):
        event = _make_valid_event(content="")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["reason"] == "empty_content"

    def test_whitespace_only_content_returns_error(self):
        event = _make_valid_event(content="   \t\n  ")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["reason"] == "empty_content"

    def test_content_is_stripped(self):
        event = _make_valid_event(content="  Chốt A12  ")
        result = process_comment_event(event)
        assert result["status"] == "ok"
        assert result["content"] == "Chốt A12"


# ── Edge Cases ───────────────────────────────────────────────

class TestEdgeCases:
    """Tests for unusual but possible inputs."""

    def test_event_is_not_dict_returns_error(self):
        result = process_comment_event("not a dict")
        assert result["status"] == "error"
        assert result["reason"] == "invalid_event"

    def test_event_is_list_returns_error(self):
        result = process_comment_event([1, 2, 3])
        assert result["status"] == "error"
        assert result["reason"] == "invalid_event"

    def test_non_purchase_comment_has_no_intent(self):
        event = _make_valid_event(content="Đẹp quá chị ơi")
        result = process_comment_event(event)
        assert result["status"] == "ok"
        assert result["intent"]["has_intent"] is False
