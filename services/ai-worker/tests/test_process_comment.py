"""
Tests for process_comment.process_comment_event()

Test strategy:
  - VALID EVENT: full happy path → status "ok" with intent
  - INVALID EVENTS: each validation rule triggers a specific error reason
  - ALL TESTS use a mocked parser to avoid AI calls and isolate process logic.
"""

import pytest
from unittest.mock import patch

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


@pytest.fixture
def mock_parser():
    """Mock parse_purchase_intent for the entire file."""
    with patch("process_comment.parse_purchase_intent") as mock:
        # Default mock return value for valid event
        mock.return_value = {
            "has_intent": True,
            "product_code": "A12",
            "quantity": 2
        }
        yield mock


# ── Happy Path ───────────────────────────────────────────────

class TestValidEvent:
    """Tests for valid events that should pass all validation."""

    def test_valid_event_returns_ok(self, mock_parser):
        event = _make_valid_event()
        result = process_comment_event(event)
        assert result["status"] == "ok"
        mock_parser.assert_called_once_with("Chốt A12 màu đen size M, 2 cái")

    def test_valid_event_contains_content(self, mock_parser):
        event = _make_valid_event()
        result = process_comment_event(event)
        assert result["content"] == "Chốt A12 màu đen size M, 2 cái"

    def test_valid_event_contains_intent(self, mock_parser):
        # The intent should strictly match what the mock returns
        event = _make_valid_event()
        result = process_comment_event(event)
        assert "intent" in result
        assert result["intent"]["has_intent"] is True
        assert result["intent"]["quantity"] == 2

    def test_valid_event_passes_through_ids(self, mock_parser):
        event = _make_valid_event()
        result = process_comment_event(event)
        assert result["event_id"] == event["event_id"]
        assert result["session_id"] == event["session_id"]
        assert result["customer_id"] == event["customer_id"]
        assert result["comment_id"] == event["comment_id"]


# ── Event Type Validation ────────────────────────────────────

class TestEventTypeValidation:
    """Tests for event_type checking."""

    def test_wrong_event_type_returns_error(self, mock_parser):
        event = _make_valid_event(event_type="order.completed")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "wrong_event_type"
        mock_parser.assert_not_called()

    def test_missing_event_type_returns_error(self, mock_parser):
        event = _make_valid_event()
        del event["event_type"]
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "wrong_event_type"
        mock_parser.assert_not_called()


# ── Required Fields Validation ───────────────────────────────

class TestRequiredFields:
    """Tests for missing required fields."""

    @pytest.mark.parametrize("field", [
        "schema_version",
        "event_id",
        "occurred_at",
        "comment_id",
        "session_id",
        "customer_id",
        "content",
    ])
    def test_missing_required_field_returns_error(self, mock_parser, field):
        event = _make_valid_event()
        del event[field]
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "missing_field"
        assert field in result["message"]
        mock_parser.assert_not_called()


# ── Content Validation ───────────────────────────────────────

class TestContentValidation:
    """Tests for content field type and value checking."""

    def test_content_not_string_returns_error(self, mock_parser):
        event = _make_valid_event(content=12345)
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_type"
        mock_parser.assert_not_called()

    def test_content_null_returns_error(self, mock_parser):
        event = _make_valid_event(content=None)
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_type"
        mock_parser.assert_not_called()

    def test_empty_content_returns_error(self, mock_parser):
        event = _make_valid_event(content="")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "empty_content"
        mock_parser.assert_not_called()

    def test_whitespace_only_content_returns_error(self, mock_parser):
        event = _make_valid_event(content="   \t\n  ")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "empty_content"
        mock_parser.assert_not_called()

    def test_content_is_stripped(self, mock_parser):
        mock_parser.return_value = {"has_intent": True, "product_code": "A12", "quantity": None}
        event = _make_valid_event(content="  Chốt A12  ")
        result = process_comment_event(event)
        assert result["status"] == "ok"
        assert result["content"] == "Chốt A12"
        mock_parser.assert_called_once_with("Chốt A12")
        assert result["intent"]["quantity"] is None


