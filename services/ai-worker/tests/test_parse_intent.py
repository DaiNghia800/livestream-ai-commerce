"""
Tests for parse_intent.parse_purchase_intent()

Test strategy:
  - REGEX TESTS: use_ai=False to test pure regex logic
  - KEYWORD DETECTION: strong vs weak keywords, no keywords
  - FIELD EXTRACTION: product code, color, size, quantity
  - CONFIDENCE SCORING: high vs low based on keyword + fields found
  - SOURCE TRACKING: verify "regex" vs "gemini" source field
  - GEMINI ROUTING UNIT TESTS: mock AI responses to test hybrid flow
  - BUG REGRESSION: "xanh dương" fix, "cho em hỏi" fix

Each test name follows: test_<what>_<condition>_<expected>
"""

import pytest
from unittest.mock import patch
from parse_intent import parse_purchase_intent


# ══════════════════════════════════════════════════════════════
# KEYWORD DETECTION (regex only)
# ══════════════════════════════════════════════════════════════

class TestKeywordDetection:
    """Tests for purchase keyword recognition."""

    @pytest.mark.parametrize("comment", [
        "Chốt A12 đen M",
        "Mua B05 trắng XL",
        "Order C3 hồng S",
        "Đặt D99 vàng L",
    ])
    def test_strong_keyword_detected(self, comment):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["has_intent"] is True

    @pytest.mark.parametrize("comment", [
        "Lấy A12 đen",
        "Cho em SP-99 hồng S",
    ])
    def test_weak_keyword_with_product_detected(self, comment):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["has_intent"] is True

    def test_weak_keyword_without_product_skipped(self):
        """'cho em hỏi giá' should NOT be detected as purchase intent."""
        result = parse_purchase_intent("Cho em hỏi giá", use_ai=False)
        assert result["has_intent"] is False

    @pytest.mark.parametrize("comment", [
        pytest.param("Border A12 2 cái", id="order_inside_border"),
        pytest.param("Chocolate A12 2 cái", id="cho_inside_chocolate"),
    ])
    def test_embedded_keyword_returns_no_purchase(self, comment):
        """A keyword inside another word is not purchase evidence."""
        with patch("parse_intent._try_gemini", side_effect=AssertionError("AI must not be called")) as ai:
            result = parse_purchase_intent(comment, use_ai=False)
        ai.assert_not_called()
        assert result["decision"] == "no_purchase"
        assert result["has_intent"] is False

    @pytest.mark.parametrize("comment", [
        "đorder A12 2 cái",
        "orderđ A12 2 cái",
        "order2 A12 2 cái",
        "_order_ A12 2 cái",
    ])
    def test_keyword_adjacent_to_word_characters_returns_no_purchase(self, comment):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["decision"] == "no_purchase"
        assert result["has_intent"] is False

    @pytest.mark.parametrize("comment", [
        "(ORDER), A12 2 cái",
        "[Cho] mình 2 cái A12",
    ])
    def test_standalone_keyword_with_punctuation_is_detected(self, comment):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["has_intent"] is True

    def test_decomposed_unicode_purchase_keyword_is_detected(self):
        import unicodedata

        comment = unicodedata.normalize("NFD", "Chốt A12 2 cái")
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["decision"] == "purchase_candidate"
        assert result["raw"] == comment

    @pytest.mark.parametrize("comment", [
        "Đẹp quá chị ơi",
        "Bao giờ live lại?",
        "Chào mọi người",
        "😍😍😍",
    ])
    def test_no_keyword_returns_no_intent(self, comment):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["has_intent"] is False


# ══════════════════════════════════════════════════════════════
# PRODUCT CODE EXTRACTION
# ══════════════════════════════════════════════════════════════

class TestProductCodeExtraction:
    """Tests for extracting product codes like A12, SP-05."""

    @pytest.mark.parametrize("comment,expected_code", [
        ("Chốt A12 đen", "A12"),
        ("Mua SP-05 trắng", "SP-05"),
        ("Đặt B7 vàng", "B7"),
        ("Order SKU-1234 hồng", "SKU-1234"),
    ])
    def test_product_code_extracted(self, comment, expected_code):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["product_code"] == expected_code

    def test_product_code_uppercased(self):
        result = parse_purchase_intent("Chốt sp-05 đen", use_ai=False)
        assert result["product_code"] == "SP-05"

    def test_no_product_code_returns_none(self):
        result = parse_purchase_intent("Mua cái áo đen", use_ai=False)
        assert result["product_code"] is None


# ══════════════════════════════════════════════════════════════
# COLOR EXTRACTION
# ══════════════════════════════════════════════════════════════

