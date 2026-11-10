"""Validate PROPOSED / NOT IMPLEMENTED B1 artifacts without remote services."""

from copy import deepcopy
from datetime import datetime
from decimal import Decimal
import importlib.abc
import json
from pathlib import Path
import socket
import sys
import time

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry


ROOT = Path(__file__).resolve().parents[2]
CONTRACTS = ROOT / "contracts/proposed/b1-color-proposal/v1"
NAMES = (
    "worker-intent-result-extension",
    "commerce-color-proposal",
    "commerce-proposal-response-request",
    "commerce-proposal-response-result",
)
DIALECT = "https://json-schema.org/draft/2020-12/schema"


class NoRemoteClients(importlib.abc.MetaPathFinder):
    """Reject accidental AI/AWS imports even when credentials are available."""

    def find_spec(self, fullname, path=None, target=None):
        if fullname == "gemini_client" or fullname.split(".")[0] in {"boto3", "botocore"}:
            raise AssertionError("Contract tests must not import remote clients")
        if fullname.startswith("google.genai"):
            raise AssertionError("Contract tests must not import Gemini")


@pytest.fixture(autouse=True)
def offline_only(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Contract tests must not use network or sleep")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(time, "sleep", blocked)
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MAX_RETRIES"):
        monkeypatch.delenv(name, raising=False)
    finder = NoRemoteClients()
    sys.meta_path.insert(0, finder)
    yield
    sys.meta_path.remove(finder)


def read_json(path):
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            assert key not in result, f"Duplicate JSON key: {key}"
            result[key] = value
        return result

    def invalid_constant(value):
        raise AssertionError(f"Non-JSON constant: {value}")

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_keys,
                      parse_constant=invalid_constant)


def schema(name):
    return read_json(CONTRACTS / "schemas" / f"{name}.v1.schema.json")


def cases(name):
    manifest = read_json(CONTRACTS / "examples" / f"{name}.cases.json")
    assert manifest["contract_status"] == "PROPOSED / NOT IMPLEMENTED"
    assert manifest["synthetic_only"] is True
    return manifest["cases"]


def payload(name, case_id="base"):
    return deepcopy(next(case["payload"] for case in cases(name) if case["id"] == case_id))


def validator(name):
    def no_retrieval(uri):
        raise AssertionError(f"External schema retrieval is forbidden: {uri}")

    return Draft202012Validator(schema(name), format_checker=FormatChecker(),
                               registry=Registry(retrieve=no_retrieval))


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def error_keywords(errors):
    for error in errors:
        yield error.validator
        yield from error_keywords(error.context)


@pytest.mark.parametrize("name", NAMES)
def test_proposed_schema_is_valid_and_self_contained(name):
    document = schema(name)
    Draft202012Validator.check_schema(document)
    assert document["$schema"] == DIALECT
    assert document["$id"].startswith("urn:livestream-ai-commerce:proposed:b1:")
    assert document["x-contract-status"] == "PROPOSED / NOT IMPLEMENTED"
    assert "PROPOSED / NOT IMPLEMENTED" in document["title"]
    for node in walk(document):
        assert "default" not in node, "Draft policy must not silently populate payloads"
        if "$ref" in node:
            assert node["$ref"].startswith("#/$defs/"), "Only local references are allowed"


@pytest.mark.parametrize("name", NAMES)
def test_synthetic_examples_have_expected_validation_results(name):
    examples = cases(name)
    ids = [case["id"] for case in examples]
    assert len(ids) == len(set(ids)) and "base" in ids
    assert sum(case["valid"] is True for case in examples) >= 2
    assert sum(case["valid"] is False for case in examples) >= 3
    check = validator(name)
    for case in examples:
        errors = list(check.iter_errors(case["payload"]))
        assert (not errors) is case["valid"], (name, case["id"], list(error_keywords(errors)))
        if not case["valid"]:
            assert case["expected_keyword"] in set(error_keywords(errors)), (name, case["id"])


@pytest.mark.parametrize("name", NAMES)
@pytest.mark.parametrize("version", [True, "1", 2, 1.5, None])
def test_unknown_or_malformed_versions_are_rejected(name, version):
    example = payload(name)
    example["schema_version"] = version
    assert not validator(name).is_valid(example)


