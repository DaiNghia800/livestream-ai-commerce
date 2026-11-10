"""Ground mocked AI extraction in the existing comment evidence rules."""

import json
from pathlib import Path
import unicodedata
from unittest.mock import Mock, patch

import pytest

from ai_errors import AIParsingError
import gemini_client
from parse_intent import parse_purchase_intent
from process_comment import process_comment_event


def ai_response(content, code="A12", quantity=2, **fields):
    result = {
        "has_intent": True, "confidence": "high", "source": "gemini",
        "product_code": code, "quantity": quantity,
        "color": None, "size": None, "raw": content,
    }
    result.update(fields)
    return result


@pytest.mark.parametrize("content,code,quantity", [
    ("Mua B05", "B05", 2),
    ("Mua B05", "B05", 1),
    ("Lấy A12", "A12", 12),
    ("Mua CAM-12", "CAM-12", 12),
])
def test_ai_cannot_supply_a_quantity_missing_from_the_comment(content, code, quantity):
    with patch("parse_intent._try_gemini", return_value=ai_response(content, code, quantity)) as ai:
        result = parse_purchase_intent(content)
    ai.assert_called_once_with(content)
    assert result["decision"] == "needs_clarification"
    assert result["quantity"] is None
    assert result["product_code"] == code
    assert "missing_quantity" in result["reason_codes"]
    assert result["raw"] == content


@pytest.mark.parametrize("content,code,quantity,expected_code,expected_quantity,reasons", [
    ("Lấy A12 2 cái", "B05", 7, None, None, ["invalid_quantity", "missing_product_code"]),
    ("Lấy A12 2 cái", "B05", 2, None, 2, ["missing_product_code"]),
    ("Lấy A12 2 cái", "A12", 7, "A12", None, ["invalid_quantity"]),
    ("Lấy A12 2 cái", "A012", 2, None, 2, ["missing_product_code"]),
    ("Lấy SP-POLO-012 2 cái", "POLO-012", 2, None, 2, ["missing_product_code"]),
    ("Lấy A12 2 cái", "AO01TFORMRONG", 2, None, 2, ["missing_product_code"]),
])
def test_conflicting_ai_fields_cannot_replace_comment_evidence(
    content, code, quantity, expected_code, expected_quantity, reasons
):
    with patch("parse_intent._try_gemini", return_value=ai_response(content, code, quantity)) as ai:
        result = parse_purchase_intent(content)
    ai.assert_called_once_with(content)
    assert result["decision"] == "needs_clarification"
    assert result["product_code"] == expected_code
    assert result["quantity"] == expected_quantity
    assert result["reason_codes"] == reasons
    assert result["raw"] == content


@pytest.mark.parametrize("content,code,quantity,expected_code", [
    ("Lấy A12 2 cái", "A12", 2, "A12"),
    ("Lấy a12 2cái", " a12 ", 2, "A12"),
    ("Lấy A12 sl=02", "A12", 2, "A12"),
    ("Lấy A12 số lượng: + 2", "A12", 2, "A12"),
    ("Lấy A12 2", "A12", 2, "A12"),
    ("Cho em SP-POLO-012 2 cái", "sp-polo-012", 2, "SP-POLO-012"),
    ("Lấy A12 giá 200k, 2 cái", "A12", 2, "A12"),
    ("Lấy A12 size 38, 2 cái", "A12", 2, "A12"),
    ("Lấy A12 2 cái, a12 đen", "A12", 2, "A12"),
])
def test_matching_ai_fields_preserve_supported_quantity_syntax(content, code, quantity, expected_code):
    with patch("parse_intent._try_gemini", return_value=ai_response(content, code, quantity)) as ai:
        result = parse_purchase_intent(content)
    ai.assert_called_once_with(content)
    assert result["decision"] == "purchase_candidate"
    assert result["source"] == "gemini"
    assert result["product_code"] == expected_code
    assert result["quantity"] == quantity
    assert result["reason_codes"] == []
    assert result["raw"] == content


@pytest.mark.parametrize("fields,reason", [
    ({"product_code": None}, "missing_product_code"),
    ({"quantity": None}, "missing_quantity"),
    ({"quantity": 0}, "invalid_quantity"),
    ({"quantity": -1}, "invalid_quantity"),
    ({"confidence": "low"}, "uncertain_intent"),
])
def test_evidence_does_not_fill_missing_ai_fields_or_bypass_policy(fields, reason):
    content = "Lấy A12 2 cái"
    reply = ai_response(content, **fields)
    with patch("parse_intent._try_gemini", return_value=reply):
        result = parse_purchase_intent(content)
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == [reason]


@pytest.mark.parametrize("content,code,fields,color,size", [
    ("Lấy CAM-12 2 cái", "CAM-12", {"color": "cam"}, None, None),
    ("Lấy SKU-123-XL 2 cái", "SKU-123-XL", {"size": "XL"}, None, None),
    ("Lấy SKU-123-XL size M 2 cái", "SKU-123-XL", {"size": "XL"}, None, None),
    ("Lấy CAM-12 màu đỏ size M 2 cái", "CAM-12", {"color": "đen", "size": "L"}, None, None),
    ("Lấy CAM-12 màu xanh   dương size m 2 cái", "CAM-12",
     {"color": unicodedata.normalize("NFD", "XANH  DƯƠNG"), "size": " m "}, "xanh dương", "M"),
])
def test_ai_variants_respect_masked_and_normalized_comment_evidence(content, code, fields, color, size):
    with patch("parse_intent._try_gemini", return_value=ai_response(content, code, **fields)) as ai:
        result = parse_purchase_intent(content)
    ai.assert_called_once_with(content)
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == code
    assert result["quantity"] == 2
    assert result["color"] == color
    assert result["size"] == size


