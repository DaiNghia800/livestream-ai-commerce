"""Count real SDK HTTP attempts using an in-memory transport only."""

from unittest.mock import Mock

import httpx
import pytest
from google import genai

import gemini_client
from ai_errors import AIParsingError


@pytest.fixture
def sdk(monkeypatch):
    real_client = genai.Client
    clients = []
    handler = Mock(return_value=httpx.Response(429, json={"error": {"code": 429}}))

    def construct(*, api_key, http_options):
        options = dict(http_options.client_args or {})
        options.update(transport=httpx.MockTransport(handler), verify=False)
        http_options.client_args = options
        client = real_client(api_key=api_key, vertexai=False, http_options=http_options)
        clients.append(client)
        return client

    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    monkeypatch.delenv("GEMINI_MAX_RETRIES", raising=False)
    monkeypatch.setattr(gemini_client, "_client", None)
    monkeypatch.setattr(gemini_client.genai, "Client", construct)
    monkeypatch.setattr(gemini_client, "_wait_for_rate_limit", Mock())
    sleep = Mock()
    monkeypatch.setattr(gemini_client.time, "sleep", sleep)
    yield handler, sleep
    for client in clients:
        client.close()


@pytest.mark.parametrize("setting,calls", [(None, 3), ("0", 1), ("1", 2), ("2", 3)])
def test_retry_environment_controls_http_attempts(sdk, monkeypatch, setting, calls):
    handler, sleep = sdk
    if setting is not None:
        monkeypatch.setenv("GEMINI_MAX_RETRIES", setting)
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("synthetic")
    assert caught.value.error_type == "ai_rate_limit"
    assert handler.call_count == calls
    assert sleep.call_count == calls - 1


@pytest.mark.parametrize("setting", ["", "-1", "3", "99", "0.0", "true", " 0", "0 ", "secret-value"])
def test_invalid_retry_configuration_fails_before_http(sdk, monkeypatch, setting):
    handler, sleep = sdk
    monkeypatch.setenv("GEMINI_MAX_RETRIES", setting)
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("synthetic")
    assert caught.value.error_type == "ai_configuration"
    assert "secret-value" not in caught.value.message
    handler.assert_not_called()
    sleep.assert_not_called()


@pytest.mark.parametrize("kind,error_type", [(429, "ai_rate_limit"), (503, "ai_transient"),
    (401, "ai_authentication"), ("timeout", "ai_timeout"), ("network", "ai_network")])
def test_zero_retries_never_multiplies_sdk_requests(sdk, monkeypatch, kind, error_type):
    handler, sleep = sdk
    monkeypatch.setenv("GEMINI_MAX_RETRIES", "0")
    if kind == "timeout":
        handler.side_effect = httpx.ReadTimeout("private detail")
    elif kind == "network":
        handler.side_effect = httpx.ConnectError("private detail")
    else:
        handler.return_value = httpx.Response(kind, json={"error": {"code": kind}})
    with pytest.raises(AIParsingError) as caught:
        gemini_client.parse_with_gemini("synthetic")
    assert caught.value.error_type == error_type
    assert handler.call_count == 1
    sleep.assert_not_called()


def test_redirect_does_not_create_an_unbudgeted_http_request(sdk, monkeypatch):
    handler, sleep = sdk
    monkeypatch.setenv("GEMINI_MAX_RETRIES", "0")
    handler.side_effect = [httpx.Response(307, headers={"Location": "/redirected"}, json={}),
                           httpx.Response(429, json={"error": {"code": 429}})]
    with pytest.raises(AIParsingError):
        gemini_client.parse_with_gemini("synthetic")
    assert handler.call_count == 1
    sleep.assert_not_called()
