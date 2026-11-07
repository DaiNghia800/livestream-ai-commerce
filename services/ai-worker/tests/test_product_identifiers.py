"""Complete identifier regressions with all AI access forbidden."""

from unittest.mock import patch

import pytest

from parse_intent import parse_purchase_intent


@pytest.mark.parametrize("code", [
    "A12", "SP05", "SP-05", "SKU-1234", "CAM12",
    "SP-POLO-012", "SP-LINEN-001", "LINEN-01", "ABCDE1", "SKU-123456",
    "AO01-TRA-FORMRONG", "AT99-DEN-HE2023", "SKU-123-XL",
    "A" * 47 + "123",
])
def test_complete_identifiers_are_preserved_without_ai(code):
    content = f"Chốt {code} 2 cái"
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == code
    assert result["quantity"] == 2
    assert result["reason_codes"] == []
    assert result["raw"] == content


@pytest.mark.parametrize("token,expected", [
    ("(SP-POLO-012),", "SP-POLO-012"),
    ("[SP-LINEN-001]", "SP-LINEN-001"),
    ("SP-POLO-012.", "SP-POLO-012"),
    ("sp-polo-001", "SP-POLO-001"),
])
def test_identifier_punctuation_and_case_preserve_the_full_code(token, expected):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(f"Chốt {token} 2 cái")
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == expected


@pytest.mark.parametrize("token", [
    "A12_B05", "A12--B05", "A12/RED", "A12.RED", "đA12", "A12đ",
    "AO01TFORMRONG", "AO-SM-LUA", "A" * 48 + "123",
    "SP-POLO-012XYZ", "SP-LINEN-001/RED", "SP-LINEN-001_OLD",
    "_A12_", "A12+RED",
])
def test_unsupported_identifiers_are_not_truncated_or_repaired(token):
    content = f"Chốt {token} 2 cái"
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["product_code"] is None
    assert "missing_product_code" in result["reason_codes"]
    assert result["raw"] == content


@pytest.mark.parametrize("unsupported", [
    "AO01TFORMRONG", "SP-POLO-012XYZ", "A12/RED",
])
def test_a_supported_code_does_not_hide_an_unsupported_identifier(unsupported):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(f"Chốt A12 và {unsupported} 2 cái")
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["product_code"] is None
    assert "missing_product_code" in result["reason_codes"]


@pytest.mark.parametrize("content,code", [
    ("Chốt SP-POLO-012 sp-polo-012 2 cái", "SP-POLO-012"),
    ("Chốt AO01-TRA-FORMRONG 2 cái, ao01-tra-formrong", "AO01-TRA-FORMRONG"),
])
def test_repeated_full_identifiers_count_as_one_product(content, code):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == code
    assert result["quantity"] == 2


def test_repeated_identifiers_do_not_add_quantities():
    content = "Chốt SP-POLO-012 2 cái, SP-POLO-012 3 cái"
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["ambiguous_quantity"]
    assert result["quantity"] is None


@pytest.mark.parametrize("content", [
    "Chốt A12 B05 2 cái",
    "Chốt SP-POLO-012 XX-POLO-012 2 cái",
    "Chốt AO01-TRA-FORMRONG AO01-DEN-FORMRONG 2 cái",
    "Cho A12 B05 2 cái",
    "Cho SP-POLO-012 XX-POLO-012 2 cái",
])
def test_distinct_full_identifiers_require_clarification_without_ai(content):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["multiple_products"]
    assert result["product_code"] is None
    assert result["quantity"] is None
    assert result["raw"] == content


@pytest.mark.parametrize("tail,quantity", [
    ("2", 2), ("sl: 3", 3), ("2cái", 2),
    ("giá 200k, 2 cái", 2), ("12", 12), ("sl: 3, màu đen", 3),
])
def test_complete_identifiers_preserve_quantity_syntax(tail, quantity):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(f"Chốt SP-POLO-012 {tail}")
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == "SP-POLO-012"
    assert result["quantity"] == quantity


@pytest.mark.parametrize("tail,reason", [
    ("đỏ hoặc đen 2 cái", "ambiguous_color"),
    ("đỏ hay đen 2 cái", "ambiguous_color"),
    ("sl: 2..5 cái", "invalid_quantity"),
    ("sl: 2,,5 cái", "invalid_quantity"),
    ("-+2 cái", "invalid_quantity"),
])
def test_complete_identifiers_preserve_a1_a2_guards(tail, reason):
    content = f"Chốt SP-POLO-012 {tail}"
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == [reason]
    assert result["quantity"] is None
    assert result["raw"] == content


@pytest.mark.parametrize("content", [
    "Chốt A12 ship-nhanh 2 cái",
    "Chốt A12 giao-hàng 2 cái",
    "Chốt A12 web-cam 2 cái",
    "CHỐT A12 SHIP-NHANH 2 CÁI",
    "Chốt A12 2 cái, cảm ơn shop",
    "Chốt A12 giá 200k, 2 cái",
    "Chốt A12 +2cái",
])
def test_conversational_text_and_numbers_are_not_unsupported_identifiers(content):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == "A12"
    assert result["quantity"] == 2


@pytest.mark.parametrize("content", [
    "AO01TFORMRONG đẹp quá", "SP-POLO-012 đẹp quá",
])
def test_identifiers_without_purchase_evidence_remain_no_purchase(content):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "no_purchase"
    assert result["raw"] == content


@pytest.mark.parametrize("content,expected_code,expected_qty,expected_size,expected_color", [
    ("chốt cho em mã 1 2 cái size L", "MÃ 1", 2, "L", None),
    ("Chốt mã 2 1 cái", "MÃ 2", 1, None, None),
    ("Chốt mã 4 màu đen size M 2 cái", "MÃ 4", 2, "M", "đen"),
    ("Chốt ma 2 1 cái", "MÃ 2", 1, None, None),
    ("Chốt ma 4 màu đen 2 cái", "MÃ 4", 2, None, "đen"),
    ("Chốt mã số 2 1 cái", "MÃ 2", 1, None, None),
    ("Chốt ma so 4 2 cái", "MÃ 4", 2, None, None),
    ("Chốt mã2 1 cái", "MÃ 2", 1, None, None),
    ("Chốt ma4 1 cái", "MÃ 4", 1, None, None),
    ("Chốt mã: 2 1 cái", "MÃ 2", 1, None, None),
    ("Chốt mã-4 1 cái", "MÃ 4", 1, None, None),
    ("Chốt mã 2 2", "MÃ 2", 2, None, None),
    ("Chốt cho em mã 1 2", "MÃ 1", 2, None, None),
    ("Chốt ma 2 5", "MÃ 2", 5, None, None),
])
def test_vietnamese_numeric_product_codes_are_recognized(
    content, expected_code, expected_qty, expected_size, expected_color
):
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == expected_code
    assert result["quantity"] == expected_qty
    assert result["size"] == expected_size
    assert result["color"] == expected_color
    assert result["reason_codes"] == []


def test_multiple_vietnamese_numeric_codes_fail_safely():
    with patch("parse_intent._try_gemini", side_effect=AssertionError("AI forbidden")) as ai:
        result = parse_purchase_intent("Chốt mã 1 và mã 2 1 cái")
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert "multiple_products" in result["reason_codes"]

