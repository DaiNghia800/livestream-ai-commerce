"""Exercise the offline SQS boundary without AWS or Gemini."""

from copy import deepcopy
import importlib
import json
from unittest.mock import Mock

import pytest

from process_comment import process_comment_event


@pytest.fixture
def adapter():
    return importlib.import_module("lambda_handler")


def comment(content="Chốt A12 màu đen size M 2 cái", **overrides):
    event = {
        "schema_version": 1,
        "event_id": "11111111-1111-4111-8111-111111111111",
        "event_type": "comment.created",
        "occurred_at": "2026-10-20T08:00:00Z",
        "comment_id": "22222222-2222-4222-8222-222222222222",
        "session_id": "33333333-3333-4333-8333-333333333333",
        "customer_id": "44444444-4444-4444-8444-444444444444",
        "content": content,
    }
    return dict(event, **overrides)


def record(event=None, message_id="sqs-001"):
    return {"messageId": message_id, "eventSource": "aws:sqs",
            "body": json.dumps(event if event is not None else comment())}


def summaries(caplog):
    return [json.loads(entry.message) for entry in caplog.records
            if entry.name == "lambda_handler"]


@pytest.mark.parametrize("content,decision", [
    ("Chốt A12 màu đen size M 2 cái", "purchase_candidate"),
    ("Chốt A12 đỏ hoặc đen 2 cái", "needs_clarification"),
    ("Chốt A12 sl: 2..5 cái", "needs_clarification"),
    ("Chốt SP-LINEN-001 2 cái", "purchase_candidate"),
    ("Shop đẹp quá", "no_purchase"),
])
def test_business_outcomes_use_actual_processor_offline(
        adapter, monkeypatch, caplog, content, decision):
    event = comment(content)
    original = deepcopy(event)
    processor = Mock(wraps=process_comment_event)
    monkeypatch.setattr(adapter, "process_comment_event", processor)

    assert adapter.handler({"Records": [record(event)]}, None) == {"batchItemFailures": []}
    processor.assert_called_once_with(original, use_ai=False)
    assert event == original
    entry, = summaries(caplog)
    assert entry["decision"] == decision
    assert entry["event_id"] == original["event_id"]
    assert entry["comment_id"] == original["comment_id"]
    assert entry["error_type"] is None
    assert entry["failure_kind"] is None


def test_empty_batch_succeeds_without_processing(adapter, monkeypatch, caplog):
    processor = Mock()
    monkeypatch.setattr(adapter, "process_comment_event", processor)
    assert adapter.handler({"Records": []}, None) == {"batchItemFailures": []}
    processor.assert_not_called()
    assert summaries(caplog) == []


@pytest.mark.parametrize("envelope", [
    None, [], {}, {"Records": None}, {"Records": {}},
    {"Records": [None]}, {"Records": [{}]},
    {"Records": [{"messageId": ""}]},
    {"Records": [{"messageId": "  "}]},
    {"Records": [{"messageId": 123}]},
    {"Records": [record(), {"body": "PRIVATE-ENVELOPE"}]},
])
def test_invalid_envelope_fails_before_processing(adapter, monkeypatch, caplog, envelope):
    processor = Mock()
    monkeypatch.setattr(adapter, "process_comment_event", processor)
    with pytest.raises(ValueError) as error:
        adapter.handler(envelope, None)
    assert "PRIVATE-ENVELOPE" not in str(error.value)
    processor.assert_not_called()
    assert summaries(caplog) == []


@pytest.mark.parametrize("body,error_type", [
    ("{", "invalid_format"),
    ("NaN", "invalid_format"),
    ("[]", "invalid_event"),
    ("null", "invalid_event"),
    (None, "invalid_type"),
    ({"content": "PRIVATE-BODY"}, "invalid_type"),
])
def test_invalid_body_is_a_failed_record(adapter, caplog, body, error_type):
    item = record()
    item["body"] = body
    assert adapter.handler({"Records": [item]}, None) == {
        "batchItemFailures": [{"itemIdentifier": "sqs-001"}]}
    entry, = summaries(caplog)
    assert entry["error_type"] == error_type
    assert entry["failure_kind"] == "invalid_input"
    assert "PRIVATE-BODY" not in caplog.text


def test_missing_body_is_failed_without_fabricating_an_id(adapter, caplog):
    assert adapter.handler({"Records": [{"messageId": "actual-sqs-id"}]}, None) == {
        "batchItemFailures": [{"itemIdentifier": "actual-sqs-id"}]}
    assert summaries(caplog)[0]["error_type"] == "missing_field"


@pytest.mark.parametrize("error_type,failure_kind", [
    ("invalid_type", "invalid_input"),
    ("unsupported_schema", "invalid_input"),
    ("empty_content", "invalid_input"),
    ("ai_timeout", "transient"),
    ("ai_network", "transient"),
    ("ai_rate_limit", "transient"),
    ("ai_transient", "transient"),
    ("ai_authentication", "technical"),
    ("ai_configuration", "technical"),
    ("ai_invalid_response", "technical"),
])
def test_classified_errors_keep_existing_codes(
        adapter, monkeypatch, caplog, error_type, failure_kind):
    processor = Mock(return_value={"status": "error", "error_type": error_type,
                                   "message": "PRIVATE-EXCEPTION"})
    monkeypatch.setattr(adapter, "process_comment_event", processor)
    assert adapter.handler({"Records": [record()]}, None) == {
        "batchItemFailures": [{"itemIdentifier": "sqs-001"}]}
    entry, = summaries(caplog)
    assert entry["error_type"] == error_type
    assert entry["failure_kind"] == failure_kind
    assert "PRIVATE-EXCEPTION" not in caplog.text


