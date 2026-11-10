"""Unit tests for CatalogProvider, StaticCatalog, dynamic size parsing, and immutability."""

import pytest

from catalog import (
    DEFAULT_CATALOG,
    DEFAULT_COLORS,
    DEFAULT_SIZES,
    CatalogProvider,
    StaticCatalog,
)
from parse_intent import parse_purchase_intent
from process_comment import process_comment_event


def test_catalog_protocol_conformance():
    """StaticCatalog satisfies the CatalogProvider protocol."""
    catalog = StaticCatalog()
    assert isinstance(catalog, CatalogProvider)


def test_default_catalog_values():
    """DEFAULT_CATALOG contains the expected default colors and sizes."""
    catalog = StaticCatalog()
    assert catalog.known_colors == list(DEFAULT_COLORS)
    assert catalog.known_sizes == list(DEFAULT_SIZES)
    assert DEFAULT_CATALOG.known_colors == list(DEFAULT_COLORS)
    assert DEFAULT_CATALOG.known_sizes == list(DEFAULT_SIZES)

    # Multi-word colors must precede prefix single-word colors
    colors = catalog.known_colors
    assert colors.index("xanh dương") < colors.index("xanh")
    assert colors.index("xanh lá") < colors.index("xanh")


def test_catalog_immutability():
    """Catalog getters must return defensive copies, preventing external mutation."""
    catalog = StaticCatalog()

    # Modifying returned color list must not affect internal catalog
    colors = catalog.known_colors
    colors.append("tím than")
    colors.clear()
    assert "tím than" not in catalog.known_colors
    assert len(catalog.known_colors) == len(DEFAULT_COLORS)

    # Modifying returned size list must not affect internal catalog
    sizes = catalog.known_sizes
    sizes.append("4XL")
    sizes.clear()
    assert "4XL" not in catalog.known_sizes
    assert len(catalog.known_sizes) == len(DEFAULT_SIZES)


def test_catalog_constructor_defensive_copy():
    """StaticCatalog must not keep a reference to caller's mutable lists."""
    initial_colors = ["đỏ", "xanh dương", "vàng"]
    initial_sizes = ["S", "M", "L"]

    catalog = StaticCatalog(colors=initial_colors, sizes=initial_sizes)

    # Mutate the original lists
    initial_colors.append("hồng")
    initial_sizes.append("4XL")

    assert "hồng" not in catalog.known_colors
    assert "4XL" not in catalog.known_sizes

    # Verify colors were sorted longest-first
    assert catalog.known_colors[0] == "xanh dương"


def test_dynamic_size_recognition_default_catalog():
    """Default catalog recognizes standard sizes."""
    result = parse_purchase_intent("Chốt A12 màu đen size M 2 cái", use_ai=False)
    assert result["size"] == "M"

    result_standalone = parse_purchase_intent("Chốt A12 màu đen M 2 cái", use_ai=False)
    assert result_standalone["size"] == "M"

    result_xxxl = parse_purchase_intent("Chốt A12 màu đen size XXXL 2 cái", use_ai=False)
    assert result_xxxl["size"] == "XXXL"

    result_xxxl_standalone = parse_purchase_intent("Chốt A12 màu đen XXXL 2 cái", use_ai=False)
    assert result_xxxl_standalone["size"] == "XXXL"

    # 4XL is NOT in default catalog
    result_4xl = parse_purchase_intent("Chốt A12 màu đen size 4XL 2 cái", use_ai=False)
    assert result_4xl["size"] is None