@pytest.mark.parametrize("name", NAMES)
def test_unknown_and_missing_required_fields_are_rejected(name):
    example = payload(name)
    extra = dict(example, undeclared_field=True)
    assert not validator(name).is_valid(extra)
    for field in schema(name)["required"]:
        missing = deepcopy(example)
        del missing[field]
        assert not validator(name).is_valid(missing), (name, field)


def test_uuid_and_timestamp_formats_are_actually_asserted():
    checker = FormatChecker()
    assert not checker.conforms("not-a-uuid", "uuid")
    assert not checker.conforms("2026-02-30T10:00:00Z", "date-time")
    assert not checker.conforms("2026-10-19T10:00:00", "date-time")
    example = payload(NAMES[1])
    for field, value in [("proposal_id", "not-a-uuid"), ("expires_at", "yesterday")]:
        changed = dict(example, **{field: value})
        assert not validator(NAMES[1]).is_valid(changed)


@pytest.mark.parametrize("quantity", [None, True, "2", 0, -2, 2.5, 101])
def test_permitted_worker_evidence_requires_supported_quantity(quantity):
    example = payload(NAMES[0])
    example["proposal_evidence"]["quantity"] = quantity
    assert not validator(NAMES[0]).is_valid(example)


@pytest.mark.parametrize("colors", [[], ["đỏ"], ["đỏ", "đỏ"], ["đỏ", "đen", "trắng"]])
def test_worker_options_are_two_distinct_colors(colors):
    example = payload(NAMES[0])
    example["proposal_evidence"]["variant_options"]["colors"] = colors
    assert not validator(NAMES[0]).is_valid(example)


@pytest.mark.parametrize("field,value", [
    ("selected_color", "đỏ"), ("sku_id", "12"), ("unit_price", "199000.00"),
    ("customer_identity_verified", True),
])
def test_worker_evidence_cannot_claim_commerce_authority(field, value):
    example = payload(NAMES[0])
    example["proposal_evidence"][field] = value
    assert not validator(NAMES[0]).is_valid(example)


@pytest.mark.parametrize("decision", ["purchase_candidate", "no_purchase", "NEEDS_REVIEW"])
def test_color_evidence_is_not_an_authorized_purchase_or_commerce_review(decision):
    example = payload(NAMES[0])
    example["decision"] = decision
    assert not validator(NAMES[0]).is_valid(example)


@pytest.mark.parametrize("reason", [
    "ambiguous_question", "question", "explicit_negation", "ambiguous_negation",
    "conditional_purchase", "multiple_products", "ambiguous_quantity",
    "invalid_quantity", "missing_quantity",
])
def test_permitted_evidence_cannot_bypass_other_worker_guards(reason):
    example = payload(NAMES[0])
    example["reason_codes"].append(reason)
    assert not validator(NAMES[0]).is_valid(example)


def test_blocking_size_or_quantity_evidence_cannot_be_permitted():
    for case_id in ("blocked-size", "missing-quantity", "malformed-quantity", "quantity-above-max"):
        example = payload(NAMES[0], case_id)
        assert validator(NAMES[0]).is_valid(example)
        example["proposal_evidence"]["proposal_permitted"] = True
        assert not validator(NAMES[0]).is_valid(example), case_id


@pytest.mark.parametrize("state", ["AWAITING_CUSTOMER_CONFIRMATION", "REJECTED", "EXPIRED", "INVALIDATED"])
def test_unconfirmed_proposal_payload_cannot_claim_order_or_reservation(state):
    example = next(deepcopy(case["payload"]) for case in cases(NAMES[1])
                   if case["valid"] and case["payload"]["status"] == state)
    example["order_id"] = "66666666-6666-4666-8666-666666666666"
    assert not validator(NAMES[1]).is_valid(example)
    example["order_id"] = None
    example["inventory_reserved"] = True
    assert not validator(NAMES[1]).is_valid(example)


@pytest.mark.parametrize("quantity", [True, "2", 0, -1, 2.5, 101])
def test_proposal_quantity_does_not_allow_partial_or_unsupported_counts(quantity):
    example = payload(NAMES[1])
    example["quantity"] = quantity
    assert not validator(NAMES[1]).is_valid(example)


