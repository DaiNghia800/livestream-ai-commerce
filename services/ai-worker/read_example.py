"""Read one local JSON event and print the existing processor result as JSON."""

import argparse
import json
from pathlib import Path
import sys

from process_comment import process_comment_event


DEFAULT_FILE = Path(__file__).resolve().parents[2] / "contracts/examples/comment-created.v1.json"


def main(argv: list[str] | None = None) -> int:
    """Run offline by default; return 0 for business outcomes, 1/2 for errors."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE,
                        help="Path to one comment event JSON file (default: repository sample)")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--offline", dest="use_ai", action="store_false",
                       help="Disable Gemini calls (default)")
    modes.add_argument("--allow-ai", dest="use_ai", action="store_true",
                       help="Allow real Gemini calls when the parser needs AI assistance")
    parser.set_defaults(use_ai=False)
    args = parser.parse_args(argv)

    # Limit input-error handling to file I/O and JSON decoding.
    try:
        with args.file.open("r", encoding="utf-8-sig") as file:
            event = json.load(file)
    except (OSError, UnicodeError):
        print("Input error: cannot read the input file as UTF-8.", file=sys.stderr)
        return 2
    except json.JSONDecodeError as error:
        print(f"Input error: invalid JSON at line {error.lineno}, column {error.colno}.",
              file=sys.stderr)
        return 2

    result = process_comment_event(event, use_ai=args.use_ai)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
