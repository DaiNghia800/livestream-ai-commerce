"""
Tests for AI provider selection in parse_intent.

OpenAI is used when OPENAI_API_KEY is set, Gemini otherwise. Both helpers
are mocked: no provider SDK is exercised here.
"""

from unittest.mock import patch

import pytest

from ai_errors import AIParsingError
from parse_intent import ai_provider, parse_purchase_intent


# Câu "lấy a12 2 cái" chỉ có từ khoá yếu nên regex không chắc → phải hỏi AI.
LOW_CONFIDENCE = "lấy a12 2 cái"
AI_REPLY = {"has_intent": True, "product_code": "A12", "color": None, "size": None, "quantity": 2}


class TestProviderSelection:
    def test_defaults_to_gemini_without_openai_key(self):
        assert ai_provider() == "gemini"

    def test_prefers_openai_when_key_is_set(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        assert ai_provider() == "openai"

    def test_blank_openai_key_counts_as_missing(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "   ")
        assert ai_provider() == "gemini"


class TestRouting:
    @patch("parse_intent._try_openai")
    @patch("parse_intent._try_gemini")
    def test_low_confidence_goes_to_gemini_by_default(self, mock_gemini, mock_openai):
        mock_gemini.return_value = {**AI_REPLY, "confidence": "high", "source": "gemini", "raw": LOW_CONFIDENCE}
        result = parse_purchase_intent(LOW_CONFIDENCE)
        mock_gemini.assert_called_once_with(LOW_CONFIDENCE)
        mock_openai.assert_not_called()
        assert result["decision"] == "purchase_candidate"
        assert result["source"] == "gemini"

    @patch("openai_client.parse_with_openai")
    @patch("parse_intent._try_gemini")
    def test_low_confidence_goes_to_openai_when_key_is_set(self, mock_gemini, mock_openai, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        mock_openai.return_value = AI_REPLY
        result = parse_purchase_intent(LOW_CONFIDENCE)
        mock_openai.assert_called_once()
        assert mock_openai.call_args.args[0] == LOW_CONFIDENCE
        mock_gemini.assert_not_called()
        # Kết quả OpenAI đi qua cùng cổng quyết định như Gemini.
        assert result["decision"] == "purchase_candidate"
        assert result["source"] == "openai"
        assert result["product_code"] == "A12"
        assert result["quantity"] == 2

    @patch("openai_client.parse_with_openai")
    def test_openai_failure_bubbles_up_like_gemini(self, mock_openai, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        mock_openai.side_effect = AIParsingError("ai_rate_limit", "slow down")
        with pytest.raises(AIParsingError) as exc_info:
            parse_purchase_intent(LOW_CONFIDENCE)
        assert exc_info.value.error_type == "ai_rate_limit"

    @patch("openai_client.parse_with_openai")
    @patch("parse_intent._try_gemini")
    def test_high_confidence_never_calls_any_provider(self, mock_gemini, mock_openai, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
        result = parse_purchase_intent("Chốt A12 2 cái")
        mock_openai.assert_not_called()
        mock_gemini.assert_not_called()
        assert result["decision"] == "purchase_candidate"
