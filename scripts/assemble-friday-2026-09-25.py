#!/usr/bin/env python3
"""Assemble data/week.json from zlib+base64 parts in data/research/friday-2026-09-25/z*.b64"""
from pathlib import Path
import base64, zlib
root = Path(__file__).resolve().parents[1]
parts_dir = root / "data" / "research" / "friday-2026-09-25"
parts = sorted(parts_dir.glob("z*.b64"))
if not parts:
    parts = sorted(parts_dir.glob("part*.b64"))
    if not parts:
        raise SystemExit(f"no parts in {parts_dir}")
    b64 = "".join(p.read_text().strip() for p in parts)
    raw = base64.b64decode(b64)
else:
    b64 = "".join(p.read_text().strip() for p in parts)
    raw = zlib.decompress(base64.b64decode(b64))
out = root / "data" / "week.json"
out.write_bytes(raw)
print(f"wrote {out} ({len(raw)} bytes) from {len(parts)} parts")