class TestIdTypeValidation:
    """Tests for ID fields strictly requiring non-empty strings."""

    @pytest.mark.parametrize("field", ["event_id", "comment_id", "session_id", "customer_id"])
    @pytest.mark.parametrize("invalid_val", [None, 42, [], {}])
    def test_invalid_id_type_returns_error(self, mock_parser, field, invalid_val):
        event = _make_valid_event(**{field: invalid_val})
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_type"
        mock_parser.assert_not_called()

    @pytest.mark.parametrize("field", ["event_id", "comment_id", "session_id", "customer_id"])
    def test_empty_string_id_returns_error(self, mock_parser, field):
        event = _make_valid_event(**{field: "   "})
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_type"
        mock_parser.assert_not_called()


class TestSchemaVersionValidation:
    """Tests for schema_version strictly requiring int 1."""

    def test_unsupported_schema_version(self, mock_parser):
        event = _make_valid_event(schema_version=2)
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "unsupported_schema"
        mock_parser.assert_not_called()

    def test_bool_true_fails_schema_version(self, mock_parser):
        # bool is a subclass of int, so we need strict type checking
        event = _make_valid_event(schema_version=True)
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_type"
        assert "strictly an integer" in result["message"]
        mock_parser.assert_not_called()


class TestOccurredAtValidation:
    """Tests for occurred_at strictly requiring ISO 8601 with timezone."""

    def test_invalid_type_returns_error(self, mock_parser):
        event = _make_valid_event(occurred_at=1234567890)
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_type"
        mock_parser.assert_not_called()

    def test_invalid_format_returns_error(self, mock_parser):
        event = _make_valid_event(occurred_at="invalid-date")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_format"
        mock_parser.assert_not_called()

    def test_missing_timezone_returns_error(self, mock_parser):
        event = _make_valid_event(occurred_at="2026-10-01T03:00:00")
        result = process_comment_event(event)
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_format"
        assert "timezone" in result["message"]
        mock_parser.assert_not_called()

    def test_z_timezone_passes(self, mock_parser):
        event = _make_valid_event(occurred_at="2026-10-01T03:00:00Z")
        result = process_comment_event(event)
        assert result["status"] == "ok"
        mock_parser.assert_called_once()

    def test_offset_timezone_passes(self, mock_parser):
        event = _make_valid_event(occurred_at="2026-10-01T10:00:00+07:00")
        result = process_comment_event(event)
        assert result["status"] == "ok"
        mock_parser.assert_called_once()


# ── Edge Cases ───────────────────────────────────────────────

class TestEdgeCases:
    """Tests for unusual but possible inputs."""

    def test_event_is_not_dict_returns_error(self, mock_parser):
        result = process_comment_event("not a dict")  # type: ignore
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_event"
        mock_parser.assert_not_called()

    def test_event_is_list_returns_error(self, mock_parser):
        result = process_comment_event([1, 2, 3])  # type: ignore
        assert result["status"] == "error"
        assert result["error_type"] == "invalid_event"
        mock_parser.assert_not_called()

    def test_non_purchase_comment_has_no_intent(self, mock_parser):
        # We only check if process forwards parser's output correctly
        mock_parser.return_value = {"has_intent": False}
        event = _make_valid_event(content="Đẹp quá chị ơi")
        result = process_comment_event(event)
        assert result["status"] == "ok"
        assert result["intent"]["has_intent"] is False
        mock_parser.assert_called_once_with("Đẹp quá chị ơi")

class TestAIErrorHandling:
    """Tests that process_comment safely catches and structures AI errors."""

    def test_ai_parsing_error_caught_and_structured(self, mock_parser):
        from ai_errors import AIParsingError
        mock_parser.side_effect = AIParsingError("ai_transient", "Gemini timeout")
        event = _make_valid_event(content="Chốt A12")
        result = process_comment_event(event)

        assert result["status"] == "error"
        assert result["error_type"] == "ai_transient"
        assert "Gemini timeout" in result["message"]
        # Ensure traceability IDs are preserved
        assert result["event_id"] == event["event_id"]
        assert result["comment_id"] == event["comment_id"]

    def test_programming_error_bubbles_up(self, mock_parser):
        # A generic exception like ValueError should crash the process, not be caught as an AI error
        mock_parser.side_effect = ValueError("Some programming error")
        event = _make_valid_event(content="Chốt A12")
        
        with pytest.raises(ValueError, match="Some programming error"):
            process_comment_event(event)
