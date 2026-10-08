"""
Read a comment event from a local JSON file and process it.

This script is the DATA SOURCE layer — it only handles:
  1. Reading the file
  2. Parsing JSON
  3. Delegating to process_comment_event()

When Realtime service is ready, a new entry point (e.g. worker.py)
will replace this file's role, but reuse the same process function.
"""

import json
from process_comment import process_comment_event

FILE_PATH = "contracts/examples/comment-created.v1.json"

try:
    # --- Layer 1: File access ---
    with open(FILE_PATH, "r", encoding="utf-8") as file:
        raw = file.read()

    # --- Layer 2: JSON parsing ---
    event = json.loads(raw)

except FileNotFoundError:
    print(f"[FILE ERROR] File not found: {FILE_PATH}")
    raise SystemExit(1)
except PermissionError:
    print(f"[FILE ERROR] Permission denied: {FILE_PATH}")
    raise SystemExit(1)
except json.JSONDecodeError as e:
    print(f"[JSON ERROR] Invalid JSON in {FILE_PATH}: {e}")
    raise SystemExit(1)

# --- Layer 3: Process (delegated) ---
result = process_comment_event(event)

if result["status"] != "ok":
    print(f"[DATA ERROR] {result['message']}")
    raise SystemExit(1)

print(f"[OK] {result['message']}")
print(f"  Session : {result['session_id']}")
print(f"  Customer: {result['customer_id']}")

intent = result["intent"]
if intent["has_intent"]:
    print(f"  Confidence: {intent['confidence']}")
    print(f"  Source    : {intent['source']}")
    print(f"  Product   : {intent['product_code'] or '—'}")
    print(f"  Color     : {intent['color'] or '—'}")
    print(f"  Size      : {intent['size'] or '—'}")
    print(f"  Quantity  : {intent['quantity'] or '—'}")
else:
    print("  (No purchase intent detected)")