@pytest.mark.parametrize("field,value", [
    ("customer_id", "44444444-4444-4444-8444-444444444444"),
    ("merchant_id", "77777777-7777-4777-8777-777777777777"),
    ("sku_id", "12"), ("price", "1.00"), ("quantity", 1), ("confirmed", True),
])
def test_confirmation_body_cannot_override_owner_variant_or_quote(field, value):
    example = payload(NAMES[2])
    example[field] = value
    assert not validator(NAMES[2]).is_valid(example)


@pytest.mark.parametrize("name", [NAMES[1], NAMES[3]])
def test_acceptance_requires_order_reference_and_confirmation_time(name):
    example = payload(name, "accepted")
    assert validator(name).is_valid(example)
    for field in ("order_id", "confirmed_at"):
        changed = dict(example, **{field: None})
        assert not validator(name).is_valid(changed), (name, field)


def test_technical_failure_is_not_business_success_or_clarification():
    example = payload(NAMES[3], "technical-failure")
    assert validator(NAMES[3]).is_valid(example)
    for field, value in [("outcome", "ACCEPTED"), ("inventory_reserved", True),
                         ("order_id", "66666666-6666-4666-8666-666666666666")]:
        changed = dict(example, **{field: value})
        assert not validator(NAMES[3]).is_valid(changed)
    example["error"]["raw_sdk_response"] = "private remote detail"
    assert not validator(NAMES[3]).is_valid(example)


def test_synthetic_fixture_correlations_prices_and_timestamps_are_consistent():
    evidence = payload(NAMES[0])
    proposal = payload(NAMES[1])
    assert evidence["correlation"] == proposal["correlation"]
    assert proposal["requested_colors"] == evidence["proposal_evidence"]["variant_options"]["colors"]
    assert proposal["quantity"] == evidence["proposal_evidence"]["quantity"]
    for case in cases(NAMES[1]):
        if not case["valid"]:
            continue
        item = case["payload"]
        assert item["proposed_variant"]["color"] in item["requested_colors"]
        assert item["context"]["livestream_id"] == item["correlation"]["session_id"]
        assert item["context"]["customer_id"] == item["correlation"]["customer_id"]
        quote = item["price_quote"]
        assert Decimal(quote["goods_subtotal"]) == Decimal(quote["unit_price"]) * item["quantity"]
        assert datetime.fromisoformat(item["expires_at"]) > datetime.fromisoformat(item["created_at"])


@pytest.mark.parametrize("content,expected", [
    ("Chốt A12 đỏ hoặc đen 2 cái", {
        "has_intent": True, "confidence": "low", "source": "regex", "product_code": None,
        "color": None, "size": None, "quantity": None, "decision": "needs_clarification",
        "reason_codes": ["ambiguous_color"],
    }),
    ("Chốt A12 màu đen size M, 2 cái", {
        "has_intent": True, "confidence": "high", "source": "regex", "product_code": "A12",
        "color": "đen", "size": "M", "quantity": 2, "decision": "purchase_candidate",
        "reason_codes": [],
    }),
    ("Đẹp quá chị ơi", {
        "has_intent": False, "confidence": None, "source": "regex", "product_code": None,
        "color": None, "size": None, "quantity": None, "decision": "no_purchase",
        "reason_codes": ["no_purchase_intent"],
    }),
])
def test_legacy_worker_result_remains_exactly_unchanged(monkeypatch, content, expected):
    monkeypatch.syspath_prepend(str(ROOT / "services/ai-worker"))
    from process_comment import process_comment_event

    event = read_json(ROOT / "contracts/examples/comment-created.v1.json")
    event["content"] = content
    assert process_comment_event(event, use_ai=False) == {
        "status": "ok", **{field: event[field] for field in
                               ("event_id", "comment_id", "session_id", "customer_id")},
        "content": content, "intent": dict(expected, raw=content), "message": f"Processed: {content}",
    }


def test_documentation_keeps_proposed_policies_and_test_limits_explicit():
    document = (CONTRACTS / "README.md").read_text(encoding="utf-8")
    for text in ("PROPOSED / NOT IMPLEMENTED", "SELLER_PROPOSES", "NEEDS_REVIEW",
                 "300", "tests/contracts", "619", "SQS", "Frontend", "Commerce"):
        assert text in document
