"""Process SQS batches offline and report failed records without external calls."""

import json
import logging
import re
import time

from process_comment import process_comment_event


logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_DECISIONS = {"purchase_candidate", "needs_clarification", "no_purchase"}
_INPUT_ERRORS = {
    "invalid_event", "wrong_event_type", "missing_field", "invalid_type",
    "unsupported_schema", "invalid_format", "empty_content",
}
_TRANSIENT_ERRORS = {"ai_timeout", "ai_network", "ai_rate_limit", "ai_transient"}
_TECHNICAL_ERRORS = {"ai_authentication", "ai_configuration", "ai_invalid_response"}
_ERROR_TYPES = _INPUT_ERRORS | _TRANSIENT_ERRORS | _TECHNICAL_ERRORS
_LOG_ID = re.compile(r"[A-Za-z0-9_.:-]{1,128}")


def _safe_id(value):
    """Keep bounded opaque IDs; redact other values without changing processing."""
    return value if isinstance(value, str) and _LOG_ID.fullmatch(value) else None


def _failure_kind(error_type):
    """Classify diagnostics only; do not add processor error types or retry loops."""
    if error_type in _INPUT_ERRORS:
        return "invalid_input"
    if error_type in _TRANSIENT_ERRORS:
        return "transient"
    if error_type in _TECHNICAL_ERRORS:
        return "technical"
    return "unexpected"


def _reject_constant(value):
    """Reject NaN and Infinity, which are not JSON values."""
    raise ValueError("Invalid JSON constant")


def handler(event, context):
    """Return SQS partial failures; malformed acknowledgment metadata fails the batch."""
    if not isinstance(event, dict) or not isinstance(event.get("Records"), list):
        raise ValueError("Expected an SQS Records list")

    records = event["Records"]
    # Validate all acknowledgment IDs before processing any record.
    for record in records:
        if (not isinstance(record, dict)
                or not isinstance(record.get("messageId"), str)
                or not record["messageId"].strip()):
            raise ValueError("Every SQS record must have a non-empty messageId")

    failures = []
    for record in records:
        started = time.monotonic()
        comment = None
        decision = error_type = failure_kind = None
        try:
            if "body" not in record:
                error_type = "missing_field"
            elif not isinstance(record["body"], str):
                error_type = "invalid_type"
            else:
                try:
                    comment = json.loads(record["body"], parse_constant=_reject_constant)
                except (ValueError, RecursionError):
                    error_type = "invalid_format"
                else:
                    result = process_comment_event(comment, use_ai=False)
                    if result["status"] == "error":
                        candidate = result.get("error_type")
                        error_type = (candidate if isinstance(candidate, str)
                                      and candidate in _ERROR_TYPES else None)
                        failure_kind = _failure_kind(error_type)
                    elif result["status"] == "ok":
                        decision = result["intent"]["decision"]
                        if decision not in _DECISIONS:
                            raise ValueError("Unexpected processor decision")
                    else:
                        raise ValueError("Unexpected processor status")
            if error_type is not None:
                failure_kind = _failure_kind(error_type)
        except Exception:
            # The batch boundary reports bugs as failures without exposing exception data.
            decision = error_type = None
            failure_kind = "unexpected"

        correlation = comment if isinstance(comment, dict) else {}
        logger.info(json.dumps({
            "event_id": _safe_id(correlation.get("event_id")),
            "comment_id": _safe_id(correlation.get("comment_id")),
            "sqs_message_id": _safe_id(record["messageId"]),
            "decision": decision,
            "latency_ms": round((time.monotonic() - started) * 1000, 3),
            "error_type": error_type,
            "failure_kind": failure_kind,
        }))
        if failure_kind is not None:
            failures.append({"itemIdentifier": record["messageId"]})

    return {"batchItemFailures": failures}
