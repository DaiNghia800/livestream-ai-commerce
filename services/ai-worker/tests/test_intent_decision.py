"""Business decision regressions with the AI dependency isolated."""

from unittest.mock import patch

import pytest

from parse_intent import parse_purchase_intent


@pytest.mark.parametrize("content,decision,reason", [
    ("Không mua A12 đen", "no_purchase", "explicit_negation"),
    ("KHÔNG MUA A12 đen", "no_purchase", "explicit_negation"),
    ("Không   mua A12 đen", "no_purchase", "explicit_negation"),
    ("Em không muốn mua A12 đen", "no_purchase", "explicit_negation"),
    ("Đừng chốt A12 cho em", "no_purchase", "explicit_negation"),
    ("Chưa lấy A12 2 cái", "no_purchase", "explicit_negation"),
    ("Chẳng đặt A12 đen", "no_purchase", "explicit_negation"),
    ("A12 đen còn không?", "no_purchase", "question"),
    ("A12 giá bao nhiêu", "no_purchase", "question"),
    ("Cho em hỏi A12 màu đen", "no_purchase", "question"),
    ("A12 còn hàng không ạ", "no_purchase", "question"),
    ("Mua A12 2 cái được không?", "needs_clarification", "ambiguous_question"),
    ("Chốt A12 2 cái, còn màu đen không?", "needs_clarification", "ambiguous_question"),
    ("Không mua A12 à?", "needs_clarification", "ambiguous_question"),
    ("Không lấy A12, lấy B05 2 cái", "needs_clarification", "ambiguous_negation"),
    ("Chốt A12 2 cái, không lấy màu đen", "needs_clarification", "ambiguous_negation"),
    ("Chốt A12 không đen 2 cái", "needs_clarification", "ambiguous_negation"),
    ("Không phải không mua A12", "needs_clarification", "ambiguous_negation"),
    ("Chốt A12 nếu còn hàng", "needs_clarification", "conditional_purchase"),
    ("Cho em A12 không đen 2 cái", "needs_clarification", "ambiguous_negation"),
    ("Cho em A12 2 cái được không?", "needs_clarification", "ambiguous_question"),
    ("Chốt A12 2 cái à", "needs_clarification", "ambiguous_question"),
    ("Chốt A12 2 cái và B05 3 cái", "needs_clarification", "multiple_products"),
])
def test_guarded_language_never_calls_ai(content, decision, reason):
    with patch("parse_intent._try_gemini") as ai:
        result = parse_purchase_intent(content)
    assert result["decision"] == decision
    assert result["reason_codes"] == [reason]
    assert result["has_intent"] is (decision != "no_purchase")
    assert result["product_code"] is None
    assert result["quantity"] is None
    assert result["raw"] == content
    ai.assert_not_called()


@pytest.mark.parametrize("content,decision,reason", [
    ("Chốt A12 đen", "needs_clarification", "missing_quantity"),
    # Không có mã thì regex không được "chắc": tắt AI nên thêm uncertain_intent.
    ("Chốt đen size M 2 cái", "needs_clarification", ["missing_product_code", "uncertain_intent"]),
    ("Chốt A12 0 cái", "needs_clarification", "invalid_quantity"),
    ("Chốt A12 2 cái", "purchase_candidate", None),
    ("Chốt A12 đen size M 2 cái", "purchase_candidate", None),
    ("Đẹp quá", "no_purchase", "no_purchase_intent"),
])
def test_regex_result_receives_business_decision(content, decision, reason):
    result = parse_purchase_intent(content, use_ai=False)
    assert result["decision"] == decision
    expected = [] if reason is None else (reason if isinstance(reason, list) else [reason])
    assert result["reason_codes"] == expected


@pytest.mark.parametrize("fields,decision,reason", [
    ({"quantity": None}, "needs_clarification", "missing_quantity"),
    ({"quantity": 0}, "needs_clarification", "invalid_quantity"),
    ({"quantity": -1}, "needs_clarification", "invalid_quantity"),
    ({"quantity": True}, "needs_clarification", "invalid_quantity"),
    ({"product_code": "  "}, "needs_clarification", "missing_product_code"),
    ({}, "purchase_candidate", None),
    ({"has_intent": False}, "no_purchase", "no_purchase_intent"),
])
def test_gemini_result_uses_same_decision_policy(fields, decision, reason):
    reply = {"has_intent": True, "confidence": "high", "source": "gemini",
             "product_code": "B05", "quantity": 2, "color": None,
             "size": None, "raw": "Mua B05"}
    reply.update(fields)
    with patch("parse_intent._try_gemini", return_value=reply) as ai:
        result = parse_purchase_intent("Mua B05")
    assert result["decision"] == decision
    assert result["reason_codes"] == ([] if reason is None else [reason])
    ai.assert_called_once_with("Mua B05")


