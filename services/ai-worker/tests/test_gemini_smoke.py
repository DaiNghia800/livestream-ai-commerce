"""Test opt-in orchestration without ever executing a live CLI subprocess."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
from unittest.mock import Mock

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "services/ai-worker/smoke_gemini.py"


def load_smoke():
    spec = importlib.util.spec_from_file_location("smoke_test_module", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Clock:
    def __init__(self):
        self.now = 100.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def fake_cli(clock, error=None, force_ai_cases=False):
    """Return only synthetic CLI data; no subprocess is started."""
    def execute(command, **kwargs):
        path = Path(command[command.index("--file") + 1])
        event = json.loads(path.read_text(encoding="utf-8"))
        live = "--allow-ai" in command
        clock.now += 0.25
        if live and error:
            result = {"status": "error", "error_type": error, "message": "secret-value"}
            return subprocess.CompletedProcess(command, 1, json.dumps(result), "secret-value")
        # A fake transport boundary still uses the actual deterministic parser.
        sys.path.insert(0, str(ROOT / "services/ai-worker"))
        from process_comment import process_comment_event
        result = process_comment_event(event, use_ai=False)
        if live and result["intent"]["decision"] == "needs_clarification" and event["content"] == "Lấy A12 2 cái":
            result["intent"]["decision"] = "purchase_candidate"
            result["intent"]["reason_codes"] = []
        if live:
            result["intent"]["source"] = "gemini"
        return subprocess.CompletedProcess(command, 0, json.dumps(result), "")
    return execute


def test_import_is_inert(capsys):
    load_smoke()
    assert capsys.readouterr() == ("", "")


@pytest.mark.parametrize("flags", [[], ["--dry-run"]])
def test_default_and_dry_run_never_enable_ai(monkeypatch, capsys, flags):
    smoke = load_smoke()
    clock = Clock()
    run = Mock(side_effect=fake_cli(clock))
    monkeypatch.setattr(smoke.subprocess, "run", run)
    monkeypatch.setenv("GEMINI_API_KEY", "secret-value")
    assert smoke.main(flags) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["mode"] == "dry_run"
    assert report["api_attempts_upper_bound"] == 0
    assert len(report["results"]) == 8
    for call in run.call_args_list:
        assert "--offline" in call.args[0]
        assert "--allow-ai" not in call.args[0]
        assert "GEMINI_API_KEY" not in call.kwargs["env"]
        assert call.kwargs["env"]["PYTHON_DOTENV_DISABLED"] == "1"


@pytest.mark.parametrize("cap", [1, 2, 3, 4, 5])
def test_budget_is_reserved_before_each_enabled_subprocess(monkeypatch, capsys, cap):
    smoke = load_smoke()
    clock = Clock()
    # Every case requests AI: safety must not depend on the known routing table.
    cases = json.loads(smoke.CASES_FILE.read_text(encoding="utf-8"))
    for case in cases:
        case["allow_ai"] = True
    monkeypatch.setattr(smoke, "_load_cases", lambda: cases)
    run = Mock(side_effect=fake_cli(clock))
    monkeypatch.setattr(smoke.subprocess, "run", run)
    monkeypatch.setattr(smoke.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(smoke.time, "sleep", clock.sleep)
    monkeypatch.setenv("GEMINI_API_KEY", "secret-value")
    smoke.main(["--allow-ai", "--max-api-calls", str(cap)])
    report = json.loads(capsys.readouterr().out)
    enabled = [call for call in run.call_args_list if "--allow-ai" in call.args[0]]
    assert len(enabled) == cap
    assert report["api_attempts_upper_bound"] == cap
    assert sum(row["status"] == "skipped_budget" for row in report["results"]) == 8 - cap
    for call in enabled:
        assert call.kwargs["env"]["GEMINI_MAX_RETRIES"] == "0"
        assert call.kwargs["env"]["PYTHON_DOTENV_DISABLED"] == "1"


def test_timing_is_process_elapsed_not_api_latency(monkeypatch, capsys):
    smoke = load_smoke()
    clock = Clock()
    monkeypatch.setattr(smoke.subprocess, "run", Mock(side_effect=fake_cli(clock)))
    monkeypatch.setattr(smoke.time, "monotonic", clock.monotonic)
    monkeypatch.setattr(smoke.time, "sleep", clock.sleep)
    monkeypatch.setenv("GEMINI_API_KEY", "secret-value")
    assert smoke.main(["--allow-ai"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["api_attempts_upper_bound"] == 2
    assert all(row["process_elapsed_ms"] == 250.0 for row in report["results"])
    assert all("api_latency_ms" not in row for row in report["results"])
    assert clock.sleeps == [3.75]


@pytest.mark.parametrize("error", ["ai_rate_limit", "ai_timeout", "ai_authentication", "ai_configuration", "ai_network", "ai_transient", "ai_invalid_response"])
def test_classified_error_stops_without_leaking_details(monkeypatch, capsys, error):
    smoke = load_smoke()
    run = Mock(side_effect=fake_cli(Clock(), error=error))
    monkeypatch.setattr(smoke.subprocess, "run", run)
    monkeypatch.setenv("GEMINI_API_KEY", "secret-value")
    assert smoke.main(["--allow-ai"]) == 1
    captured = capsys.readouterr()
    report = json.loads(captured.out)
    assert run.call_count == 1
    assert report["results"][0]["error_type"] == error
    assert report["api_attempts_upper_bound"] == 1
    assert "secret-value" not in captured.out + captured.err
    assert "Lấy A12" not in captured.out + captured.err


@pytest.mark.parametrize("flags", [["--max-api-calls", "0"], ["--max-api-calls", "6"],
    ["--max-api-calls", "secret-value"], ["--dry-run", "--allow-ai"]])
def test_invalid_arguments_do_not_start_subprocesses(monkeypatch, capsys, flags):
    smoke = load_smoke()
    run = Mock(side_effect=AssertionError("Invalid configuration must not start CLI"))
    monkeypatch.setattr(smoke.subprocess, "run", run)
    with pytest.raises(SystemExit) as caught:
        smoke.main(flags)
    assert caught.value.code == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err
    assert "secret-value" not in captured.err
    run.assert_not_called()


def test_live_without_key_fails_without_loading_dotenv(monkeypatch, capsys):
    smoke = load_smoke()
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    run = Mock(side_effect=AssertionError("Missing key must not start CLI"))
    monkeypatch.setattr(smoke.subprocess, "run", run)
    assert smoke.main(["--allow-ai"]) == 2
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "GEMINI_API_KEY" in captured.err
    run.assert_not_called()


@pytest.mark.parametrize("failure", [subprocess.CompletedProcess([], 1, "", "private traceback secret-value"),
    subprocess.CompletedProcess([], 0, "secret-value", ""),
    subprocess.TimeoutExpired([], 45, output="secret-value"), OSError("secret-value")])
def test_child_failure_is_safe_and_never_retried(monkeypatch, capsys, failure):
    smoke = load_smoke()
    run = Mock(side_effect=failure) if isinstance(failure, Exception) else Mock(return_value=failure)
    monkeypatch.setattr(smoke.subprocess, "run", run)
    assert smoke.main([]) == 1
    captured = capsys.readouterr()
    assert "secret-value" not in captured.out + captured.err
    assert json.loads(captured.out)["results"][0]["status"] == "error"
    assert run.call_count == 1


def test_summary_rejects_untrusted_output_fields(monkeypatch, capsys):
    smoke = load_smoke()
    reply = {"status": "ok", "intent": {"decision": "secret-value", "source": "secret-value", "reason_codes": ["secret-value"]}}
    monkeypatch.setattr(smoke.subprocess, "run", Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps(reply), "")))
    assert smoke.main([]) == 1
    captured = capsys.readouterr()
    assert "secret-value" not in captured.out + captured.err


def test_actual_dry_run_subprocess_blocks_network_and_gemini():
    assert SCRIPT.is_file()
    bootstrap = """