def test_actual_invalid_event_retains_correlation_in_log(adapter, caplog):
    event = comment(schema_version=99)
    assert adapter.handler({"Records": [record(event)]}, None) == {
        "batchItemFailures": [{"itemIdentifier": "sqs-001"}]}
    entry, = summaries(caplog)
    assert entry["error_type"] == "unsupported_schema"
    assert entry["event_id"] == event["event_id"]
    assert entry["comment_id"] == event["comment_id"]


def test_mixed_batch_reports_only_failures_and_continues(adapter, monkeypatch, caplog):
    def process(event, *, use_ai):
        assert use_ai is False
        if event["event_id"] == "transient":
            return {"status": "error", "error_type": "ai_transient"}
        if event["event_id"] == "bug":
            raise RuntimeError("PRIVATE-PROGRAMMING-ERROR")
        return process_comment_event(event, use_ai=False)

    monkeypatch.setattr(adapter, "process_comment_event", process)
    bad_json = record(message_id="json-failure")
    bad_json["body"] = "{"
    items = [record(message_id="good-before"), bad_json,
             record(comment(event_id="transient"), "transient-failure"),
             record(comment(event_id="bug"), "unexpected-failure"),
             record(comment("Shop đẹp quá"), "good-after")]
    assert adapter.handler({"Records": items}, None) == {"batchItemFailures": [
        {"itemIdentifier": "json-failure"},
        {"itemIdentifier": "transient-failure"},
        {"itemIdentifier": "unexpected-failure"},
    ]}
    entries = summaries(caplog)
    assert len(entries) == 5
    assert entries[-1]["decision"] == "no_purchase"
    assert entries[3]["failure_kind"] == "unexpected"
    assert entries[3]["decision"] is None
    assert entries[3]["error_type"] is None
    assert "PRIVATE-PROGRAMMING-ERROR" not in caplog.text
    assert all(entry.exc_info is None for entry in caplog.records)


def test_logs_allowlist_metadata_and_fake_latency(adapter, monkeypatch, caplog):
    event = comment("PRIVATE-COMMENT", customer_id="PRIVATE-CUSTOMER")
    result = {"status": "ok", "intent": {"decision": "purchase_candidate",
              "raw": "PRIVATE-RAW"}, "message": "PRIVATE-MESSAGE",
              "content": "PRIVATE-CONTENT", "api_key": "PRIVATE-KEY"}
    monkeypatch.setattr(adapter, "process_comment_event", Mock(return_value=result))
    clock = iter([10.0, 10.125])
    monkeypatch.setattr(adapter.time, "monotonic", lambda: next(clock))
    adapter.handler({"Records": [record(event)]}, None)
    entry, = summaries(caplog)
    assert set(entry) == {"event_id", "comment_id", "sqs_message_id", "decision",
                          "latency_ms", "error_type", "failure_kind"}
    assert entry["latency_ms"] == 125.0
    assert "PRIVATE-" not in caplog.text


@pytest.mark.parametrize("unsafe_id", ["person@example.test", "id\ninjected", "x" * 129,
                                      {"secret": "PRIVATE-ID"}])
def test_unsafe_log_identifiers_are_redacted(adapter, monkeypatch, caplog, unsafe_id):
    monkeypatch.setattr(adapter, "process_comment_event", Mock(return_value={
        "status": "error", "error_type": "invalid_type"}))
    adapter.handler({"Records": [record(comment(event_id=unsafe_id))]}, None)
    assert summaries(caplog)[0]["event_id"] is None
    assert "PRIVATE-ID" not in caplog.text


def test_unknown_error_labels_are_not_logged_as_public_codes(adapter, monkeypatch, caplog):
    monkeypatch.setattr(adapter, "process_comment_event", Mock(return_value={
        "status": "error", "error_type": "PRIVATE-UNKNOWN-ERROR"}))
    assert adapter.handler({"Records": [record()]}, None)["batchItemFailures"]
    entry, = summaries(caplog)
    assert entry["error_type"] is None
    assert entry["failure_kind"] == "unexpected"
    assert "PRIVATE-UNKNOWN-ERROR" not in caplog.text


def test_duplicate_delivery_has_only_repeatable_processing(adapter, monkeypatch, caplog):
    event = comment()
    item = record(event)
    original = deepcopy(item)
    processor = Mock(wraps=process_comment_event)
    monkeypatch.setattr(adapter, "process_comment_event", processor)
    for _ in range(2):
        assert adapter.handler({"Records": [item]}, None) == {"batchItemFailures": []}
    assert item == original
    assert processor.call_count == 2
    assert [entry["decision"] for entry in summaries(caplog)] == ["purchase_candidate"] * 2


def test_api_key_cannot_enable_ai(adapter, monkeypatch, caplog):
    import parse_intent

    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-key-not-a-credential")
    gemini = Mock(side_effect=AssertionError("Gemini must stay disabled"))
    monkeypatch.setattr(parse_intent, "_try_gemini", gemini)
    assert adapter.handler({"Records": [record(comment("Lấy A12 2 cái"))]}, None) == {
        "batchItemFailures": []}
    gemini.assert_not_called()
    assert summaries(caplog)[0]["decision"] == "needs_clarification"
