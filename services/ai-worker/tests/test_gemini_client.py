"""
Tests for gemini_client.py ensuring proper API error propagation.
"""

import pytest
from unittest.mock import patch, MagicMock
from google.genai import errors as genai_errors
import pydantic

from ai_errors import AIParsingError
from gemini_client import parse_with_gemini, MAX_RETRIES

# Reset the singleton client for each test so we can mock os.environ cleanly
@pytest.fixture(autouse=True)
def reset_client():
    import gemini_client
    gemini_client._client = None
    gemini_client._last_request_time = 0.0  # Avoid rate limit sleep in tests
    yield
    gemini_client._client = None

class TestGeminiClientConfiguration:
    @patch("os.environ.get")
    def test_missing_api_key_raises_configuration_error(self, mock_env):
        mock_env.return_value = None
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_gemini("Chốt A12")
        assert exc_info.value.error_type == "ai_configuration"
        assert "GEMINI_API_KEY" in exc_info.value.message


class TestGeminiClientErrorHandling:
    @pytest.fixture
    def mock_genai_client(self):
        with patch("os.environ.get", return_value="fake_key"):
            with patch("gemini_client.genai.Client") as mock_client:
                mock_instance = MagicMock()
                mock_client.return_value = mock_instance
                yield mock_instance

    @patch("gemini_client.time.sleep") # Do not sleep in tests
    def test_authentication_error(self, mock_sleep, mock_genai_client):
        # 403 Forbidden
        err = genai_errors.ClientError(403, {"error": {"status": "PERMISSION_DENIED", "message": "Forbidden"}})
        mock_genai_client.models.generate_content.side_effect = err
        
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_gemini("Chốt")
            
        assert exc_info.value.error_type == "ai_authentication"
        # Authentication failure should not retry
        mock_sleep.assert_not_called()

    @patch("gemini_client._wait_for_rate_limit")
    @patch("gemini_client.time.sleep")
    def test_transient_error_retries_and_fails(self, mock_sleep, mock_wait_rate_limit, mock_genai_client):
        # 503 Service Unavailable
        err = genai_errors.ServerError(503, {"error": {"status": "UNAVAILABLE", "message": "Service Unavailable"}})
        mock_genai_client.models.generate_content.side_effect = err
        
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_gemini("Chốt")
            
        assert exc_info.value.error_type == "ai_transient"
        # Should attempt initial + MAX_RETRIES times = 3 total attempts
        assert mock_genai_client.models.generate_content.call_count == MAX_RETRIES + 1
        # Should have slept MAX_RETRIES times
        assert mock_sleep.call_count == MAX_RETRIES

    @patch("gemini_client.time.sleep")
    def test_invalid_schema_response(self, mock_sleep, mock_genai_client):
        mock_genai_client.models.generate_content.side_effect = pydantic.ValidationError.from_exception_data("error", line_errors=[])
        
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_gemini("Chốt")
            
        assert exc_info.value.error_type == "ai_invalid_response"
        # Schema failures should not retry
        mock_sleep.assert_not_called()

    @patch("gemini_client.time.sleep")
    def test_programming_error_bubbles_up(self, mock_sleep, mock_genai_client):
        mock_genai_client.models.generate_content.side_effect = TypeError("Unexpected argument")
        
        # A generic exception should bubble out, not be treated as an AI error
        with pytest.raises(TypeError, match="Unexpected argument"):
            parse_with_gemini("Chốt")
        
        mock_sleep.assert_not_called()


@pytest.mark.parametrize("code,status,error_type,calls", [
    (400, "INVALID_ARGUMENT", "ai_configuration", 1),
    (401, "UNAUTHENTICATED", "ai_authentication", 1),
    (403, "PERMISSION_DENIED", "ai_authentication", 1),
    (404, "NOT_FOUND", "ai_configuration", 1),
    (408, "DEADLINE_EXCEEDED", "ai_transient", 3),
    (429, "RESOURCE_EXHAUSTED", "ai_rate_limit", 3),
    (500, "INTERNAL", "ai_transient", 3),
    (503, "UNAVAILABLE", "ai_transient", 3),
])
def test_real_sdk_http_errors(code, status, error_type, calls):
    error_class = genai_errors.ClientError if code < 500 else genai_errors.ServerError
    error = error_class(code, {"error": {"code": code, "status": status,
                                       "message": "Private remote detail"}})
    with patch("gemini_client._get_client") as client, \
         patch("gemini_client._wait_for_rate_limit"), \
         patch("gemini_client.time.sleep") as sleep:
        generate = client.return_value.models.generate_content
        generate.side_effect = error
        with pytest.raises(AIParsingError) as caught:
            parse_with_gemini("Mua B05")
        assert caught.value.error_type == error_type
        assert "Private remote detail" not in caught.value.message
        assert generate.call_count == calls
        assert sleep.call_args_list == [((2.0,),), ((4.0,),)][:calls - 1]


@pytest.mark.parametrize("name,error_type", [
    ("ConnectTimeout", "ai_timeout"),
    ("ReadTimeout", "ai_timeout"),
    ("ConnectError", "ai_network"),
    ("ReadError", "ai_network"),
    ("RemoteProtocolError", "ai_network"),
])
def test_transport_errors_retry(name, error_type):
    import httpx
    with patch("gemini_client._get_client") as client, \
         patch("gemini_client._wait_for_rate_limit"), \
         patch("gemini_client.time.sleep") as sleep:
        generate = client.return_value.models.generate_content
        generate.side_effect = getattr(httpx, name)("offline failure")
        with pytest.raises(AIParsingError) as caught:
            parse_with_gemini("Mua B05")
        assert caught.value.error_type == error_type
        assert generate.call_count == 3
        assert sleep.call_count == 2


@pytest.mark.parametrize("parsed", [None, {}, {"has_intent": True}, [], "invalid"])
def test_unexpected_structured_output_is_not_success(parsed):
    from google.genai import types
    with patch("gemini_client._get_client") as client, \
         patch("gemini_client._wait_for_rate_limit"), \
         patch("gemini_client.time.sleep") as sleep:
        generate = client.return_value.models.generate_content
        # Construct the SDK response at the call boundary: its own validation
        # rejects unsupported values before the worker can inspect parsed.
        generate.side_effect = lambda **kwargs: types.GenerateContentResponse(parsed=parsed)
        with pytest.raises(AIParsingError) as caught:
            parse_with_gemini("Mua B05")
        assert caught.value.error_type == "ai_invalid_response"
        generate.assert_called_once()
        sleep.assert_not_called()


def test_client_disables_sdk_retries(monkeypatch):
    from gemini_client import _get_client
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    with patch("gemini_client.genai.Client") as constructor:
        _get_client()
        _get_client()
        constructor.assert_called_once()
        assert constructor.call_args.kwargs["http_options"].retry_options.attempts == 1


def test_rate_limiter_waits_only_for_remaining_interval(monkeypatch):
    import gemini_client
    monkeypatch.setattr(gemini_client, "_last_request_time", 100.0)
    with patch("gemini_client.time.time", side_effect=[101.0, 104.0]), \
         patch("gemini_client.time.sleep") as sleep:
        gemini_client._wait_for_rate_limit()
        sleep.assert_called_once_with(3.0)
        assert gemini_client._last_request_time == 104.0