def test_grounding_preserves_original_unicode_raw_and_does_not_mutate_ai_reply():
    content = unicodedata.normalize("NFD", "Lấy A12 2 cái")
    reply = ai_response(content, raw="AI-rewritten comment")
    original = dict(reply)
    with patch("parse_intent._try_gemini", return_value=reply):
        result = parse_purchase_intent(content)
    assert result["decision"] == "purchase_candidate"
    assert result["raw"] == content
    assert reply == original


@pytest.mark.parametrize("content,decision,reason", [
    ("Không mua A12 2 cái", "no_purchase", "explicit_negation"),
    ("A12 còn không?", "no_purchase", "question"),
    ("Lấy A12 2 cái được không?", "needs_clarification", "ambiguous_question"),
    ("Lấy A12 nếu còn hàng 2 cái", "needs_clarification", "conditional_purchase"),
    ("Lấy A12 B05 2 cái", "needs_clarification", "multiple_products"),
    ("Lấy A12 2 cái hoặc 3 cái", "needs_clarification", "ambiguous_quantity"),
    ("Lấy A12 sl: 2..5 cái", "needs_clarification", "invalid_quantity"),
    ("Lấy CAM-12 đỏ hoặc đen 2 cái", "needs_clarification", "ambiguous_color"),
    ("Lấy CAM-12 đỏ hay đen 2 cái", "needs_clarification", "ambiguous_color"),
    ("Lấy SKU-123-XL size M hay XL 2 cái?", "needs_clarification", "ambiguous_question"),
    ("Lấy AO01TFORMRONG 2 cái", "needs_clarification", "missing_product_code"),
])
def test_existing_guards_precede_ai_evidence_validation(content, decision, reason):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == decision
    assert result["reason_codes"] == [reason]
    assert result["raw"] == content


@pytest.mark.parametrize("error_type", ["ai_timeout", "ai_network", "ai_invalid_response", "ai_configuration"])
def test_evidence_validation_does_not_swallow_technical_ai_failures(error_type):
    error = AIParsingError(error_type, "Mock technical failure")
    with patch("parse_intent._try_gemini", side_effect=error):
        with pytest.raises(AIParsingError) as caught:
            parse_purchase_intent("Lấy A12 2 cái")
    assert caught.value is error


def mock_sdk(monkeypatch, payload):
    client = Mock()
    client.models.generate_content.return_value = Mock(
        parsed=gemini_client.PurchaseIntentSchema.model_validate(payload)
    )
    monkeypatch.setattr(gemini_client, "_get_client", Mock(return_value=client))
    monkeypatch.setattr(gemini_client, "_wait_for_rate_limit", Mock())
    return client


@pytest.mark.parametrize("content,payload,decision,code,quantity,reasons", [
    ("Mua B05", {"has_intent": True, "product_code": "B05", "quantity": 2},
     "needs_clarification", "B05", None, ["missing_quantity"]),
    ("Lấy A12 2 cái", {"has_intent": True, "product_code": "B05", "quantity": 7},
     "needs_clarification", None, None, ["invalid_quantity", "missing_product_code"]),
    ("Lấy A12 2 cái", {"has_intent": True, "product_code": "A12", "quantity": 2},
     "purchase_candidate", "A12", 2, []),
    ("Lấy A12 2 cái", {"has_intent": True, "quantity": 2},
     "needs_clarification", None, 2, ["missing_product_code"]),
    ("Lấy A12 2 cái", {"has_intent": False},
     "no_purchase", None, None, ["no_purchase_intent"]),
    ("Lấy CAM-12 2 cái", {"has_intent": True, "product_code": "CAM-12", "quantity": 2, "color": "cam"},
     "purchase_candidate", "CAM-12", 2, []),
    ("Lấy SP-POLO-012 2 cái", {"has_intent": True, "product_code": "POLO-012", "quantity": 2},
     "needs_clarification", None, 2, ["missing_product_code"]),
])
def test_processor_grounding_is_a_business_result_with_preserved_context(
    monkeypatch, content, payload, decision, code, quantity, reasons
):
    client = mock_sdk(monkeypatch, payload)
    root = Path(__file__).resolve().parents[3]
    source = json.loads((root / "contracts/examples/comment-created.v1.json").read_text(encoding="utf-8"))
    source["content"] = content

    result = process_comment_event(source)

    assert result["status"] == "ok"
    assert "error_type" not in result
    for field in ("event_id", "comment_id", "session_id", "customer_id"):
        assert result[field] == source[field]
    assert result["content"] == content
    assert result["intent"]["raw"] == content
    assert result["intent"]["decision"] == decision
    assert result["intent"]["product_code"] == code
    assert result["intent"]["quantity"] == quantity
    assert result["intent"]["reason_codes"] == reasons
    assert result["intent"]["color"] is None
    assert result["intent"]["size"] is None
    assert client.models.generate_content.call_count == 1


def test_processor_keeps_technical_failure_separate_from_business_clarification(monkeypatch):
    client = mock_sdk(monkeypatch, {"has_intent": True})
    client.models.generate_content.side_effect = AIParsingError("ai_network", "Mock technical failure")
    root = Path(__file__).resolve().parents[3]
    source = json.loads((root / "contracts/examples/comment-created.v1.json").read_text(encoding="utf-8"))
    source["content"] = "Lấy A12 2 cái"
    result = process_comment_event(source)
    assert result["status"] == "error"
    assert result["error_type"] == "ai_network"
    assert "intent" not in result
    assert result["event_id"] == source["event_id"]
    assert result["comment_id"] == source["comment_id"]
