#!/usr/bin/env python3
"""Assemble friday zone-pass week.json from b64 parts. Do not invent venues."""
from pathlib import Path
import base64, json
root = Path(__file__).resolve().parents[1]
parts_dir = root / "data/research/friday-2026-09-18"
parts = sorted(parts_dir.glob("part*.b64"))
assert parts, f"no parts in {parts_dir}"
raw = base64.b64decode("".join(p.read_text().strip() for p in parts))
data = json.loads(raw)
assert "meta" in data and "activities" in data
out = root / "data" / "week.json"
if not raw.endswith(b"\n"):
    raw = raw + b"\n"
out.write_bytes(raw)
print("wrote", out, "bytes", out.stat().st_size, "activities", len(data["activities"]))