def test_dynamic_size_recognition_custom_catalog_4xl():
    """Custom catalog with 4XL correctly recognizes 4XL via size keyword and standalone."""
    custom_catalog = StaticCatalog(
        sizes=["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]
    )

    # With 'size 4XL' keyword
    result_with_keyword = parse_purchase_intent(
        "Chốt A12 màu đen size 4XL 2 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result_with_keyword["size"] == "4XL"
    assert result_with_keyword["product_code"] == "A12"
    assert result_with_keyword["color"] == "đen"
    assert result_with_keyword["quantity"] == 2
    assert result_with_keyword["decision"] == "purchase_candidate"

    # Standalone '4XL' extracts size 4XL correctly
    result_standalone = parse_purchase_intent(
        "Chốt A12 màu đen 4XL 2 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result_standalone["size"] == "4XL"

    # '5XL' with size keyword gives purchase_candidate
    result_5xl = parse_purchase_intent(
        "Chốt SP-POLO-012 size 5XL 1 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result_5xl["size"] == "5XL"
    assert result_5xl["decision"] == "purchase_candidate"

    # 'XXS' was omitted from this custom catalog, so it should not match
    result_xxs = parse_purchase_intent(
        "Chốt A12 size XXS 2 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result_xxs["size"] is None


def test_dynamic_size_longest_first_precedence():
    """Longer size must match before shorter substring size (e.g. 4XL before XL)."""
    # Catalog ordered with shorter first in input list; should sort longest-first in regex
    custom_catalog = StaticCatalog(sizes=["XL", "4XL", "2XL", "L"])
    result = parse_purchase_intent(
        "Chốt A12 4XL 2 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result["size"] == "4XL"


def test_dynamic_size_with_regex_special_characters():
    """Sizes with regex characters (e.g. '+') are properly escaped and match safely."""
    custom_catalog = StaticCatalog(sizes=["M+", "L+", "XL+"])
    result = parse_purchase_intent(
        "Chốt A12 size M+ 2 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result["size"] == "M+"


def test_custom_color_recognition():
    """Custom catalog recognizes custom colors and ignores omitted colors."""
    custom_catalog = StaticCatalog(
        colors=["xanh coban", "vàng chanh", "hồng phấn"],
        sizes=["S", "M", "L"],
    )

    result_custom = parse_purchase_intent(
        "Chốt A12 màu xanh coban size M 2 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result_custom["color"] == "xanh coban"
    assert result_custom["decision"] == "purchase_candidate"

    # Standard "đen" is NOT in this custom catalog
    result_den = parse_purchase_intent(
        "Chốt A12 màu đen size M 2 cái",
        use_ai=False,
        catalog=custom_catalog,
    )
    assert result_den["color"] is None


def test_empty_catalog():
    """An empty catalog safely produces None for color and size without crashing."""
    empty_catalog = StaticCatalog(colors=[], sizes=[])
    result = parse_purchase_intent(
        "Chốt A12 màu đen size M 2 cái",
        use_ai=False,
        catalog=empty_catalog,
    )
    assert result["color"] is None
    assert result["size"] is None
    assert result["product_code"] == "A12"
    assert result["quantity"] == 2


def test_process_comment_event_accepts_catalog():
    """process_comment_event passes custom catalog down to parser."""
    event = {
        "schema_version": 1,
        "event_id": "11111111-1111-4111-8111-111111111111",
        "event_type": "comment.created",
        "occurred_at": "2026-10-20T08:00:00Z",
        "comment_id": "22222222-2222-4222-8222-222222222222",
        "session_id": "33333333-3333-4333-8333-333333333333",
        "customer_id": "44444444-4444-4444-8444-444444444444",
        "content": "Chốt A12 màu rêu size 4XL 2 cái",
    }
    custom_catalog = StaticCatalog(
        colors=["rêu", "đen"],
        sizes=["S", "M", "4XL"],
    )

    res = process_comment_event(event, use_ai=False, catalog=custom_catalog)
    assert res["status"] == "ok"
    assert res["intent"]["color"] == "rêu"
    assert res["intent"]["size"] == "4XL"
    assert res["intent"]["decision"] == "purchase_candidate"


def test_backward_compatibility_calling_conventions():
    """Existing call signatures work without modification."""
    # 1. parse_purchase_intent(content)
    r1 = parse_purchase_intent("Shop đẹp quá")
    assert r1["has_intent"] is False

    # 2. parse_purchase_intent(content, use_ai=False)
    r2 = parse_purchase_intent("Chốt A12 2 cái", use_ai=False)
    assert r2["decision"] == "purchase_candidate"

    # 3. parse_purchase_intent(content, False)
    r3 = parse_purchase_intent("Chốt A12 2 cái", False)
    assert r3["decision"] == "purchase_candidate"

    # 4. process_comment_event(event)
    event = {
        "schema_version": 1,
        "event_id": "11111111-1111-4111-8111-111111111111",
        "event_type": "comment.created",
        "occurred_at": "2026-10-20T08:00:00Z",
        "comment_id": "22222222-2222-4222-8222-222222222222",
        "session_id": "33333333-3333-4333-8333-333333333333",
        "customer_id": "44444444-4444-4444-8444-444444444444",
        "content": "Chốt A12 2 cái",
    }
    r4 = process_comment_event(event)
    assert r4["status"] == "ok"

    # 5. process_comment_event(event, use_ai=False)
    r5 = process_comment_event(event, use_ai=False)
    assert r5["status"] == "ok"
