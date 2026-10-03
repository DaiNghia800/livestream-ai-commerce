"""
Process a comment event from the Realtime service.

This module contains ONLY the processing logic.
It does NOT know where the event came from (file, queue, API).
"""

from parse_intent import parse_purchase_intent

EXPECTED_EVENT_TYPE = "comment.created"
REQUIRED_FIELDS = ["event_type", "comment_id", "session_id", "customer_id", "content"]


def _make_error(reason: str, message: str) -> dict:
    """Return a standard error result."""
    return {"status": "error", "reason": reason, "message": message}


def process_comment_event(event: dict) -> dict:
    """
    Validate and process a single comment event.

    Args:
        event: A dict parsed from the comment.created contract.

    Returns:
        A dict with "status" ("ok" | "error"), "message",
        and "intent" (purchase intent) when status is "ok".
    """
    # --- Validate: must be a dict ---
    if not isinstance(event, dict):
        return _make_error("invalid_event", "Event is not a JSON object")

    # --- Validate: event_type must match ---
    if event.get("event_type") != EXPECTED_EVENT_TYPE:
        return _make_error(
            "wrong_event_type",
            f"Expected '{EXPECTED_EVENT_TYPE}', "
            f"got '{event.get('event_type')}'",
        )

    # --- Validate: required fields must exist ---
    for field in REQUIRED_FIELDS:
        if field not in event:
            return _make_error("missing_field", f"Missing '{field}' field")

    # --- Validate: 'content' must be a string ---
    if not isinstance(event["content"], str):
        return _make_error("invalid_type", "'content' is not a string")

    # --- Validate: 'content' must not be empty ---
    content = event["content"].strip()
    if content == "":
        return _make_error("empty_content", "Empty comment")

    # --- All checks passed → parse purchase intent ---
    intent = parse_purchase_intent(content)

    return {
        "status": "ok",
        "comment_id": event["comment_id"],
        "session_id": event["session_id"],
        "customer_id": event["customer_id"],
        "content": content,
        "intent": intent,
        "message": f"Processed: {content}",
    }
