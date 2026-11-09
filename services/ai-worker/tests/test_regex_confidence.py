"""
Regex confidence must never be "high" without a product code.

Quantity + size alone cannot become an order, so such comments go to the
AI, which can read product codes the regex does not know (long SKU codes
such as SHIPDEMO-mve51bb3-M).
"""

from unittest.mock import patch

import pytest

from parse_intent import _regex_parse, parse_purchase_intent


@pytest.mark.parametrize("content", [
    # Câu khách gõ thật: từ mua + 5 cái + size M (đuôi -M của mã), nhưng mã dài
    # regex không bắt được. Trước đây bị coi là "chắc" và từ chối không hỏi AI.
    "tao se vi em ma mua 5 cai SHIPDEMO-mve51bb3-M",
    "Chốt SHIPDEMO-mve51bb3-M 2 cái",
    "mua 2 cái size M màu đen",
])
def test_no_product_code_is_never_high_confidence(content):
    result, _ = _regex_parse(content)
    assert result["has_intent"] is True
    assert result["product_code"] is None
    assert result["confidence"] == "low"


@patch("parse_intent._try_ai")
def test_long_sku_code_is_handed_to_the_ai(mock_ai):
    mock_ai.return_value = {
        "has_intent": True, "confidence": "high", "source": "openai",
        "product_code": "SHIPDEMO-mve51bb3-M", "color": None, "size": "M", "quantity": 5,
        "raw": "tao se vi em ma mua 5 cai SHIPDEMO-mve51bb3-M",
    }
    result = parse_purchase_intent("tao se vi em ma mua 5 cai SHIPDEMO-mve51bb3-M")
    mock_ai.assert_called_once()
    assert result["decision"] == "purchase_candidate"
    assert result["product_code"] == "SHIPDEMO-mve51bb3-M"
    assert result["quantity"] == 5


def test_code_plus_quantity_with_buy_keyword_stays_high():
    # Đường nhanh không đổi: mã ngắn + số lượng + từ mua vẫn không tốn lượt AI.
    with patch("parse_intent._try_ai", side_effect=AssertionError("AI must not be called")):
        result = parse_purchase_intent("Chốt A12 2 cái")
    assert result["decision"] == "purchase_candidate"
    assert result["source"] == "regex"
