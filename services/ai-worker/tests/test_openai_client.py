"""
Tests for openai_client.py: configuration, structured output and error
mapping to the shared AIParsingError codes. The SDK client is mocked.
"""

from unittest.mock import MagicMock, patch

import httpx
import openai
import pydantic
import pytest

from ai_errors import AIParsingError
from ai_prompt import PurchaseIntentSchema, PurchaseItem
from openai_client import MAX_RETRIES, parse_with_openai


@pytest.fixture(autouse=True)
def reset_client():
    import openai_client
    openai_client._client = None
    openai_client._last_request_time = 0.0
    yield
    openai_client._client = None


@pytest.fixture
def mock_openai_client(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    with patch("openai_client.OpenAI") as mock_cls:
        instance = MagicMock()
        mock_cls.return_value = instance
        yield instance


def _status_error(cls, status: int):
    """Build an SDK status error the way the SDK does, without a network call."""
    request = httpx.Request("POST", "https://api.openai.com/v1/responses")
    response = httpx.Response(status, request=request)
    return cls("boom", response=response, body=None)


def _validation_error() -> pydantic.ValidationError:
    """A real pydantic error, as the SDK raises when JSON has the wrong types."""
    try:
        PurchaseIntentSchema(has_intent=True, quantity="2")  # type: ignore[arg-type]
    except pydantic.ValidationError as e:
        return e
    raise AssertionError("expected a validation error")


class TestConfiguration:
    def test_missing_api_key_raises_configuration_error(self):
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt A12")
        assert exc_info.value.error_type == "ai_configuration"
        assert "OPENAI_API_KEY" in exc_info.value.message

    @patch("openai_client._wait_for_rate_limit")
    def test_uses_model_from_env_and_low_temperature(self, _wait, mock_openai_client, monkeypatch):
        monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1-mini")
        mock_openai_client.responses.parse.return_value = MagicMock(
            output_parsed=PurchaseIntentSchema(has_intent=True, kind="purchase", items=[PurchaseItem(product_code="A12", quantity=2)])
        )
        parse_with_openai("lấy a12 2 cái")
        kwargs = mock_openai_client.responses.parse.call_args.kwargs
        assert kwargs["model"] == "gpt-4.1-mini"
        assert kwargs["text_format"] is PurchaseIntentSchema
        assert kwargs["temperature"] == 0.1
        assert "lấy a12 2 cái" in kwargs["input"]

    @patch("openai_client._wait_for_rate_limit")
    def test_reasoning_models_get_no_temperature(self, _wait, mock_openai_client, monkeypatch):
        monkeypatch.setenv("OPENAI_MODEL", "gpt-5-mini")
        mock_openai_client.responses.parse.return_value = MagicMock(
            output_parsed=PurchaseIntentSchema(has_intent=False, kind="other")
        )
        parse_with_openai("đẹp quá")
        assert "temperature" not in mock_openai_client.responses.parse.call_args.kwargs


class TestStructuredOutput:
    @patch("openai_client._wait_for_rate_limit")
    def test_returns_plain_dict_from_parsed_schema(self, _wait, mock_openai_client):
        mock_openai_client.responses.parse.return_value = MagicMock(
            output_parsed=PurchaseIntentSchema(
                has_intent=True, kind="purchase",
                items=[PurchaseItem(product_code="A12", color="đen", size="M", quantity=2)],
            )
        )
        result = parse_with_openai("cho anh 2 cái áo a12 đen size M")
        assert result == {
            "has_intent": True, "kind": "purchase",
            "items": [{"product_code": "A12", "quantity": 2, "color": "đen", "size": "M"}],
            "product_code": "A12", "color": "đen", "size": "M", "quantity": 2,
        }

    @patch("openai_client._wait_for_rate_limit")
    def test_unparsed_response_is_invalid(self, _wait, mock_openai_client):
        mock_openai_client.responses.parse.return_value = MagicMock(output_parsed=None)
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_invalid_response"

    @patch("openai_client._wait_for_rate_limit")
    def test_schema_validation_error_is_invalid_response(self, _wait, mock_openai_client):
        mock_openai_client.responses.parse.side_effect = _validation_error()
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_invalid_response"


class TestErrorMapping:
    @patch("openai_client.time.sleep")
    def test_authentication_error_does_not_retry(self, mock_sleep, mock_openai_client):
        mock_openai_client.responses.parse.side_effect = _status_error(openai.AuthenticationError, 401)
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_authentication"
        mock_sleep.assert_not_called()

    @patch("openai_client.time.sleep")
    def test_bad_request_is_configuration_error_without_retry(self, mock_sleep, mock_openai_client):
        # Sai tên model / tham số không hợp lệ: gửi lại cũng thế.
        mock_openai_client.responses.parse.side_effect = _status_error(openai.NotFoundError, 404)
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_configuration"
        assert "404" in exc_info.value.message
        mock_sleep.assert_not_called()

    @patch("openai_client._wait_for_rate_limit")
    @patch("openai_client.time.sleep")
    def test_server_error_retries_then_fails_transient(self, mock_sleep, _wait, mock_openai_client):
        mock_openai_client.responses.parse.side_effect = _status_error(openai.InternalServerError, 503)
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_transient"
        assert mock_openai_client.responses.parse.call_count == MAX_RETRIES + 1
        assert mock_sleep.call_count == MAX_RETRIES

    @patch("openai_client._wait_for_rate_limit")
    @patch("openai_client.time.sleep")
    def test_rate_limit_retries_then_fails(self, mock_sleep, _wait, mock_openai_client):
        mock_openai_client.responses.parse.side_effect = _status_error(openai.RateLimitError, 429)
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_rate_limit"

    @patch("openai_client._wait_for_rate_limit")
    @patch("openai_client.time.sleep")
    def test_timeout_maps_to_ai_timeout(self, mock_sleep, _wait, mock_openai_client):
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        mock_openai_client.responses.parse.side_effect = openai.APITimeoutError(request=request)
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_timeout"

    @patch("openai_client._wait_for_rate_limit")
    @patch("openai_client.time.sleep")
    def test_connection_error_maps_to_ai_network(self, mock_sleep, _wait, mock_openai_client):
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        mock_openai_client.responses.parse.side_effect = openai.APIConnectionError(request=request)
        with pytest.raises(AIParsingError) as exc_info:
            parse_with_openai("Chốt")
        assert exc_info.value.error_type == "ai_network"

    @patch("openai_client._wait_for_rate_limit")
    @patch("openai_client.time.sleep")
    def test_transient_error_then_success(self, mock_sleep, _wait, mock_openai_client):
        ok = MagicMock(output_parsed=PurchaseIntentSchema(has_intent=True, kind="purchase", items=[PurchaseItem(product_code="B05", quantity=1)]))
        mock_openai_client.responses.parse.side_effect = [_status_error(openai.InternalServerError, 500), ok]
        result = parse_with_openai("lấy b05 1 cái")
        assert result["product_code"] == "B05"
        assert mock_sleep.call_count == 1
