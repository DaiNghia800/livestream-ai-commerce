"""
Process a comment event from the Realtime service.

This module contains ONLY the processing logic.
It does NOT know where the event came from (file, queue, API).
"""

from parse_intent import parse_purchase_intent

EXPECTED_EVENT_TYPE = "comment.created"
REQUIRED_FIELDS = [
    "schema_version",
    "event_id",
    "event_type",
    "occurred_at",
    "comment_id",
    "session_id",
    "customer_id",
    "content"
]


def _make_error(error_type: str, message: str) -> dict:
    """Return a standard error result."""
    return {"status": "error", "error_type": error_type, "message": message}


def process_comment_event(event: dict) -> dict:
    """
    Validate and process a single comment event.
    
    Args:
        event: A dict parsed from the comment.created contract.
        
    Returns:
        A dict with status, intent (if valid), and preserved event properties.
    """
    if not isinstance(event, dict):
        return _make_error("invalid_event", "Event is not a JSON object")

    if event.get("event_type") != EXPECTED_EVENT_TYPE:
        return _make_error(
            "wrong_event_type",
            f"Expected '{EXPECTED_EVENT_TYPE}', got '{event.get('event_type')}'",
        )

    for field in REQUIRED_FIELDS:
        if field not in event:
            return _make_error("missing_field", f"Missing '{field}' field")

    # Strict type check for schema_version (bool is a subclass of int in Python, so type() is safer)
    if type(event["schema_version"]) is not int:
        return _make_error("invalid_type", "'schema_version' must be strictly an integer")
    if event["schema_version"] != 1:
        return _make_error("unsupported_schema", "Only schema_version 1 is supported")

    id_fields = ["event_id", "comment_id", "session_id", "customer_id"]
    for f in id_fields:
        val = event[f]
        if not isinstance(val, str) or not val.strip():
            return _make_error("invalid_type", f"'{f}' must be a non-empty string")

    # Validate occurred_at is a valid ISO 8601 string with timezone
    occurred_at_str = event["occurred_at"]
    if not isinstance(occurred_at_str, str):
        return _make_error("invalid_type", "'occurred_at' must be a string")
    
    try:
        from datetime import datetime
        dt = datetime.fromisoformat(occurred_at_str.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            return _make_error("invalid_format", "'occurred_at' must include timezone information")
    except ValueError:
        return _make_error("invalid_format", "'occurred_at' is not a valid ISO 8601 timestamp")

    if not isinstance(event["content"], str):
        return _make_error("invalid_type", "'content' is not a string")

    content = event["content"].strip()
    if content == "":
        return _make_error("empty_content", "Empty comment")

    # Validation passed -> parse intent
    intent = parse_purchase_intent(content)

    return {
        "status": "ok",
        "event_id": event["event_id"],
        "comment_id": event["comment_id"],
        "session_id": event["session_id"],
        "customer_id": event["customer_id"],
        "content": content,
        "intent": intent,
        "message": f"Processed: {content}",
    }
