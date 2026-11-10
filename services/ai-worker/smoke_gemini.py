"""Summarize synthetic CLI smoke cases; dry-run unless live access is explicit."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time


SERVICE = Path(__file__).resolve().parent
ROOT = SERVICE.parents[1]
CASES_FILE = SERVICE / "examples/gemini-smoke-cases.json"
DECISIONS = {"purchase_candidate", "needs_clarification", "no_purchase"}
AI_ERRORS = {"ai_timeout", "ai_network", "ai_rate_limit", "ai_transient",
             "ai_authentication", "ai_configuration", "ai_invalid_response"}
REASONS = {"missing_product_code", "missing_quantity", "invalid_quantity",
           "ambiguous_quantity", "uncertain_intent", "multiple_products",
           "ambiguous_color", "question", "ambiguous_question", "explicit_negation",
           "ambiguous_negation", "conditional_purchase", "no_purchase_intent"}


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's default diagnostics can echo arbitrary argument values.
        self.exit(2, "Invalid smoke configuration; use --help.\n")


def _load_cases() -> list[dict]:
    cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    if not isinstance(cases, list) or not cases:
        raise ValueError("Invalid smoke cases")
    for case in cases:
        if (not isinstance(case, dict)
                or not isinstance(case.get("id"), str)
                or not re.fullmatch(r"[a-z0-9-]{1,40}", case["id"])
                or not isinstance(case.get("content"), str)
                or type(case.get("allow_ai")) is not bool
                or not isinstance(case.get("decision"), str)
                or case["decision"] not in DECISIONS):
            raise ValueError("Invalid smoke cases")
    return cases


def _summarize(child, case: dict, live: bool) -> dict:
    """Allow only known public labels; never forward raw child output."""
    failure = {"status": "error", "error_type": "process_failure"}
    if child.returncode not in (0, 1):
        return failure
    try:
        result = json.loads(child.stdout)
    except json.JSONDecodeError:
        return failure
    if not isinstance(result, dict):
        return failure
    if result.get("status") == "error":
        error = result.get("error_type")
        return {"status": "error", "error_type": error if isinstance(error, str) and error in AI_ERRORS else "process_failure"}
    intent = result.get("intent")
    if result.get("status") != "ok" or child.returncode != 0 or not isinstance(intent, dict):
        return failure
    decision, source, reasons = intent.get("decision"), intent.get("source"), intent.get("reason_codes")
    if (not isinstance(decision, str) or decision not in DECISIONS
            or source not in ("regex", "gemini") or not isinstance(reasons, list)
            or any(not isinstance(reason, str) or reason not in REASONS for reason in reasons)):
        return failure
    expected = case.get("offline_decision", case["decision"]) if not live else case["decision"]
    matches = decision == expected and source == ("gemini" if live else "regex")
    matches = matches and (not case.get("reason") or case["reason"] in reasons)
    matches = matches and all(intent.get(key) == value for key, value in case.get("fields", {}).items())
    return {"status": "pass" if matches else "mismatch", "decision": decision,
            "source": source, "reason_codes": reasons}


def main(argv: list[str] | None = None) -> int:
    parser = SafeParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true", help="Run every case offline (default)")
    modes.add_argument("--allow-ai", action="store_true", help="Explicitly permit live synthetic cases")
    parser.add_argument("--max-api-calls", type=int, default=5, help="Conservative attempt budget, 1 to 5")
    args = parser.parse_args(argv)
    if not 1 <= args.max_api_calls <= 5:
        parser.error("Attempt budget out of range")
    if args.allow_ai and not os.environ.get("GEMINI_API_KEY", "").strip():
        print("Live mode requires GEMINI_API_KEY in the process environment.", file=sys.stderr)
        return 2
    try:
        cases = _load_cases()
        template = json.loads((ROOT / "contracts/examples/comment-created.v1.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError):
        print("Cannot load synthetic smoke inputs.", file=sys.stderr)
        return 2

    env = dict(os.environ, GEMINI_MAX_RETRIES="0", PYTHON_DOTENV_DISABLED="1", PYTHONDONTWRITEBYTECODE="1")
    env.pop("GOOGLE_API_KEY", None)
    if not args.allow_ai:
        env.pop("GEMINI_API_KEY", None)
    report = {"mode": "live" if args.allow_ai else "dry_run", "max_api_attempts": args.max_api_calls,
              "api_attempts_upper_bound": 0, "results": []}
    stopped, last_live_start = False, None
    # Only generated synthetic event files live here; never use a caller's directory.
    with tempfile.TemporaryDirectory(prefix="ai-worker-smoke-") as directory:
        for index, case in enumerate(cases):
            row = {"case_id": case["id"]}
            live = args.allow_ai and case["allow_ai"]
            if stopped:
                row["status"] = "skipped_after_error"
            elif live and report["api_attempts_upper_bound"] >= args.max_api_calls:
                row["status"] = "skipped_budget"
            else:
                if live:
                    # Reserve before launch, even if routing performs no API request.
                    report["api_attempts_upper_bound"] += 1
                    if last_live_start is not None:
                        wait = 4.0 - (time.monotonic() - last_live_start)
                        if wait > 0:
                            time.sleep(wait)
                    last_live_start = time.monotonic()
                event = dict(template, content=case["content"])
                path = Path(directory) / f"event-{index}.json"
                path.write_text(json.dumps(event, ensure_ascii=False), encoding="utf-8")
                command = [sys.executable, "-X", "utf8", "-B", str(SERVICE / "read_example.py"),
                           "--allow-ai" if live else "--offline", "--file", str(path)]
                start = time.monotonic()
                try:
                    child = subprocess.run(command, env=env, capture_output=True, text=True,
                                           encoding="utf-8", timeout=45)
                    row.update(_summarize(child, case, live))
                except subprocess.TimeoutExpired:
                    row.update(status="error", error_type="process_timeout")
                except OSError:
                    row.update(status="error", error_type="process_failure")
                row["process_elapsed_ms"] = round((time.monotonic() - start) * 1000, 2)
                stopped = row["status"] == "error"
            report["results"].append(row)
    print(json.dumps(report, ensure_ascii=True, indent=2))
    return 0 if all(row["status"] == "pass" for row in report["results"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
