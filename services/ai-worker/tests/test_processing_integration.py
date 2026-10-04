"""Exercise real worker modules and SDK through an in-memory HTTP transport."""

import json
import runpy
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest
from google import genai
from google.genai import types

import gemini_client
from process_comment import process_comment_event

ROOT = Path(__file__).resolve().parents[3]


def event():
    result = json.loads((ROOT / "contracts/examples/comment-created.v1.json").read_text(encoding="utf-8"))
    result["content"] = "Mua B05"
    return result


@pytest.fixture
def transport_client(monkeypatch):
    """Keep the SDK real; replace only HTTP transport and waiting."""
    handler = Mock()
    client = genai.Client(
        api_key="fake-key", vertexai=False,
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(attempts=1),
            client_args={"transport": httpx.MockTransport(handler)},
        ),
    )
    monkeypatch.setattr(gemini_client, "_client", client)
    monkeypatch.setattr(gemini_client, "_wait_for_rate_limit", Mock())
    monkeypatch.setattr(gemini_client.time, "sleep", Mock())
    yield handler
    client.close()


def response(text):
    return httpx.Response(200, json={"candidates": [{"content": {
        "role": "model", "parts": [{"text": text}]}, "finishReason": "STOP"}]})


@pytest.mark.parametrize("code,status,error_type,calls", [
    (400, "INVALID_ARGUMENT", "ai_configuration", 1),
    (401, "UNAUTHENTICATED", "ai_authentication", 1),
    (403, "PERMISSION_DENIED", "ai_authentication", 1),
    (404, "NOT_FOUND", "ai_configuration", 1),
    (429, "RESOURCE_EXHAUSTED", "ai_rate_limit", 3),
    (503, "UNAVAILABLE", "ai_transient", 3),
])
def test_http_failure_preserves_ids_without_success(transport_client, code, status, error_type, calls):
    transport_client.return_value = httpx.Response(code, json={
        "error": {"code": code, "status": status, "message": "offline error"}})
    source = event()
    result = process_comment_event(source)
    assert result["status"] == "error"
    assert result["error_type"] == error_type
    assert "intent" not in result
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]
    assert transport_client.call_count == calls


@pytest.mark.parametrize("error,error_type", [
    (httpx.ReadTimeout("offline"), "ai_timeout"),
    (httpx.ConnectError("offline"), "ai_network"),
])
def test_network_failure_crosses_all_layers(transport_client, error, error_type):
    transport_client.side_effect = error
    source = event()
    result = process_comment_event(source)
    assert result["status"] == "error"
    assert result["error_type"] == error_type
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]
    assert "intent" not in result
    assert transport_client.call_count == 3


@pytest.mark.parametrize("text", ["not JSON", "{}", '{"has_intent": []}'])
def test_invalid_response_does_not_fall_back(transport_client, text):
    transport_client.return_value = response(text)
    result = process_comment_event(event())
    assert result["status"] == "error"
    assert result["error_type"] == "ai_invalid_response"
    assert "intent" not in result
    assert transport_client.call_count == 1


def test_retry_then_success_keeps_missing_quantity(transport_client):
    transport_client.side_effect = [
        httpx.Response(503, json={"error": {"code": 503, "status": "UNAVAILABLE"}}),
        response('{"has_intent": true, "product_code": "B05", "quantity": null}'),
    ]
    source = event()
    result = process_comment_event(source)
    assert result["status"] == "ok"
    assert result["intent"]["source"] == "gemini"
    assert result["intent"]["quantity"] is None
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]
    assert transport_client.call_count == 2


def test_programming_failure_is_not_retryable(transport_client):
    transport_client.side_effect = TypeError("programming defect")
    with pytest.raises(TypeError, match="programming defect"):
        process_comment_event(event())
    assert transport_client.call_count == 1


def test_missing_configuration_crosses_parser_and_process(monkeypatch):
    monkeypatch.setattr(gemini_client, "_client", None)
    source = event()
    result = process_comment_event(source)
    assert result["status"] == "error"
    assert result["error_type"] == "ai_configuration"
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]


def test_example_script_with_real_example(monkeypatch, capsys):
    monkeypatch.chdir(ROOT)
    runpy.run_path(str(ROOT / "services/ai-worker/read_example.py"), run_name="__main__")
    assert "[OK]" in capsys.readouterr().out


def test_example_script_reports_technical_error(monkeypatch, tmp_path, capsys):
    directory = tmp_path / "contracts/examples"
    directory.mkdir(parents=True)
    (directory / "comment-created.v1.json").write_text(json.dumps(event()), encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(gemini_client, "_client", None)
    with pytest.raises(SystemExit) as caught:
        runpy.run_path(str(ROOT / "services/ai-worker/read_example.py"), run_name="__main__")
    assert caught.value.code == 1
    assert "[ERROR: ai_configuration]" in capsys.readouterr().out


@pytest.mark.parametrize("content,decision,reason", [
    ("Không mua A12 đen", "no_purchase", "explicit_negation"),
    ("A12 đen còn không?", "no_purchase", "question"),
    ("Không lấy A12, lấy B05 2 cái", "needs_clarification", "ambiguous_negation"),
    ("Chốt A12 đen", "needs_clarification", "missing_quantity"),
    ("Chốt A12 2 cái và B05 3 cái", "needs_clarification", "multiple_products"),
])
def test_business_decision_preserves_ids_without_ai(monkeypatch, content, decision, reason):
    # Use real processor/parser/policy and forbid even constructing the SDK client.
    client = Mock(side_effect=AssertionError("AI must not be used"))
    monkeypatch.setattr(gemini_client, "_get_client", client)
    source = event()
    source["content"] = content
    result = process_comment_event(source)
    assert result["status"] == "ok"
    assert "error_type" not in result
    assert result["intent"]["decision"] == decision
    assert result["intent"]["reason_codes"] == [reason]
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]
    client.assert_not_called()


@pytest.mark.parametrize("payload,decision,reason", [
    ({"has_intent": True, "product_code": "B05"}, "needs_clarification", "missing_quantity"),
    ({"has_intent": True, "product_code": "B05", "quantity": 0}, "needs_clarification", "invalid_quantity"),
    ({"has_intent": True, "product_code": "B05", "quantity": 2}, "purchase_candidate", None),
    ({"has_intent": False}, "no_purchase", "no_purchase_intent"),
])
def test_sdk_response_passes_through_decision_gate(transport_client, payload, decision, reason):
    transport_client.return_value = response(json.dumps(payload))
    source = event()
    result = process_comment_event(source)
    assert result["status"] == "ok"
    assert result["intent"]["decision"] == decision
    assert result["intent"]["reason_codes"] == ([] if reason is None else [reason])
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]
    assert transport_client.call_count == 1


def test_example_script_displays_clarification(monkeypatch, tmp_path, capsys):
    directory = tmp_path / "contracts/examples"
    directory.mkdir(parents=True)
    source = event()
    source["content"] = "Chốt A12 đen"
    (directory / "comment-created.v1.json").write_text(json.dumps(source), encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    runpy.run_path(str(ROOT / "services/ai-worker/read_example.py"), run_name="__main__")
    output = capsys.readouterr().out
    assert "needs_clarification" in output
    assert "missing_quantity" in output
    assert "[ERROR" not in output