class TestColorExtraction:
    """Tests for color matching from KNOWN_COLORS list."""

    @pytest.mark.parametrize("comment,expected_color", [
        ("Chốt A12 đen", "đen"),
        ("Mua B05 trắng", "trắng"),
        ("Đặt C3 hồng", "hồng"),
    ])
    def test_simple_color_extracted(self, comment, expected_color):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["color"] == expected_color

    @pytest.mark.parametrize("comment", [
        pytest.param("Chốt A12 webcam 2 cái", id="inside_word"),
        pytest.param("Chốt CAM12 2 cái", id="inside_product_code"),
        pytest.param("Chốt A12 đcam 2 cái", id="unicode_prefix"),
        pytest.param("Chốt A12 camđ 2 cái", id="unicode_suffix"),
        pytest.param("Chốt cam2 2 cái", id="digit_suffix"),
        pytest.param("Chốt A12 _cam_ 2 cái", id="underscores"),
    ])
    def test_embedded_color_returns_none(self, comment):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["color"] is None
        assert result["raw"] == comment

    @pytest.mark.parametrize("comment,expected_color", [
        ("Chốt A12 màu (CAM) 2 cái", "cam"),
        ("Chốt A12 màu [XANH DƯƠNG] 2 cái", "xanh dương"),
    ])
    def test_standalone_color_with_punctuation_is_extracted(self, comment, expected_color):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["color"] == expected_color

    @pytest.mark.parametrize("color", ["đỏ", "hồng"])
    @pytest.mark.parametrize("form", ["NFC", "NFD"])
    def test_unicode_color_forms_are_equivalent(self, color, form):
        import unicodedata

        comment = unicodedata.normalize(form, f"Chốt A12 màu {color} 2 cái")
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["color"] == color
        assert result["raw"] == comment

    @pytest.mark.parametrize("color_text,expected_color", [
        ("xanh   dương", "xanh dương"),
        ("xanh\t dương", "xanh dương"),
        ("xanh   lá", "xanh lá"),
    ])
    def test_multiword_color_with_extra_whitespace_is_extracted(self, color_text, expected_color):
        comment = f"Chốt A12 {color_text} 2 cái"
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["color"] == expected_color
        assert result["raw"] == comment

    def test_xanh_duong_not_truncated_to_xanh(self):
        """Regression: 'xanh dương' should NOT match as just 'xanh'."""
        result = parse_purchase_intent("Chốt A12 xanh dương M", use_ai=False)
        assert result["color"] == "xanh dương"

    def test_xanh_la_extracted(self):
        result = parse_purchase_intent("Mua B05 xanh lá L", use_ai=False)
        assert result["color"] == "xanh lá"

    def test_plain_xanh_still_works(self):
        result = parse_purchase_intent("Chốt A12 xanh M", use_ai=False)
        assert result["color"] == "xanh"

    def test_no_color_returns_none(self):
        result = parse_purchase_intent("Chốt A12 size M", use_ai=False)
        assert result["color"] is None


# ══════════════════════════════════════════════════════════════
# SIZE EXTRACTION
# ══════════════════════════════════════════════════════════════

class TestSizeExtraction:
    """Tests for clothing size detection."""

    @pytest.mark.parametrize("comment,expected_size", [
        ("Chốt A12 size M", "M"),
        ("Mua B05 size XL", "XL"),
        ("Đặt C3 S đen", "S"),
        ("Order D1 size XXL", "XXL"),
    ])
    def test_size_extracted(self, comment, expected_size):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["size"] == expected_size

    def test_size_case_insensitive(self):
        result = parse_purchase_intent("Chốt A12 size m", use_ai=False)
        assert result["size"] == "M"

    def test_no_size_returns_none(self):
        result = parse_purchase_intent("Chốt A12 đen", use_ai=False)
        assert result["size"] is None


# ══════════════════════════════════════════════════════════════
# QUANTITY EXTRACTION
# ══════════════════════════════════════════════════════════════

class TestQuantityExtraction:
    """Tests for quantity parsing."""

    @pytest.mark.parametrize("comment,expected_qty", [
        ("Chốt A12 đen 2 cái", 2),
        ("Mua B05 trắng 1 chiếc", 1),
        ("Đặt C3 hồng 5 bộ", 5),
        ("Lấy A12 đen 3 đôi", 3),
    ])
    def test_quantity_with_unit_extracted(self, comment, expected_qty):
        result = parse_purchase_intent(comment, use_ai=False)
        assert result["quantity"] == expected_qty

    def test_quantity_not_confused_with_product_code(self):
        """Number in 'A12' should not be mistaken for quantity."""
        result = parse_purchase_intent("Chốt A12 đen M", use_ai=False)
        assert result["quantity"] is None or result["quantity"] != 12

    def test_no_quantity_returns_none(self):
        result = parse_purchase_intent("Chốt A12 đen M", use_ai=False)
        assert result["quantity"] is None


