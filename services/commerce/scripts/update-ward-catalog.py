"""Refresh the bundled two-level Vietnamese ward catalog."""

import json
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen


BASE = "https://tinhthanhpho.com/api/v1/new-provinces"
ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src/modules/shipping/address/ward-catalog.ts"
PROVINCES = ROOT / "src/modules/shipping/address/vietnam-provinces.ts"


def fetch(url):
    with urlopen(url, timeout=25) as response:
        return json.load(response)


def province_wards(province):
    result = fetch(f"{BASE}/{province['code']}/wards?limit=500")
    rows = result["data"]
    if len(rows) != result["metadata"]["total"]:
        raise RuntimeError(f"Incomplete ward list for {province['name']}")
    wards = [
        {"code": row["code"], "name": f"{row['type']} {row['name']}"}
        for row in rows
    ]
    if len({ward["code"] for ward in wards}) != len(wards):
        raise RuntimeError(f"Duplicate ward code for {province['name']}")
    return province["name"], sorted(wards, key=lambda ward: ward["name"])


def main():
    source = PROVINCES.read_text(encoding="utf-8")
    block = source.split("export const TINH_THANH = [", 1)[1].split("] as const;", 1)[0]
    expected = set(re.findall(r'"([^"]+)"', block))
    response = fetch(f"{BASE}?limit=100")
    provinces = response["data"]
    if len(provinces) != 34:
        raise RuntimeError("Expected 34 provinces")
    for province in provinces:
        if province["name"] == "Hồ Chí Minh":
            province["name"] = "TP. Hồ Chí Minh"
    if {province["name"] for province in provinces} != expected:
        raise RuntimeError("Province catalog differs from the existing application catalog")

    with ThreadPoolExecutor(max_workers=5) as executor:
        catalog = dict(executor.map(province_wards, provinces))
    count = sum(len(wards) for wards in catalog.values())
    if count < 3300:
        raise RuntimeError(f"Ward catalog unexpectedly small: {count}")

    header = (
        "/**\n"
        " * Vietnamese two-level administrative wards, bundled for stable checkout.\n"
        f" * Source: {BASE} (data version {response['metadata']['data_version']}).\n"
        " * License: CC BY 4.0, credit tinhthanhpho.com.\n"
        " * Refresh with: python scripts/update-ward-catalog.py\n"
        " */\n"
        "export interface CurrentWard { code: string; name: string }\n"
        "export const WARDS_BY_PROVINCE: Record<string, CurrentWard[]> = "
    )
    TARGET.write_text(
        header + json.dumps(dict(sorted(catalog.items())), ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"Saved {count} wards across {len(catalog)} provinces")


if __name__ == "__main__":
    main()