import importlib.abc, os, runpy, socket, sys
def blocked(*args, **kwargs):
    raise AssertionError('Network forbidden')
socket.socket.connect = blocked
socket.socket.connect_ex = blocked
socket.create_connection = blocked
class NoGemini(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == 'gemini_client':
            raise AssertionError('Dry run must not import Gemini')
sys.meta_path.insert(0, NoGemini())
import subprocess
real_run = subprocess.run
def guarded(command, **kwargs):
    assert '--allow-ai' not in command
    script, flags = command[4], command[5:]
    child = ['import importlib.abc, runpy, socket, sys',
             'def blocked(*a, **k): raise AssertionError("Network forbidden")',
             'socket.socket.connect = blocked',
             'socket.socket.connect_ex = blocked',
             'socket.create_connection = blocked',
             'class Guard(importlib.abc.MetaPathFinder):',
             ' def find_spec(self, fullname, path=None, target=None):',
             '  if fullname == "gemini_client": raise AssertionError("Gemini forbidden")',
             'sys.meta_path.insert(0, Guard())',
             'sys.path.insert(0, __import__("pathlib").Path(sys.argv[1]).parent.as_posix())',
             'sys.argv = sys.argv[1:]', 'runpy.run_path(sys.argv[0], run_name="__main__")']
    return real_run([sys.executable, '-X', 'utf8', '-B', '-c', '\\n'.join(child), script, *flags], **kwargs)
subprocess.run = guarded
sys.argv = [sys.argv[1], '--dry-run']
runpy.run_path(sys.argv[0], run_name='__main__')
"""
    result = subprocess.run([sys.executable, "-X", "utf8", "-B", "-c", bootstrap, str(SCRIPT)],
        capture_output=True, text=True, encoding="utf-8", env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), timeout=20)
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert len(report["results"]) == 8
    assert report["api_attempts_upper_bound"] == 0
