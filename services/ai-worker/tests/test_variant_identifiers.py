"""Keep product identifiers separate from independently stated variants."""

import json
from pathlib import Path
import unicodedata
from unittest.mock import Mock, patch

import pytest

import gemini_client
from parse_intent import parse_purchase_intent
from process_comment import process_comment_event


@pytest.mark.parametrize("code", [
    "CAM-12", "BE-12", "KEM-12", "L-12", "XL-12", "SKU-123-XL",
    "SKU-S-123-XXL", "SP-CAM-012-M", "CAM-12-BE-XL", "CAM12", "SP-POLO-012",
])
def test_identifier_parts_are_not_selected_variants(code):
    content = f"Chốt {code} 2 cái"
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["product_code"] == code
    assert result["color"] is None
    assert result["size"] is None
    assert result["quantity"] == 2
    assert result["decision"] == "purchase_candidate"
    assert result["reason_codes"] == []
    assert result["raw"] == content


@pytest.mark.parametrize("content,code,color,size", [
    ("Chốt CAM-12 màu đỏ 2 cái", "CAM-12", "đỏ", None),
    ("Chốt CAM-12 màu be 2 cái", "CAM-12", "be", None),
    ("Chốt BE-12 màu kem 2 cái", "BE-12", "kem", None),
    ("Chốt SKU-123-XL size M 2 cái", "SKU-123-XL", None, "M"),
    ("Chốt L-12 size S 2 cái", "L-12", None, "S"),
    ("Chốt SP-CAM-012-XL màu đỏ size M 2 cái", "SP-CAM-012-XL", "đỏ", "M"),
    ("Chốt SKU-123-XL màu cam size S 2 cái", "SKU-123-XL", "cam", "S"),
    ("Chốt cam-012 màu (CAM) size (XL) 2 cái", "CAM-012", "cam", "XL"),
    ("Chốt size M, SKU-123-XL màu đỏ 2 cái", "SKU-123-XL", "đỏ", "M"),
])
def test_explicit_variants_outside_identifiers_are_preserved(content, code, color, size):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["product_code"] == code
    assert result["color"] == color
    assert result["size"] == size
    assert result["quantity"] == 2
    assert result["decision"] == "purchase_candidate"
    assert result["raw"] == content


@pytest.mark.parametrize("content,code,size", [
    ("Chốt CAM-12 2 cái, cam-12", "CAM-12", None),
    ("Chốt SKU-123-XL sku-123-xl size M 2 cái", "SKU-123-XL", "M"),
])
def test_all_occurrences_of_a_repeated_identifier_are_isolated(content, code, size):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["product_code"] == code
    assert result["color"] is None
    assert result["size"] == size
    assert result["quantity"] == 2
    assert result["decision"] == "purchase_candidate"


@pytest.mark.parametrize("form", ["NFC", "NFD"])
@pytest.mark.parametrize("text,code,color,size", [
    ("Chốt màu hồng L-12 size M 2 cái", "L-12", "hồng", "M"),
    ("Chốt CAM-12 màu be size M 2 cái", "CAM-12", "be", "M"),
    ("Chốt CAM-12 màu xanh dương size XL 2 cái", "CAM-12", "xanh dương", "XL"),
])
def test_unicode_normalization_keeps_variant_positions_and_raw(form, text, code, color, size):
    content = unicodedata.normalize(form, text)
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["product_code"] == code
    assert result["color"] == color
    assert result["size"] == size
    assert result["quantity"] == 2
    assert result["decision"] == "purchase_candidate"
    assert result["raw"] == content


@pytest.mark.parametrize("content,color", [
    ("Chốt CAM-12 màu xanh\t dương 2 cái", "xanh dương"),
    ("Chốt BE-12 màu xanh   lá 2 cái", "xanh lá"),
    ("Chốt xanh CAM-12 dương 2 cái", "xanh"),
])
def test_multiword_colors_do_not_join_across_an_identifier(content, color):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["color"] == color
    assert result["size"] is None
    assert result["decision"] == "purchase_candidate"