def test_offline_low_confidence_is_not_a_purchase_candidate():
    result = parse_purchase_intent("Lấy A12 2 cái", use_ai=False)
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["uncertain_intent"]


def test_decomposed_unicode_negation_is_recognized():
    import unicodedata
    content = unicodedata.normalize("NFD", "Không mua A12 đen")
    with patch("parse_intent._try_gemini") as ai:
        result = parse_purchase_intent(content)
    assert result["decision"] == "no_purchase"
    assert result["reason_codes"] == ["explicit_negation"]
    ai.assert_not_called()


def test_repeated_product_code_is_not_multiple_products():
    result = parse_purchase_intent("Chốt A12 2 cái, A12 đen", use_ai=False)
    assert result["decision"] == "purchase_candidate"
    assert result["reason_codes"] == []

@pytest.mark.parametrize("content", [
    pytest.param("Chốt A12 đỏ hoặc đen 2 cái", id="colors-with-hoac"),
    pytest.param("Chốt A12 màu đỏ hay đen 2 cái", id="colors-with-hay"),
])
def test_alternative_colors_require_clarification_without_ai(content):
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("AI must not choose an alternative color")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["has_intent"] is True
    assert result["color"] is None
    assert "ambiguous_color" in result["reason_codes"]
    assert result["raw"] == content


@pytest.mark.parametrize("content,color,size", [
    pytest.param("Chốt A12 màu đỏ 2 cái", "đỏ", None, id="single-red"),
    pytest.param("Chốt A12 màu đen 2 cái", "đen", None, id="single-black"),
    pytest.param("Chốt A12 màu đỏ, size L, 2 cái", "đỏ", "L",
                 id="single-color-with-size"),
])
def test_single_color_remains_a_purchase_candidate(content, color, size):
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("No AI call expected for a complete comment")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == "A12"
    assert result["color"] == color
    assert result["size"] == size
    assert result["quantity"] == 2
    assert result["reason_codes"] == []
    assert result["raw"] == content


@pytest.mark.parametrize("content", [
    "Chốt A12 đỏ hay đen 2 cái",
    "Chốt A12 xanh dương hoặc đen 2 cái",
    "Chốt A12 xanh dương hay xanh lá 2 cái",
    "Chốt A12 đỏ hoặc màu đen 2 cái",
    "Chốt A12 đỏ hoặc đỏ hoặc đen 2 cái",
    "Cho A12 đỏ hay đen 2 cái",
    "CHỐT A12 ĐỎ   HOẶC\tĐEN 2 cái",
])
def test_explicit_color_alternatives_never_reach_ai(content):
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("AI must not select a color")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["ambiguous_color"]
    assert result["has_intent"] is True
    assert result["color"] is None
    assert result["raw"] == content


def test_decomposed_unicode_color_alternatives_preserve_raw():
    import unicodedata

    content = unicodedata.normalize("NFD", "Chốt A12 đỏ hoặc đen 2 cái")
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("AI must not select a color")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["ambiguous_color"]
    assert result["color"] is None
    assert result["raw"] == content


@pytest.mark.parametrize("content,product_code,color", [
    ("Chốt A12 màu xanh dương 2 cái", "A12", "xanh dương"),
    ("Chốt CAM12 màu đỏ 2 cái", "CAM12", "đỏ"),
    ("Chốt CAM12 hay đỏ 2 cái", "CAM12", "đỏ"),
    ("Chốt A12 đỏ 2 cái hoặc giao hôm nay", "A12", "đỏ"),
    ("Chốt A12 màu đỏ hoặc đỏ 2 cái", "A12", "đỏ"),
])
def test_color_guard_preserves_unambiguous_purchases(content, product_code, color):
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("No AI call expected")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "purchase_candidate"
    assert result["reason_codes"] == []
    assert result["product_code"] == product_code
    assert result["color"] == color
    assert result["quantity"] == 2
    assert result["raw"] == content


def test_color_alternatives_without_purchase_evidence_remain_no_purchase():
    content = "Đỏ hoặc đen đều đẹp"
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("No AI call expected")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "no_purchase"
    assert result["has_intent"] is False
    assert result["raw"] == content
