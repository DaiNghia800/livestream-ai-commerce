"""
AI-first flow: with an AI key configured the AI decides everything the regex
fast path cannot settle, and it receives the livestream's product list.

Providers are mocked at parse_intent._try_ai; the catalogue fetch is mocked
at catalogue.httpx.get.
"""

from unittest.mock import MagicMock, patch

import httpx
import pytest

import catalogue
from catalogue import fetch_catalogue
from intent_policy import apply_ai_decision
from parse_intent import ai_available, parse_purchase_intent

SESSION = "f1524476-ab92-40c7-b7ec-e61f946b87a9"
CATALOGUE = [
    {"productCode": "SHIPDEMO-mve51bb3", "skuCode": "SHIPDEMO-mve51bb3-M",
     "productName": "Áo thun demo vận chuyển", "variantName": "M"},
    {"productCode": "A12", "skuCode": "A12-DEN-M", "productName": "Áo thun A12", "variantName": "Đen / M"},
]


def ai_says(kind, items, has_intent=None):
    return {
        "has_intent": kind == "purchase" if has_intent is None else has_intent,
        "confidence": "high", "source": "openai", "kind": kind, "items": items,
        "product_code": items[0]["product_code"] if items else None,
        "quantity": items[0]["quantity"] if items else None,
        "color": None, "size": None, "raw": "",
    }


@pytest.fixture(autouse=True)
def with_openai_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    catalogue.clear_cache()
    yield
    catalogue.clear_cache()


class TestAvailability:
    def test_key_present_means_ai_first(self):
        assert ai_available() is True

    def test_without_any_key_falls_back_to_regex_only(self, monkeypatch):
        monkeypatch.delenv("OPENAI_API_KEY")
        assert ai_available() is False


class TestRouting:
    @patch("parse_intent.fetch_catalogue", return_value=CATALOGUE)
    @patch("parse_intent._try_ai")
    def test_clear_order_never_pays_for_ai(self, mock_ai, _cat):
        result = parse_purchase_intent("Chốt A12 2 cái", session_id=SESSION)
        mock_ai.assert_not_called()
        assert result["decision"] == "purchase_candidate"
        assert result["source"] == "regex"

    @patch("parse_intent.fetch_catalogue", return_value=CATALOGUE)
    @patch("parse_intent._try_ai")
    def test_pure_chatter_is_dropped_without_ai(self, mock_ai, _cat):
        result = parse_purchase_intent("đẹp quá shop ơi", session_id=SESSION)
        mock_ai.assert_not_called()
        assert result["decision"] == "no_purchase"

    @pytest.mark.parametrize("content", [
        # Lưới regex cũ chặn: "hoi" (hơi), nhiều mã, câu hỏi, phủ định mập mờ.
        "shop co ve ban do ngon nhi, tao muon mua hoi nhieu ti, 100 cai SHIPDEMO-mve51bb3-M va 100 cai A12-DEN-M",
        "Chốt A12 2 cái và B05 3 cái",
        "mua A12 2 cái được không?",
        "Không lấy A12, lấy B05 2 cái",
        # Không có từ mua nhưng có số / mã.
        "SHIPDEMO-mve51bb3-M 5 cái nữa",
        "a nham 10 cai",
        # Tên sản phẩm thay vì mã.
        "ok the cho 5 cai ao thun demo de",
    ])
    @patch("parse_intent.fetch_catalogue", return_value=CATALOGUE)
    @patch("parse_intent._try_ai")
    def test_everything_else_goes_to_the_ai_with_the_catalogue(self, mock_ai, mock_cat, content):
        mock_ai.return_value = ai_says("purchase", [{"product_code": "A12-DEN-M", "quantity": 2}])
        parse_purchase_intent(content, session_id=SESSION)
        mock_ai.assert_called_once()
        assert mock_ai.call_args.args[0] == content
        assert mock_ai.call_args.args[1] == CATALOGUE
        mock_cat.assert_called_once_with(SESSION)

    @patch("parse_intent._try_ai")
    def test_without_session_the_ai_gets_an_empty_catalogue(self, mock_ai):
        mock_ai.return_value = ai_says("purchase", [{"product_code": "A12", "quantity": 1}])
        parse_purchase_intent("lấy a12 1 cái")
        assert mock_ai.call_args.args[1] == []


