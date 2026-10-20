"""Build a minimal offline Lambda ZIP from an explicit source allowlist."""

import argparse
import json
from pathlib import Path
import stat
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


SOURCE_DIR = Path(__file__).resolve().parents[1]
MODULES = (
    "lambda_handler.py", "process_comment.py", "parse_intent.py", "intent_policy.py",
    "quantity_parser.py", "product_codes.py", "ai_errors.py",
)


def build_zip(output: Path) -> None:
    """Read every required module first and exclusively create a reproducible ZIP."""
    sources = [(name, (SOURCE_DIR / name).read_bytes()) for name in MODULES]
    with output.open("xb") as destination:
        with ZipFile(destination, "w", compression=ZIP_DEFLATED) as package:
            for name, content in sources:
                entry = ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = (stat.S_IFREG | 0o644) << 16
                entry.compress_type = ZIP_DEFLATED
                package.writestr(entry, content)


def main(argv: list[str] | None = None) -> int:
    """Build locally without installing dependencies or deploying anything."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True,
                        help="New ZIP path in an existing directory; never overwritten")
    args = parser.parse_args(argv)
    try:
        build_zip(args.output)
    except OSError:
        print("Package error: cannot create ZIP from required source files.", file=sys.stderr)
        return 2
    print(json.dumps({"zip": str(args.output.resolve()), "handler": "lambda_handler.handler",
                      "modules": list(MODULES)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
