"""Validate the deployable ZIP in an isolated, network-blocked interpreter."""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import zipfile

import pytest


WORKER = Path(__file__).resolve().parents[1]
SCRIPT = WORKER / "scripts/build_lambda_zip.py"
EXPECTED_MODULES = {
    "lambda_handler.py", "process_comment.py", "parse_intent.py", "intent_policy.py",
    "quantity_parser.py", "product_codes.py", "ai_errors.py",
}


@pytest.fixture
def builder():
    spec = importlib.util.spec_from_file_location("lambda_zip_builder", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_zip_contains_only_required_source_with_linux_read_permissions(builder, tmp_path):
    output = tmp_path / "worker.zip"
    builder.build_zip(output)
    with zipfile.ZipFile(output) as package:
        assert set(package.namelist()) == EXPECTED_MODULES
        assert package.testzip() is None
        for item in package.infolist():
            assert package.read(item.filename) == (WORKER / item.filename).read_bytes()
            assert stat.S_IMODE(item.external_attr >> 16) == 0o644


def test_build_is_reproducible(builder, tmp_path):
    first, second = tmp_path / "first.zip", tmp_path / "second.zip"
    builder.build_zip(first)
    builder.build_zip(second)
    assert first.read_bytes() == second.read_bytes()


def test_existing_output_is_never_overwritten(builder, tmp_path):
    output = tmp_path / "existing.zip"
    output.write_bytes(b"existing user data")
    with pytest.raises(FileExistsError):
        builder.build_zip(output)
    assert output.read_bytes() == b"existing user data"


def test_missing_source_fails_before_creating_output(builder, tmp_path, monkeypatch):
    source = tmp_path / "incomplete-source"
    source.mkdir()
    for name in EXPECTED_MODULES - {"quantity_parser.py"}:
        shutil.copyfile(WORKER / name, source / name)
    monkeypatch.setattr(builder, "SOURCE_DIR", source)
    output = tmp_path / "incomplete.zip"
    with pytest.raises(FileNotFoundError):
        builder.build_zip(output)
    assert not output.exists()


ISOLATED_RUNNER = r'''
import importlib.abc
import json
import logging
import socket
import sys
import time

def blocked(*args, **kwargs):
    raise AssertionError("Subprocess network and sleep are forbidden")

socket.socket.connect = blocked
socket.socket.connect_ex = blocked
socket.create_connection = blocked
socket.getaddrinfo = blocked
time.sleep = blocked

class NoRemoteClients(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split(".")[0] in {
            "gemini_client", "google", "boto3", "botocore", "dotenv", "httpx", "pydantic"
        }:
            raise AssertionError("Remote dependencies must not be imported")

sys.meta_path.insert(0, NoRemoteClients())
assert not any("site-packages" in path for path in sys.path)
sys.path.insert(0, sys.argv[1])
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
import lambda_handler
envelope = json.load(sys.stdin)
first = lambda_handler.handler(envelope, None)
second = lambda_handler.handler(envelope, None)
print(json.dumps({"first": first, "second": second, "origin": lambda_handler.__file__}))
'''


def test_zip_import_and_execution_without_site_packages_or_network(builder, tmp_path):
    output = tmp_path / "offline-worker.zip"
    builder.build_zip(output)
    base = {"schema_version": 1, "event_id": "synthetic-event",
            "event_type": "comment.created", "occurred_at": "2026-10-20T08:00:00Z",
            "comment_id": "synthetic-comment", "session_id": "synthetic-session",
            "customer_id": "PRIVATE-CUSTOMER"}
    comments = ["Chốt A12 màu đen size M 2 cái", "Chốt A12 đỏ hoặc đen 2 cái",
                "Shop đẹp quá", "Lấy A12 2 cái"]
    records = [{"messageId": f"sqs-{n}", "body": json.dumps(dict(base, content=text))}
               for n, text in enumerate(comments)]
    records.append({"messageId": "bad-json", "body": "{"})
    env = {key: value for key, value in os.environ.items()
           if not key.startswith(("AWS_", "GOOGLE_", "GEMINI_", "PYTHONPATH"))}
    env.update(GEMINI_API_KEY="synthetic-key-not-a-credential", PYTHONDONTWRITEBYTECODE="1")
    run = subprocess.run([sys.executable, "-I", "-S", "-B", "-c", ISOLATED_RUNNER, str(output)],
                         input=json.dumps({"Records": records}), capture_output=True,
                         text=True, encoding="utf-8", cwd=tmp_path, env=env, timeout=20)
    assert run.returncode == 0, run.stderr
    assert run.stderr == ""
    entries = [json.loads(line) for line in run.stdout.splitlines()]
    summary = entries.pop()
    assert str(output) in summary["origin"]
    assert summary["first"] == summary["second"] == {
        "batchItemFailures": [{"itemIdentifier": "bad-json"}]}
    assert len(entries) == 10
    for start in (0, 5):
        assert [entry["decision"] for entry in entries[start:start + 4]] == [
            "purchase_candidate", "needs_clarification", "no_purchase", "needs_clarification"]
    for private in comments + ["PRIVATE-CUSTOMER", env["GEMINI_API_KEY"]]:
        assert private not in run.stdout


def test_packaging_cli_works_from_another_directory_and_needs_no_site_packages(tmp_path):
    output = tmp_path / "cli-worker.zip"
    run = subprocess.run([sys.executable, "-I", "-S", "-B", str(SCRIPT), "--output", str(output)],
                         capture_output=True, text=True, cwd=tmp_path, timeout=20)
    assert run.returncode == 0, run.stderr
    summary = json.loads(run.stdout)
    assert summary["handler"] == "lambda_handler.handler"
    assert Path(summary["zip"]) == output
    with zipfile.ZipFile(output) as package:
        assert set(package.namelist()) == EXPECTED_MODULES


def test_packaging_cli_reports_existing_output_safely(tmp_path):
    output = tmp_path / "user-data.zip"
    output.write_bytes(b"user data")
    run = subprocess.run([sys.executable, "-I", "-S", "-B", str(SCRIPT), "--output", str(output)],
                         capture_output=True, text=True, cwd=tmp_path, timeout=20)
    assert run.returncode == 2
    assert run.stdout == ""
    assert "Package error:" in run.stderr
    assert output.read_bytes() == b"user data"
