"""Exercise the local CLI and processor with network access explicitly blocked."""

import importlib.util
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import unicodedata
from unittest.mock import Mock

import pytest

from ai_errors import AIParsingError
import parse_intent
import process_comment


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "services/ai-worker/read_example.py"
SAMPLE = ROOT / "contracts/examples/comment-created.v1.json"


def event(content="Chốt A12 màu đen size M, 2 cái"):
    return dict(json.loads(SAMPLE.read_text(encoding="utf-8")), content=content)


def write_event(tmp_path, source, encoding="utf-8"):
    path = tmp_path / "comment event.json"
    path.write_text(json.dumps(source, ensure_ascii=False), encoding=encoding)
    return path


@pytest.fixture(autouse=True)
def forbid_ai(monkeypatch):
    forbidden = Mock(side_effect=AssertionError("Offline CLI must not call Gemini"))
    monkeypatch.setenv("GEMINI_API_KEY", "fake-key-present-offline")
    monkeypatch.setattr(parse_intent, "_try_gemini", forbidden)
    return forbidden


@pytest.fixture
def cli():
    spec = importlib.util.spec_from_file_location("local_cli_test", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_import_has_no_processing_or_output(monkeypatch, capsys):
    processor = Mock(side_effect=AssertionError("Import must not process an event"))
    monkeypatch.setattr(process_comment, "process_comment_event", processor)
    spec = importlib.util.spec_from_file_location("local_cli_import_test", SCRIPT)
    spec.loader.exec_module(importlib.util.module_from_spec(spec))
    processor.assert_not_called()
    assert capsys.readouterr() == ("", "")


@pytest.mark.parametrize("mode", [None, False, True])
def test_processor_preserves_default_and_forwards_keyword_mode(monkeypatch, mode):
    source = event()
    intent = {"has_intent": True, "decision": "purchase_candidate"}
    parser = Mock(return_value=intent)
    monkeypatch.setattr(process_comment, "parse_purchase_intent", parser)
    kwargs = {} if mode is None else {"use_ai": mode}
    result = process_comment.process_comment_event(source, **kwargs)
    parser.assert_called_once_with(source["content"], use_ai=True if mode is None else mode)
    assert result["intent"] is intent
    for field in ("event_id", "comment_id", "session_id", "customer_id", "content"):
        assert result[field] == source[field]


def test_processor_mode_is_keyword_only():
    with pytest.raises(TypeError):
        process_comment.process_comment_event(event(), False)


@pytest.mark.parametrize("flags", [[], ["--offline"]])
def test_offline_mode_never_calls_ai_with_key_present(cli, tmp_path, capsys, forbid_ai, flags):
    source = event("Lấy A12 2 cái")
    path = write_event(tmp_path, source)
    assert cli.main(["--file", str(path), *flags]) == 0
    captured = capsys.readouterr()
    result = json.loads(captured.out)
    assert result == process_comment.process_comment_event(source, use_ai=False)
    assert result["intent"]["decision"] == "needs_clarification"
    assert "uncertain_intent" in result["intent"]["reason_codes"]
    assert captured.err == ""
    forbid_ai.assert_not_called()


def test_default_sample_is_independent_of_working_directory(cli, monkeypatch, tmp_path, capsys):
    monkeypatch.chdir(tmp_path)
    assert cli.main([]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result == process_comment.process_comment_event(event(), use_ai=False)


@pytest.mark.parametrize("content,decision,reason", [
    ("Chốt A12 2 cái", "purchase_candidate", None),
    ("Chốt A12 đỏ hoặc đen 2 cái", "needs_clarification", "ambiguous_color"),
    ("Chốt A12 đỏ hay đen 2 cái", "needs_clarification", "ambiguous_color"),
    ("Chốt A12 sl: 2..5 cái", "needs_clarification", "invalid_quantity"),
    ("Chốt A12 sl: 2,,5 cái", "needs_clarification", "invalid_quantity"),
    ("Chốt A12 -+2 cái", "needs_clarification", "invalid_quantity"),
    ("Chốt SP-POLO-012 2 cái", "purchase_candidate", None),
    ("Chốt CAM-12 2 cái", "purchase_candidate", None),
    ("Chốt SKU-123-XL size M 2 cái", "purchase_candidate", None),
    ("Chốt A12 đen", "needs_clarification", "missing_quantity"),
    ("Đẹp quá chị ơi", "no_purchase", "no_purchase_intent"),
])
def test_cli_reuses_real_processor_decisions(cli, tmp_path, capsys, content, decision, reason):
    source = event(content)
    path = write_event(tmp_path, source)
    assert cli.main(["--offline", "--file", str(path)]) == 0
    captured = capsys.readouterr()
    result = json.loads(captured.out)
    assert result == process_comment.process_comment_event(source, use_ai=False)
    assert result["intent"]["decision"] == decision
    assert result["intent"]["raw"] == content
    if reason:
        assert reason in result["intent"]["reason_codes"]
    assert captured.err == ""


@pytest.mark.parametrize("encoding", ["utf-8", "utf-8-sig"])
def test_unicode_and_bom_input_preserve_processor_content(cli, tmp_path, capsys, encoding):
    content = unicodedata.normalize("NFD", "Chốt CAM-12 màu đỏ 2 cái") + " \ufeff"
    source = event(content)
    path = write_event(tmp_path, source, encoding=encoding)
    assert cli.main(["--file", str(path)]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result == process_comment.process_comment_event(source, use_ai=False)
    assert result["intent"]["raw"] == content


@pytest.mark.parametrize("source,error_type", [
    ([], "invalid_event"), (None, "invalid_event"),
    ({}, "wrong_event_type"), ({"event_type": "comment.created"}, "missing_field"),
    (event(""), "empty_content"), (event(2), "invalid_type"),
])
def test_invalid_events_keep_processor_json(cli, tmp_path, capsys, source, error_type):
    path = write_event(tmp_path, source)
    assert cli.main(["--file", str(path)]) == 1
    captured = capsys.readouterr()
    result = json.loads(captured.out)
    assert result == process_comment.process_comment_event(source, use_ai=False)
    assert result["error_type"] == error_type
    assert captured.err == ""


@pytest.mark.parametrize("payload", [b'{"content": "private-comment",', b"\xff\xfe"])
def test_invalid_json_or_encoding_is_input_error(cli, tmp_path, capsys, payload):
    path = tmp_path / "bad.json"
    path.write_bytes(payload)
    assert cli.main(["--file", str(path)]) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err
    assert "private-comment" not in captured.err


def test_missing_file_is_input_error(cli, tmp_path, capsys):
    assert cli.main(["--file", str(tmp_path / "missing.json")]) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err


def test_unreadable_file_is_input_error(cli, monkeypatch, capsys):
    monkeypatch.setattr(Path, "open", Mock(side_effect=PermissionError("private filesystem detail")))
    assert cli.main([]) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err
    assert "private filesystem detail" not in captured.err


@pytest.mark.parametrize("args", [["--offline", "--allow-ai"], ["--file"], ["--unknown"]])
def test_invalid_arguments_use_stderr_and_exit_two(cli, capsys, args):
    with pytest.raises(SystemExit) as caught:
        cli.main(args)
    assert caught.value.code == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "usage:" in captured.err


def test_help_exits_without_processing(cli, monkeypatch, capsys):
    processor = Mock(side_effect=AssertionError("Help must not process events"))
    monkeypatch.setattr(cli, "process_comment_event", processor)
    with pytest.raises(SystemExit) as caught:
        cli.main(["--help"])
    assert caught.value.code == 0
    captured = capsys.readouterr()
    for option in ("--file", "--offline", "--allow-ai"):
        assert option in captured.out
    assert captured.err == ""
    processor.assert_not_called()


def test_allow_ai_uses_existing_evidence_validation(cli, monkeypatch, tmp_path, capsys):
    ai = Mock(return_value={"has_intent": True, "product_code": "B05", "quantity": 7,
                           "confidence": "high", "source": "gemini", "raw": "changed"})
    monkeypatch.setattr(parse_intent, "_try_gemini", ai)
    source = event("Lấy A12 2 cái")
    path = write_event(tmp_path, source)
    assert cli.main(["--allow-ai", "--file", str(path)]) == 0
    result = json.loads(capsys.readouterr().out)
    ai.assert_called_once_with(source["content"])
    assert result["intent"]["decision"] == "needs_clarification"
    assert result["intent"]["product_code"] is None
    assert result["intent"]["quantity"] is None
    assert result["intent"]["raw"] == source["content"]


def test_classified_ai_error_keeps_ids_and_exit_one(cli, monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(parse_intent, "_try_gemini", Mock(side_effect=AIParsingError("ai_timeout", "Safe timeout")))
    source = event("Lấy A12 2 cái")
    path = write_event(tmp_path, source)
    assert cli.main(["--allow-ai", "--file", str(path)]) == 1
    captured = capsys.readouterr()
    assert json.loads(captured.out) == {"status": "error", "error_type": "ai_timeout",
        "message": "Safe timeout", "event_id": source["event_id"], "comment_id": source["comment_id"]}
    assert captured.err == ""


def test_programming_error_propagates_without_fake_output(cli, monkeypatch, tmp_path, capsys):
    path = write_event(tmp_path, event())
    monkeypatch.setattr(process_comment, "parse_purchase_intent", Mock(side_effect=TypeError("programming defect")))
    with pytest.raises(TypeError, match="programming defect"):
        cli.main(["--file", str(path)])
    assert capsys.readouterr() == ("", "")


def test_no_duplicate_sensitive_logging(cli, tmp_path, capsys, caplog):
    source = event("Lấy A12 2 cái private-customer-detail")
    path = write_event(tmp_path, source)
    with caplog.at_level(logging.DEBUG):
        assert cli.main(["--offline", "--file", str(path)]) == 0
    assert "private-customer-detail" not in caplog.text
    assert "fake-key-present-offline" not in caplog.text
    assert capsys.readouterr().err == ""


# The child process does not inherit pytest's socket/sleep guards.
SUBPROCESS_BOOTSTRAP = """
import importlib.abc, runpy, socket, sys, time
def blocked(*args, **kwargs):
    raise AssertionError('Subprocess network and sleep are forbidden')
socket.socket.connect = blocked
socket.socket.connect_ex = blocked
socket.create_connection = blocked
time.sleep = blocked
class NoGemini(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'gemini_client':
            raise AssertionError('Offline subprocess must not import Gemini')
sys.meta_path.insert(0, NoGemini())
script = sys.argv[1]
sys.argv = sys.argv[1:]
sys.path.insert(0, str(__import__('pathlib').Path(script).parent))
runpy.run_path(script, run_name='__main__')
"""


@pytest.mark.parametrize("case,exit_code", [
    ("default", 0), ("weak", 0), ("invalid-event", 1), ("invalid-json", 2),
])
def test_subprocess_entry_point_is_offline(cli, tmp_path, case, exit_code):
    args = ["--offline"]
    if case != "default":
        path = tmp_path / "child event.json"
        text = "{bad JSON" if case == "invalid-json" else json.dumps(
            [] if case == "invalid-event" else event("Lấy A12 2 cái"))
        path.write_text(text, encoding="utf-8-sig")
        args += ["--file", str(path)]
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", GEMINI_API_KEY="fake-key-present-offline")
    result = subprocess.run([sys.executable, "-X", "utf8", "-B", "-c", SUBPROCESS_BOOTSTRAP,
                             str(SCRIPT), *args], cwd=tmp_path, env=env,
                            capture_output=True, text=True, encoding="utf-8", timeout=15)
    assert result.returncode == exit_code, result.stderr
    if exit_code == 2:
        assert result.stdout == ""
        assert result.stderr
    else:
        output = json.loads(result.stdout)
        assert output["status"] == ("error" if exit_code else "ok")
        assert result.stderr == ""
        if case == "weak":
            assert output["intent"]["source"] == "regex"
            assert output["intent"]["decision"] == "needs_clarification"


@pytest.mark.parametrize("name,decision", [
    ("needs-clarification.json", "needs_clarification"),
    ("no-purchase.json", "no_purchase"),
])
def test_documented_demo_fixtures(cli, capsys, name, decision):
    path = ROOT / "services/ai-worker/examples" / name
    assert cli.main(["--offline", "--file", str(path)]) == 0
    result = json.loads(capsys.readouterr().out)
    source = json.loads(path.read_text(encoding="utf-8"))
    assert result == process_comment.process_comment_event(source, use_ai=False)
    assert result["intent"]["decision"] == decision