# ══════════════════════════════════════════════════════════════
# CONFIDENCE SCORING & SOURCE TRACKING
# ══════════════════════════════════════════════════════════════

class TestConfidenceScoring:
    """Tests for confidence level calculation."""

    def test_strong_keyword_plus_many_fields_gives_high(self):
        result = parse_purchase_intent("Chốt A12 đen size M, 2 cái", use_ai=False)
        assert result["confidence"] == "high"
        assert result["source"] == "regex"

    def test_strong_keyword_plus_few_fields_gives_low(self):
        result = parse_purchase_intent("Mua B05", use_ai=False)
        assert result["confidence"] == "low"

    def test_weak_keyword_gives_low(self):
        result = parse_purchase_intent("Cho em SP-99 hồng S", use_ai=False)
        assert result["confidence"] == "low"

    def test_no_intent_has_no_confidence(self):
        result = parse_purchase_intent("Đẹp quá chị ơi", use_ai=False)
        assert result["confidence"] is None


# ══════════════════════════════════════════════════════════════
# GEMINI AI ROUTING (unit tests with mocked helper)
# ══════════════════════════════════════════════════════════════

class TestGeminiRouting:
    """Tests for the hybrid regex→Gemini flow using mocked AI responses."""

    @patch("parse_intent._try_gemini")
    def test_low_confidence_calls_gemini(self, mock_gemini):
        """When regex confidence is low and use_ai=True, Gemini should be called."""
        mock_gemini.return_value = {
            "has_intent": True,
            "confidence": "high",
            "source": "gemini",
            "product_code": "B05",
            "color": None,
            "size": None,
            "quantity": 1,
            "raw": "Mua B05",
        }
        result = parse_purchase_intent("Mua B05", use_ai=True)
        mock_gemini.assert_called_once_with("Mua B05")
        assert result["source"] == "gemini"
        assert result["confidence"] == "high"
        assert result["quantity"] is None
        assert result["decision"] == "needs_clarification"
        assert result["reason_codes"] == ["missing_quantity"]

    @patch("parse_intent._try_gemini")
    def test_high_confidence_skips_gemini(self, mock_gemini):
        """When regex confidence is high, Gemini should NOT be called."""
        result = parse_purchase_intent("Chốt A12 đen size M, 2 cái", use_ai=True)
        mock_gemini.assert_not_called()
        assert result["source"] == "regex"
        assert result["confidence"] == "high"

    @patch("parse_intent._try_gemini")
    def test_no_intent_skips_gemini(self, mock_gemini):
        """When no purchase keywords found, Gemini should NOT be called."""
        result = parse_purchase_intent("Đẹp quá chị ơi", use_ai=True)
        mock_gemini.assert_not_called()
        assert result["has_intent"] is False

    @patch("parse_intent._try_gemini")
    def test_gemini_failure_raises_exception(self, mock_gemini):
        """When Gemini fails, AIParsingError should bubble up, no fallback."""
        from ai_errors import AIParsingError
        mock_gemini.side_effect = AIParsingError("ai_transient", "Test timeout")
        
        with pytest.raises(AIParsingError) as exc_info:
            parse_purchase_intent("Mua B05", use_ai=True)
            
        assert exc_info.value.error_type == "ai_transient"

    @patch("parse_intent._try_gemini")
    def test_gemini_confirms_evidenced_fields(self, mock_gemini):
        """AI may confirm a weak purchase comment without inventing its fields."""
        content = "Lấy B05 đen size M 2 cái"
        mock_gemini.return_value = {
            "has_intent": True,
            "confidence": "high",
            "source": "gemini",
            "product_code": "B05",
            "color": "đen",
            "size": "M",
            "quantity": 2,
            "raw": content,
        }
        # A weak keyword still routes matching, explicit fields through Gemini.
        result = parse_purchase_intent(content, use_ai=True)
        mock_gemini.assert_called_once_with(content)
        assert result["source"] == "gemini"
        assert result["product_code"] == "B05"
        assert result["quantity"] == 2
        assert result["color"] == "đen"
        assert result["size"] == "M"
        assert result["decision"] == "purchase_candidate"


# ══════════════════════════════════════════════════════════════
# RAW FIELD
# ══════════════════════════════════════════════════════════════

class TestRawField:
    """Tests that original content is always preserved."""

    def test_raw_contains_original_content(self):
        text = "Chốt A12 đen M, 2 cái"
        result = parse_purchase_intent(text, use_ai=False)
        assert result["raw"] == text

    def test_raw_preserved_when_no_intent(self):
        text = "Đẹp quá"
        result = parse_purchase_intent(text, use_ai=False)
        assert result["raw"] == text