@pytest.mark.parametrize("content", [
    "Chốt CAM-12 đỏ hoặc đen 2 cái",
    "Chốt SKU-123-CAM-XL đỏ hay đen 2 cái",
    "Chốt CAM-12 xanh dương hay xanh lá 2 cái",
])
def test_a1_alternative_color_guard_still_precedes_variant_extraction(content):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["ambiguous_color"]
    assert result["color"] is None
    assert result["size"] is None
    assert result["raw"] == content


@pytest.mark.parametrize("content,color", [
    ("Chốt CAM-12 hoặc đỏ 2 cái", "đỏ"),
    ("Chốt SKU-123-CAM hay be 2 cái", "be"),
])
def test_identifier_color_is_not_an_alternative_to_an_external_color(content, color):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["color"] == color
    assert result["size"] is None
    assert result["decision"] == "purchase_candidate"
    assert result["reason_codes"] == []


@pytest.mark.parametrize("tail", ["sl: 2..5 cái", "sl: 2,,5 cái", "-+2 cái"])
def test_a2_invalid_quantities_do_not_expose_identifier_variants(tail):
    content = f"Chốt SKU-123-CAM-XL {tail}"
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["product_code"] == "SKU-123-CAM-XL"
    assert result["quantity"] is None
    assert result["color"] is None
    assert result["size"] is None
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["invalid_quantity"]


@pytest.mark.parametrize("code", ["CAM-12", "SKU-123-XL"])
def test_compact_quantities_still_use_the_original_complete_identifier(code):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(f"Chốt {code} 2")
    ai.assert_not_called()
    assert result["product_code"] == code
    assert result["quantity"] == 2
    assert result["color"] is None
    assert result["size"] is None
    assert result["decision"] == "purchase_candidate"


@pytest.mark.parametrize("code", ["CAM-12", "SKU-123-XL"])
def test_missing_quantity_is_not_replaced_by_an_identifier_variant(code):
    content = f"Chốt {code}"
    result = parse_purchase_intent(content, use_ai=False)
    assert result["product_code"] == code
    assert result["color"] is None
    assert result["size"] is None
    assert result["quantity"] is None
    assert result["decision"] == "needs_clarification"
    assert "missing_quantity" in result["reason_codes"]
    assert result["raw"] == content


@pytest.mark.parametrize("text,code,color,size,reason", [
    ("Chốt CAM-12 2 cái", "CAM-12", None, None, None),
    ("Chốt L-12 2 cái", "L-12", None, None, None),
    ("Chốt SKU-123-XL 2 cái", "SKU-123-XL", None, None, None),
    ("Chốt CAM-12 màu đỏ 2 cái", "CAM-12", "đỏ", None, None),
    ("Chốt SKU-123-XL size M 2 cái", "SKU-123-XL", None, "M", None),
    ("Chốt SP-CAM-012-XL màu be size M 2 cái", "SP-CAM-012-XL", "be", "M", None),
    (unicodedata.normalize("NFD", "Chốt màu hồng L-12 size M 2 cái"), "L-12", "hồng", "M", None),
    ("Chốt CAM-12 đỏ hoặc đen 2 cái", None, None, None, "ambiguous_color"),
    ("Chốt SKU-123-CAM-XL sl: 2..5 cái", "SKU-123-CAM-XL", None, None, "invalid_quantity"),
])
def test_variant_isolation_preserves_processor_context(monkeypatch, text, code, color, size, reason):
    client = Mock(side_effect=AssertionError("No real AI client may be created"))
    monkeypatch.setattr(gemini_client, "_get_client", client)
    root = Path(__file__).resolve().parents[3]
    source = json.loads((root / "contracts/examples/comment-created.v1.json").read_text(encoding="utf-8"))
    source["content"] = text

    result = process_comment_event(source)

    client.assert_not_called()
    assert result["status"] == "ok"
    for field in ("event_id", "comment_id", "session_id", "customer_id"):
        assert result[field] == source[field]
    assert result["content"] == text
    assert result["intent"]["raw"] == text
    assert result["intent"]["product_code"] == code
    assert result["intent"]["color"] == color
    assert result["intent"]["size"] == size
    assert result["intent"]["decision"] == ("needs_clarification" if reason else "purchase_candidate")
    assert result["intent"]["reason_codes"] == ([reason] if reason else [])
    assert result["intent"]["quantity"] == (None if reason else 2)
