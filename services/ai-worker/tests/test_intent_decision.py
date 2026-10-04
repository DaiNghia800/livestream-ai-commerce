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
    ("Chốt đen size M 2 cái", "needs_clarification", "missing_product_code"),
    ("Chốt A12 0 cái", "needs_clarification", "invalid_quantity"),
    ("Chốt A12 2 cái", "purchase_candidate", None),
    ("Chốt A12 đen size M 2 cái", "purchase_candidate", None),
    ("Đẹp quá", "no_purchase", "no_purchase_intent"),
])
def test_regex_result_receives_business_decision(content, decision, reason):
    result = parse_purchase_intent(content, use_ai=False)
    assert result["decision"] == decision
    assert result["reason_codes"] == ([] if reason is None else [reason])


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
