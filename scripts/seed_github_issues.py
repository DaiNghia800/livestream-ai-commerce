#!/usr/bin/env python3
"""Tạo GitHub Issues cho các task trong tasks.csv.

Nguồn duy nhất là docs/design/draft-order-reservation/tasks.csv — sửa CSV
rồi chạy lại, không sửa script.

Cách dùng:
    gh auth login                       # chạy một lần, script không tự làm thay
    python scripts/seed_github_issues.py --dry-run     # xem trước, không tạo gì
    python scripts/seed_github_issues.py               # tạo thật

Chạy lại được nhiều lần: issue nào đã có (trùng tiêu đề) thì bỏ qua.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "docs" / "design" / "draft-order-reservation" / "tasks.csv"
DESIGN_DOC = "docs/design/draft-order-reservation/README.md"
MILESTONE = "Đơn nháp & Giữ hàng"

LABELS = {
    "area:design": ("8B5CF6", "Thiết kế, tài liệu, ERD"),
    "area:infra": ("64748B", "Docker, CI, môi trường"),
    "area:db": ("0E7490", "Schema, migration, truy vấn"),
    "area:api": ("1D4ED8", "Service, endpoint, job nền"),
    "area:test": ("15803D", "Kiểm thử"),
    "priority:critical-path": ("B91C1C", "Nằm trên đường găng, chặn task khác"),
    "priority:high": ("EA580C", "Ưu tiên cao"),
    "priority:medium": ("CA8A04", "Ưu tiên trung bình"),
    "feature:draft-order": ("BE185D", "Đơn nháp và giữ hàng"),
}


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", check=check)


def require_gh() -> None:
    try:
        run(["gh", "--version"])
    except FileNotFoundError:
        sys.exit("Chưa cài gh CLI. Xem https://cli.github.com/")
    probe = run(["gh", "auth", "status"], check=False)
    if probe.returncode != 0:
        sys.exit("gh chưa đăng nhập. Chạy:  gh auth login")


def repo_slug() -> str:
    out = run(["gh", "repo", "view", "--json", "nameWithOwner"]).stdout
    return json.loads(out)["nameWithOwner"]


def ensure_labels(dry: bool) -> None:
    for name, (color, desc) in LABELS.items():
        if dry:
            print(f"  [dry] label: {name}")
            continue
        run(["gh", "label", "create", name, "--color", color,
             "--description", desc, "--force"], check=False)


def ensure_milestone(slug: str, dry: bool) -> bool:
    out = run(["gh", "api", f"repos/{slug}/milestones?state=all"], check=False).stdout
    existing = {m["title"] for m in json.loads(out or "[]")}
    if MILESTONE in existing:
        print(f"  milestone đã có: {MILESTONE}")
        return True
    if dry:
        print(f"  [dry] milestone: {MILESTONE}")
        return True
    r = run(["gh", "api", f"repos/{slug}/milestones", "-f", f"title={MILESTONE}",
             "-f", "description=Thiết kế giao dịch tạo đơn nháp và giữ hàng"], check=False)
    if r.returncode != 0:
        print(f"  ! không tạo được milestone: {r.stderr.strip()}")
        return False
    print(f"  tạo milestone: {MILESTONE}")
    return True


def existing_issues() -> dict[str, int]:
    out = run(["gh", "issue", "list", "--state", "all", "--limit", "200",
               "--json", "number,title"]).stdout
    return {i["title"]: i["number"] for i in json.loads(out or "[]")}


def build_body(row: dict[str, str]) -> str:
    items = [x.strip() for x in row["checklist"].split("|") if x.strip()]
    lines = [row["summary"].strip(), "", "## Việc cần làm", ""]
    lines += [f"- [ ] {it}" for it in items]
    lines += ["", "## Xong khi", "", row["acceptance"].strip(), "", "---", ""]
    lines += [f"- Thiết kế: [{DESIGN_DOC}]({DESIGN_DOC})",
              f"- Mã task: `{row['id']}`  ·  Ước lượng: {row['estimate_days']} ngày"]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="in ra những gì sẽ tạo, không gọi API ghi")
    args = ap.parse_args()

    if not CSV_PATH.exists():
        sys.exit(f"Không thấy {CSV_PATH}")

    require_gh()
    slug = repo_slug()
    print(f"Repo: {slug}")
    if args.dry_run:
        print("*** DRY RUN — không tạo gì cả ***")

    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    print(f"Đọc {len(rows)} task từ tasks.csv\n")

    print("Nhãn:")
    ensure_labels(args.dry_run)
    print("\nMilestone:")
    has_milestone = ensure_milestone(slug, args.dry_run)

    have = {} if args.dry_run else existing_issues()
    created: dict[str, int] = {}

    print("\nIssue:")
    for row in rows:
        title = f"[{row['id']}] {row['title']}"
        if title in have:
            created[row["id"]] = have[title]
            print(f"  bỏ qua (đã có #{have[title]}): {title}")
            continue

        cmd = ["gh", "issue", "create", "--title", title, "--body", build_body(row),
               "--label", "feature:draft-order",
               "--label", f"area:{row['area']}",
               "--label", f"priority:{row['priority']}"]
        if has_milestone:
            cmd += ["--milestone", MILESTONE]

        if args.dry_run:
            print(f"  [dry] {title}  ({row['area']}, {row['priority']}, {row['estimate_days']}d)")
            continue

        r = run(cmd, check=False)
        if r.returncode != 0:
            print(f"  ! lỗi: {title}\n    {r.stderr.strip()}")
            continue
        m = re.search(r"/issues/(\d+)", r.stdout)
        if m:
            created[row["id"]] = int(m.group(1))
            print(f"  #{m.group(1)}  {title}")

    if args.dry_run:
        print("\nDry run xong. Bỏ --dry-run để tạo thật.")
        return

    # Pass 2: nối quan hệ phụ thuộc, giờ mới biết số hiệu issue
    blocks: dict[str, list[str]] = {r["id"]: [] for r in rows}
    for row in rows:
        for dep in (d.strip() for d in row["depends_on"].split(",") if d.strip()):
            blocks.setdefault(dep, []).append(row["id"])

    print("\nNối phụ thuộc:")
    for row in rows:
        num = created.get(row["id"])
        if not num:
            continue
        deps = [created[d.strip()] for d in row["depends_on"].split(",")
                if d.strip() and d.strip() in created]
        blocked = [created[b] for b in blocks.get(row["id"], []) if b in created]
        if not deps and not blocked:
            continue
        extra = ["", "## Phụ thuộc", ""]
        extra.append("- Chờ: " + ", ".join(f"#{d}" for d in deps) if deps else "- Chờ: không")
        if blocked:
            extra.append("- Chặn: " + ", ".join(f"#{b}" for b in blocked))
        body = run(["gh", "issue", "view", str(num), "--json", "body"]).stdout
        new_body = json.loads(body)["body"] + "\n" + "\n".join(extra) + "\n"
        r = run(["gh", "issue", "edit", str(num), "--body", new_body], check=False)
        print(f"  #{num} {'ok' if r.returncode == 0 else '! ' + r.stderr.strip()}")

    print(f"\nXong. Tạo/ghi nhận {len(created)} issue.")
    print(f"Xem: gh issue list --milestone '{MILESTONE}'")


if __name__ == "__main__":
    main()
