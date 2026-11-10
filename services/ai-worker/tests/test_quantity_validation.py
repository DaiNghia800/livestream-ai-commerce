"""Quantity regressions at the parser and SDK schema boundaries."""

from unittest.mock import patch

import pytest
from pydantic import ValidationError

from gemini_client import PurchaseIntentSchema
from parse_intent import parse_purchase_intent


@pytest.mark.parametrize("content,quantity", [
    ("Chốt A12 2 cái", 2),
    ("Chốt A12 12", 12),
    ("Chốt SP-05 5", 5),
    ("Chốt A12 số lượng: 3", 3),
    ("Chốt A12 sl=4", 4),
    ("Chốt A12 2 sản phẩm", 2),
    ("Chốt A12 2cái", 2),
    ("Chốt A12 2 cái giá 200000", 2),
    ("Chốt A12 giá 200k, 2 cái", 2),
    ("Chốt A12 size 38, 2 cái", 2),
])
def test_explicit_quantity_is_preserved(content, quantity):
    result = parse_purchase_intent(content, use_ai=False)
    assert result["quantity"] == quantity
    assert result["decision"] == "purchase_candidate"


@pytest.mark.parametrize("content,reason", [
    ("Chốt A12 giá 200000", "missing_quantity"),
    ("Chốt A12 200k", "missing_quantity"),
    ("Chốt A12 200000 đồng", "missing_quantity"),
    ("Chốt A12 size 38", "missing_quantity"),
    ("Chốt A12 lúc 20 giờ", "missing_quantity"),
    ("Chốt A12 -2 cái", "invalid_quantity"),
    ("Chốt A12 −2 cái", "invalid_quantity"),
    ("Chốt A12 - 2 cái", "invalid_quantity"),
    ("Chốt A12 0 cái", "invalid_quantity"),
    ("Chốt A12 1.5 cái", "invalid_quantity"),
    ("Chốt A12 1,5 cái", "invalid_quantity"),
    ("Chốt A12 1/2 cái", "invalid_quantity"),
    ("Chốt A12 2e3 cái", "invalid_quantity"),
    ("Chốt A12 -2", "invalid_quantity"),
    ("Chốt A12 1.5", "invalid_quantity"),
    ("Chốt A12 số lượng: -2", "invalid_quantity"),
    ("Chốt A12 2 cái hoặc 3 cái", "ambiguous_quantity"),
    ("Chốt A12 1 cái và 1 cái", "ambiguous_quantity"),
    ("Chốt A12 1 500 cái", "ambiguous_quantity"),
])
def test_uncertain_quantity_never_becomes_a_candidate_or_calls_ai(content, reason):
    with patch("parse_intent._try_gemini") as ai:
        result = parse_purchase_intent(content)
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == [reason]
    assert result["quantity"] is None or result["quantity"] <= 0
    ai.assert_not_called()


@pytest.mark.parametrize("quantity", [True, False, "2", "", 2.0, 2.5, [], {}])
def test_sdk_schema_rejects_wrong_quantity_types(quantity):
    with pytest.raises(ValidationError):
        PurchaseIntentSchema.model_validate({"has_intent": True, "quantity": quantity})


@pytest.mark.parametrize("has_intent", [1, 0, "true", "false"])
def test_sdk_schema_rejects_wrong_intent_types(has_intent):
    with pytest.raises(ValidationError):
        PurchaseIntentSchema.model_validate({"has_intent": has_intent})


@pytest.mark.parametrize("quantity", [None, 2, 0, -2])
def test_schema_keeps_integer_values_for_business_validation(quantity):
    result = PurchaseIntentSchema.model_validate({"has_intent": True, "quantity": quantity})
    assert result.quantity == quantity
    if quantity is not None:
        assert type(result.quantity) is int


@pytest.mark.parametrize("content", [
    "Chốt A12 .5 cái", "Chốt A12 ,5 cái",
    "Chốt A12 số lượng: 2abc", "Chốt A12 sl: 2/kg",
])
def test_malformed_numeric_tokens_are_not_partially_accepted(content):
    with patch("parse_intent._try_gemini") as ai:
        result = parse_purchase_intent(content)
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["invalid_quantity"]
    assert result["quantity"] is None
    ai.assert_not_called()


@pytest.mark.parametrize("content", [
    "Chốt A12 sl: 2..5 cái",
    "Chốt A12 sl: 2,,5 cái",
    "Chốt A12 -+2 cái",
    "Chốt A12 sl: 2..5",
    "Chốt A12 sl: 2,,5",
    "Chốt A12 2..5 cái",
    "Chốt A12 2,,5 cái",
    "Chốt A12 - +2 cái",
    "Chốt A12 +-2 cái",
    "Chốt A12 sl: 2./3 cái",
    "Chốt A12 sl: 2..5, 3 cái",
    "Chốt A12 sl: 2e+ cái",
    "Chốt A12 " + "9" * 101 + " cái",
])
def test_partial_numeric_tokens_require_clarification_without_ai(content):
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("AI must not repair a numeric token")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["decision"] == "needs_clarification"
    assert result["reason_codes"] == ["invalid_quantity"]
    assert result["quantity"] is None
    assert result["raw"] == content


@pytest.mark.parametrize("content,value,issue", [
    ("Chốt A12 2 cái", 2, None),
    ("Chốt A12 sl: 3", 3, None),
    ("Chốt A12 +2 cái", 2, None),
    ("Chốt A12 + 2 cái", 2, None),
    ("Chốt A12 0 cái", 0, "invalid_quantity"),
    ("Chốt A12 -2 cái", -2, "invalid_quantity"),
    ("Chốt A12 −2 cái", -2, "invalid_quantity"),
    ("Chốt A12 1.5 cái", None, "invalid_quantity"),
    ("Chốt A12 1,5 cái", None, "invalid_quantity"),
    ("Chốt A12 2e3 cái", None, "invalid_quantity"),
    ("Chốt A12 12", 12, None),
    ("Chốt A12 2.", 2, None),
    ("Chốt A12 sl: 3, màu đen", 3, None),
    ("Chốt A12 " + "9" * 100 + " cái", int("9" * 100), None),
    ("Chốt A12 giá 200k, 2 cái", 2, None),
    ("Chốt A12 giá 2..5k, 2 cái", 2, None),
])
def test_numeric_boundaries_preserve_supported_quantity_semantics(content, value, issue):
    from quantity_parser import extract_quantity

    quantity = extract_quantity(content, "A12")
    assert quantity.value == value
    assert quantity.issue == issue
    with patch("parse_intent._try_gemini",
               side_effect=AssertionError("No AI call expected")) as ai:
        result = parse_purchase_intent(content)
    ai.assert_not_called()
    assert result["quantity"] == value
    assert result["decision"] == (
        "needs_clarification" if issue else "purchase_candidate"
    )
    assert result["reason_codes"] == ([issue] if issue else [])
