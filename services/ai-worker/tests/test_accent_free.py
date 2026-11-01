"""
Tests for comments typed without Vietnamese diacritics.

Phone keyboards often drop accents ("chot", "2 cai", "khong mua"). Each
rule must behave exactly like its accented twin: same decision, same
reason code, same AI routing.
"""

from unittest.mock import patch

import pytest

from parse_intent import parse_purchase_intent
from quantity_parser import extract_quantity


@pytest.mark.parametrize("content,expected", [
    ("2 cai", 2),
    ("3 chiec", 3),
    ("1 bo", 1),
    ("2 doi", 2),
    ("4 cap", 4),
    ("2 san pham", 2),
    ("so luong 5", 5),
    ("sl: 5", 5),
])
def test_unaccented_units_and_labels_count(content, expected):
    assert extract_quantity(content, None).value == expected


def test_unaccented_compact_form_counts():
    # '<mua> <mã> <số>' không dấu, giống "Chốt A12 2".
    assert extract_quantity("chot a12 2", "A12").value == 2


@pytest.mark.parametrize("content", [
    "Chot A12 2 cai",
    "chot a12 2 chiec nhe",
    "dat A12 2 cai",
    "Mua A12 2 cai",
])
def test_unaccented_clear_orders_take_the_regex_path(content):
    with patch("parse_intent._try_ai", side_effect=AssertionError("AI must not be called")):
        result = parse_purchase_intent(content)
    assert result["decision"] == "purchase_candidate"
    assert result["source"] == "regex"
    assert result["product_code"] == "A12"
    assert result["quantity"] == 2


@patch("parse_intent._try_ai")
def test_weak_keyword_with_unaccented_unit_reaches_the_ai(mock_ai):
    # Câu khách gõ thật trên UI: trước đây bị chặn ở "thiếu số lượng".
    mock_ai.return_value = {
        "has_intent": True, "confidence": "high", "source": "openai",
        "product_code": "A12-DEN-M", "color": None, "size": None, "quantity": 2,
        "raw": "cho anh 2 cai ao A12-DEN-M xem nao",
    }
    result = parse_purchase_intent("cho anh 2 cai ao A12-DEN-M xem nao")
    mock_ai.assert_called_once()
    assert result["decision"] == "purchase_candidate"
    assert result["quantity"] == 2


@patch("parse_intent._try_ai")
def test_lay_without_accent_is_a_weak_signal(mock_ai):
    mock_ai.return_value = {
        "has_intent": True, "confidence": "high", "source": "openai",
        "product_code": "A12", "color": None, "size": None, "quantity": 2, "raw": "lay a12 2 cai",
    }
    result = parse_purchase_intent("lay a12 2 cai")
    mock_ai.assert_called_once()
    assert result["decision"] == "purchase_candidate"


@pytest.mark.parametrize("content,decision,reason", [
    # Phủ định không dấu phải được nhận ra, nếu không "khong mua A12 2 cai"
    # sẽ thành đơn vì "mua" + mã + số lượng đủ điều kiện regex.
    ("khong mua A12 2 cai", "no_purchase", "explicit_negation"),
    ("Khong chot A12 nua", "no_purchase", "explicit_negation"),
    ("khong co mua A12 2 cai", "no_purchase", "explicit_negation"),
    ("Chot A12 2 cai, khong lay mau den", "needs_clarification", "ambiguous_negation"),
    # Câu hỏi không dấu.
    ("Mua A12 2 cai duoc khong", "needs_clarification", "ambiguous_question"),
    ("A12 con hang khong", "no_purchase", "question"),
    ("gia bao nhieu", "no_purchase", "question"),
    ("Chot A12 2 cai va B05 3 cai", "needs_clarification", "multiple_products"),
])
def test_unaccented_guards_match_accented_behaviour(content, decision, reason):
    with patch("parse_intent._try_ai", side_effect=AssertionError("AI must not be called")):
        result = parse_purchase_intent(content)
    assert result["decision"] == decision
    assert reason in result["reason_codes"]


def test_dung_and_cha_are_not_negations():
    # "dùng"/"cha" quá phổ biến để coi là "đừng"/"chả" khi không dấu.
    with patch("parse_intent._try_ai", side_effect=AssertionError("AI must not be called")):
        result = parse_purchase_intent("Chot A12 2 cai de dung cho cha")
    assert result["decision"] == "purchase_candidate"
