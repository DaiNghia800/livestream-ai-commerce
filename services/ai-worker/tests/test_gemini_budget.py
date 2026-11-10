"""Verify cooperative retry deadlines through the real SDK without network I/O."""

import json
import logging
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest
from google import genai

import gemini_client
from ai_errors import AIParsingError
from process_comment import process_comment_event


class FakeClock:
    def __init__(self):
        self.now = 100.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        assert 0 < seconds <= 30
        self.sleeps.append(seconds)
        self.now += seconds


def success():
    payload = {"has_intent": True, "product_code": "A12", "quantity": 2}
    return httpx.Response(200, json={"candidates": [{"content": {
        "role": "model", "parts": [{"text": json.dumps(payload)}]},
        "finishReason": "STOP"}]})


def failure(code):
    return httpx.Response(code, json={"error": {
        "code": code, "message": "private remote detail"}})


@pytest.fixture
def offline_sdk(monkeypatch):
    """Inject fake time and HTTP while exercising production client construction."""
    clock = FakeClock()
    handler = Mock(return_value=success())
    real_client = genai.Client
    clients, options = [], []

    def construct(*, api_key, http_options):
        options.append(http_options)
        http_options.client_args = {"transport": httpx.MockTransport(handler)}
        client = real_client(api_key=api_key, vertexai=False, http_options=http_options)
        clients.append(client)
        return client

    monkeypatch.setenv("GEMINI_API_KEY", "fake-key-for-offline-tests")
    monkeypatch.setattr(gemini_client, "_client", None)
    monkeypatch.setattr(gemini_client, "_last_request_time", 0.0)
    monkeypatch.setattr(gemini_client.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(gemini_client.time, "sleep", clock.sleep)
    monkeypatch.setattr(gemini_client.genai, "Client", construct)
    yield clock, handler, options
    for client in clients:
        client.close()


def test_sdk_timeout_is_finite_milliseconds_and_retries_disabled(offline_sdk):
    clock, handler, options = offline_sdk
    assert gemini_client.parse_with_gemini("Lấy A12 2 cái")["quantity"] == 2
    assert options[0].timeout == 10_000
    assert options[0].retry_options.attempts == 1
    assert handler.call_count == 1
    assert handler.call_args.args[0].extensions["timeout"] == {
        "connect": 10.0, "read": 10.0, "write": 10.0, "pool": 10.0}
    assert clock.sleeps == []


@pytest.mark.parametrize("kind,error_type", [
    ("timeout", "ai_timeout"), ("network", "ai_network"),
    (408, "ai_transient"), (429, "ai_rate_limit"),
    (500, "ai_transient"), (503, "ai_transient"),
])
def test_retry_attempts_have_no_sdk_multiplication(offline_sdk, kind, error_type):
    clock, handler, _ = offline_sdk

    def fail(request):
        clock.now += 4
        if kind == "timeout":
            raise httpx.ReadTimeout("private remote detail")
        if kind == "network":
            raise httpx.ConnectError("private remote detail")
        return failure(kind)

    handler.side_effect = fail
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("Lấy A12 2 cái")
    assert caught.value.error_type == error_type
    assert handler.call_count == 3
    assert clock.sleeps == [2.0, 4.0]
    assert clock.now == 118.0
    assert "private remote detail" not in caught.value.message


@pytest.mark.parametrize("code,error_type", [
    (400, "ai_configuration"), (401, "ai_authentication"),
    (403, "ai_authentication"), (404, "ai_configuration"),
])
def test_non_retryable_http_errors(offline_sdk, code, error_type):
    clock, handler, _ = offline_sdk
    handler.return_value = failure(code)
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("Lấy A12 2 cái")
    assert caught.value.error_type == error_type
    assert handler.call_count == 1
    assert clock.sleeps == []


@pytest.mark.parametrize("text", ["not JSON", "{}", '{"has_intent": []}'])
def test_invalid_response_has_no_retry(offline_sdk, text):
    clock, handler, _ = offline_sdk
    reply = success()
    data = reply.json()
    data["candidates"][0]["content"]["parts"][0]["text"] = text
    handler.return_value = httpx.Response(200, json=data)
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("Lấy A12 2 cái")
    assert caught.value.error_type == "ai_invalid_response"
    assert handler.call_count == 1
    assert clock.sleeps == []


def test_timeout_then_rate_limit_then_success(offline_sdk):
    clock, handler, _ = offline_sdk
    timeouts = []

    def respond(request):
        timeouts.append(request.extensions["timeout"]["read"])
        if len(timeouts) == 1:
            clock.now += 10
            raise httpx.ReadTimeout("offline timeout")
        if len(timeouts) == 2:
            clock.now += 10
            return failure(429)
        clock.now += 1
        return success()

    handler.side_effect = respond
    assert gemini_client.parse_with_gemini("Lấy A12 2 cái")["quantity"] == 2
    assert handler.call_count == 3
    assert timeouts == [10.0, 10.0, 4.0]
    assert clock.sleeps == [2.0, 4.0]
    assert clock.now == 127.0


@pytest.mark.parametrize("elapsed", [28.0, 29.0, 30.0, 31.0])
def test_backoff_cannot_consume_or_exceed_remaining_budget(offline_sdk, elapsed):
    clock, handler, _ = offline_sdk

    def respond(request):
        clock.now += elapsed
        return failure(429)

    handler.side_effect = respond
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("Lấy A12 2 cái")
    assert caught.value.error_type == "ai_rate_limit"
    assert handler.call_count == 1
    assert clock.sleeps == []


def test_rate_limit_and_backoff_share_budget(offline_sdk, monkeypatch):
    clock, handler, _ = offline_sdk
    monkeypatch.setattr(gemini_client, "_last_request_time", clock.now)
    timeouts = []

    def respond(request):
        timeouts.append(request.extensions["timeout"]["read"])
        if len(timeouts) == 1:
            clock.now += 23
            return failure(503)
        return success()

    handler.side_effect = respond
    assert gemini_client.parse_with_gemini("Lấy A12 2 cái")["quantity"] == 2
    assert timeouts == [10.0, 1.0]
    assert clock.sleeps == [4.0, 2.0]


def test_fast_retry_obeys_local_rate_limit(offline_sdk):
    clock, handler, _ = offline_sdk
    handler.side_effect = [failure(503), failure(503), success()]
    assert gemini_client.parse_with_gemini("Lấy A12 2 cái")["quantity"] == 2
    assert handler.call_count == 3
    assert clock.sleeps == [2.0, 2.0, 4.0]
    assert clock.now == 108.0


@pytest.mark.parametrize("budget", [0.0, -1.0, 0.0005, 3.0, 4.0])
def test_no_attempt_when_budget_cannot_cover_rate_limit(offline_sdk, monkeypatch, budget):
    clock, handler, _ = offline_sdk
    monkeypatch.setattr(gemini_client, "TOTAL_RETRY_BUDGET", budget, raising=False)
    monkeypatch.setattr(gemini_client, "_last_request_time", clock.now)
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("Lấy A12 2 cái")
    assert caught.value.error_type == "ai_timeout"
    handler.assert_not_called()
    assert clock.sleeps == []


def test_sleep_overshoot_does_not_start_another_attempt(offline_sdk, monkeypatch):
    clock, handler, _ = offline_sdk
    handler.return_value = failure(503)

    def oversleep(seconds):
        clock.sleeps.append(seconds)
        clock.now += 31

    monkeypatch.setattr(gemini_client.time, "sleep", oversleep)
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("Lấy A12 2 cái")
    assert caught.value.error_type == "ai_timeout"
    assert handler.call_count == 1
    assert clock.sleeps == [2.0]


def test_late_success_is_not_accepted_after_budget(offline_sdk):
    clock, handler, _ = offline_sdk

    def respond(request):
        clock.now += 31
        return success()

    handler.side_effect = respond
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("Lấy A12 2 cái")
    assert caught.value.error_type == "ai_timeout"
    assert handler.call_count == 1
    assert clock.sleeps == []


def test_processor_timeout_preserves_context_without_sensitive_logs(offline_sdk, caplog):
    clock, handler, _ = offline_sdk
    root = Path(__file__).resolve().parents[3]
    source = json.loads((root / "contracts/examples/comment-created.v1.json").read_text(encoding="utf-8"))
    source["content"] = "Lấy A12 2 cái private-customer-detail"

    def respond(request):
        clock.now += 30
        raise httpx.ReadTimeout("private remote detail")

    handler.side_effect = respond
    with caplog.at_level(logging.INFO):
        result = process_comment_event(source)
    assert result["status"] == "error"
    assert result["error_type"] == "ai_timeout"
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]
    assert "intent" not in result
    assert handler.call_count == 1
    assert clock.sleeps == []
    for secret in (source["content"], "private-customer-detail", "fake-key-for-offline-tests", "private remote detail"):
        assert secret not in caplog.text