class TestDecisions:
    def test_two_products_become_two_items(self):
        result = apply_ai_decision(ai_says("purchase", [
            {"product_code": "SHIPDEMO-mve51bb3-M", "quantity": 100},
            {"product_code": "A12-DEN-M", "quantity": 100},
        ]))
        assert result["decision"] == "purchase_candidate"
        assert [i["product_code"] for i in result["items"]] == ["SHIPDEMO-mve51bb3-M", "A12-DEN-M"]
        # Trường phẳng = item đầu, cho hợp đồng cũ.
        assert result["product_code"] == "SHIPDEMO-mve51bb3-M"
        assert result["quantity"] == 100

    def test_one_item_without_quantity_asks_for_clarification(self):
        result = apply_ai_decision(ai_says("purchase", [
            {"product_code": "A12-DEN-M", "quantity": 2},
            {"product_code": "SHIPDEMO-mve51bb3-M", "quantity": None},
        ]))
        assert result["decision"] == "needs_clarification"
        assert result["reason_codes"] == ["missing_quantity"]

    def test_name_the_ai_could_not_map_is_missing_product_code(self):
        result = apply_ai_decision(ai_says("purchase", [{"product_code": None, "quantity": 5}]))
        assert result["decision"] == "needs_clarification"
        assert result["reason_codes"] == ["missing_product_code"]

    def test_question_with_product_needs_confirmation(self):
        result = apply_ai_decision(ai_says("question", [{"product_code": "A12", "quantity": 2}], has_intent=True))
        assert result["decision"] == "needs_clarification"
        assert result["reason_codes"] == ["ambiguous_question"]

    def test_plain_question_is_not_a_purchase(self):
        result = apply_ai_decision(ai_says("question", [], has_intent=False))
        assert result["decision"] == "no_purchase"
        assert result["reason_codes"] == ["question"]

    def test_other_is_not_a_purchase(self):
        result = apply_ai_decision(ai_says("other", [{"product_code": "A12", "quantity": 2}], has_intent=False))
        assert result["decision"] == "no_purchase"
        assert result["has_intent"] is False

    def test_zero_quantity_is_invalid(self):
        result = apply_ai_decision(ai_says("purchase", [{"product_code": "A12", "quantity": 0}]))
        assert result["reason_codes"] == ["invalid_quantity"]

    def test_legacy_single_product_result_still_works(self):
        # Helper cũ trả dạng phẳng, không có items/kind.
        legacy = {"has_intent": True, "confidence": "high", "source": "gemini",
                  "product_code": "B05", "quantity": 1, "color": None, "size": None, "raw": "Mua B05"}
        result = apply_ai_decision(legacy)
        assert result["decision"] == "purchase_candidate"
        assert result["items"] == [{"product_code": "B05", "quantity": 1, "color": None, "size": None}]


class TestCatalogue:
    @patch("catalogue.httpx.get")
    def test_fetches_products_from_commerce_and_caches(self, mock_get, monkeypatch):
        monkeypatch.setenv("COMMERCE_API_URL", "http://commerce.test/")
        mock_get.return_value = MagicMock(json=lambda: {"data": CATALOGUE}, raise_for_status=lambda: None)
        assert fetch_catalogue(SESSION) == CATALOGUE
        assert fetch_catalogue(SESSION) == CATALOGUE
        mock_get.assert_called_once()
        assert mock_get.call_args.args[0] == f"http://commerce.test/api/livestreams/{SESSION}/products"

    @patch("catalogue.httpx.get", side_effect=httpx.ConnectError("down"))
    def test_unreachable_commerce_means_empty_catalogue(self, _get):
        assert fetch_catalogue(SESSION) == []

    @patch("catalogue.httpx.get")
    def test_http_error_means_empty_catalogue(self, mock_get):
        def boom():
            raise httpx.HTTPStatusError("500", request=MagicMock(), response=MagicMock())
        mock_get.return_value = MagicMock(raise_for_status=boom)
        assert fetch_catalogue(SESSION) == []
