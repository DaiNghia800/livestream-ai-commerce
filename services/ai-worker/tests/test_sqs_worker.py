"""SQS adapter tests with a fake client; no AWS or network access."""

import json
from unittest.mock import Mock, patch

from sqs_worker import build_result, run_once


EVENT = {
    "schema_version": 1,
    "event_id": "11111111-1111-4111-8111-111111111111",
    "event_type": "comment.created",
    "occurred_at": "2026-10-01T03:00:00Z",
    "comment_id": "22222222-2222-4222-8222-222222222222",
    "session_id": "33333333-3333-4333-8333-333333333333",
    "customer_id": "44444444-4444-4444-8444-444444444444",
    "content": "Mua A12 2 cái",
}


def test_build_result_preserves_ids_and_intent():
    with patch("sqs_worker.process_comment_event", return_value={
        "status": "ok", "intent": {"decision": "purchase_candidate"}
    }):
        result = build_result(EVENT)
    assert result["event_id"] == EVENT["event_id"]
    assert result["comment_id"] == EVENT["comment_id"]
    assert result["event_type"] == "comment.analyzed"
    assert result["intent"]["decision"] == "purchase_candidate"


def test_input_is_deleted_only_after_result_send():
    sqs = Mock()
    sqs.receive_message.return_value = {"Messages": [{
        "Body": json.dumps(EVENT), "ReceiptHandle": "receipt-1"
    }]}
    with patch("sqs_worker.build_result", return_value={"status": "ok"}):
        assert run_once(sqs, "input", "result") == 1
    assert sqs.send_message.call_count == 1
    assert sqs.delete_message.call_count == 1
    assert sqs.send_message.call_args.kwargs["QueueUrl"] == "result"


def test_failed_result_send_keeps_input_for_retry():
    sqs = Mock()
    sqs.receive_message.return_value = {"Messages": [{
        "Body": json.dumps(EVENT), "ReceiptHandle": "receipt-1"
    }]}
    sqs.send_message.side_effect = RuntimeError("offline")
    with patch("sqs_worker.build_result", return_value={"status": "ok"}):
        assert run_once(sqs, "input", "result") == 0
    sqs.delete_message.assert_not_called()
