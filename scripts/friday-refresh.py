#!/usr/bin/env python3
"""
Friday refresh for Beanie Day.

- Rolls week meta to the current/next Friday window
- Stamps refreshedOn / nextRefresh
- Appends a curator reminder into meta (content still human-curated for quality)
- Recomputes meta.zonePass from confirmed activities (does not invent cards)
- Does NOT reintroduce familiar staples (VivoCity, Holland V, AMK Hub, Northpoint, New Bahru)

Run locally:
  python3 scripts/friday-refresh.py

GitHub Actions runs this every Friday 08:00 SGT (00:00 UTC).
"""

from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "week.json"
STATE = ROOT / "data" / "zone-pass.state.json"

BLOCKLIST = (
    "vivocity",
    "vivo city",
    "holland village",
    "holland v",
    "amk hub",
    "ang mo kio hub",
    "northpoint",
    "north point",
    "causeway point",
    "new bahru",
)

ZONE_ORDER = ("Central", "East", "West", "North", "South")
DEFAULT_QUOTAS = {"Central": 4, "East": 2, "West": 2, "North": 2, "South": 1}
# Maximum share guard: Central may exceed its quota, but never the cap.
# Quotas pull the heartlands up; the cap keeps downtown from flooding the week.
DEFAULT_CAPS = {"Central": 10}


def next_or_current_friday(today: date) -> date:
    delta = (4 - today.weekday()) % 7
    return today + timedelta(days=delta)


def format_label(start: date, end: date) -> str:
    if start.month == end.month:
        return f"{start.day} {start.strftime('%b')} – {end.day} {end.strftime('%b %Y')}"
    return f"{start.day} {start.strftime('%b')} – {end.day} {end.strftime('%b %Y')}"


def map_zone(raw) -> str | None:
    if raw is None:
        return None
    z = str(raw).strip()
    if not z:
        return None
    key = z.lower().replace(" ", "").replace("_", "-")
    if key in ("central",):
        return "Central"
    if key in ("east", "central-east", "centraleast", "east-central", "eastcentral"):
        return "East"
    if key in ("west",):
        return "West"
    if key in ("north",):
        return "North"
    if key in ("south",):
        return "South"
    return None


def activity_venue(act: dict) -> str:
    for k in ("venue", "venueName", "name", "place"):
        v = act.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def source_url(act: dict) -> str:
    src = act.get("source")
    if isinstance(src, dict):
        return str(src.get("url") or "").strip()
    return ""


def counts_for_quota(act: dict) -> bool:
    if act.get("confirmNeeded") is True:
        return False
    if not activity_venue(act):
        return False
    url = source_url(act)
    if not url.startswith("http"):
        return False
    return True


def recompute_zone_pass(meta: dict, activities: list, today: date) -> dict:
    existing = meta.get("zonePass") if isinstance(meta.get("zonePass"), dict) else {}
    quotas = dict(DEFAULT_QUOTAS)
    if isinstance(existing.get("quotas"), dict):
        for k, v in existing["quotas"].items():
            if k in DEFAULT_QUOTAS:
                try:
                    quotas[k] = int(v)
                except (TypeError, ValueError):
                    pass

    caps = dict(DEFAULT_CAPS)
    if isinstance(existing.get("caps"), dict):
        for k, v in existing["caps"].items():
            if k in ZONE_ORDER:
                try:
                    caps[k] = int(v)
                except (TypeError, ValueError):
                    pass

    prev_zones = existing.get("zones") if isinstance(existing.get("zones"), dict) else {}
    counts = {z: 0 for z in ZONE_ORDER}
    raw_counts = {z: 0 for z in ZONE_ORDER}

    for act in activities:
        if not isinstance(act, dict):
            continue
        travel = act.get("travel") if isinstance(act.get("travel"), dict) else {}
        bucket = map_zone(travel.get("zone"))
        if bucket is None:
            continue
        raw_counts[bucket] += 1
        if not counts_for_quota(act):
            continue
        counts[bucket] += 1

    zones = {}
    for z in ZONE_ORDER:
        prev = prev_zones.get(z) if isinstance(prev_zones.get(z), dict) else {}
        count = counts[z]
        quota = quotas[z]
        prev_status = str(prev.get("status") or "")
        if count >= quota:
            status = "filled"
        elif prev_status == "skipped" and count == 0:
            status = "skipped"
        else:
            status = "empty"
        note = str(prev.get("note") or "")
        cap = caps.get(z)
        over_cap = cap is not None and raw_counts[z] > cap
        if over_cap:
            add = f"OVER CAP: {raw_counts[z]} items vs cap {cap} — trim before cards go out."
            note = f"{note} {add}".strip()
        zones[z] = {
            "status": status,
            "count": count,
            "rawCount": raw_counts[z],
            "overCap": over_cap,
            "note": note,
        }

    def summary_part(z):
        s = f"{z} {raw_counts[z]}/{quotas[z]}"
        if caps.get(z) is not None and raw_counts[z] > caps[z]:
            s += f" (cap {caps[z]}!)"
        return s

    summary = " · ".join(summary_part(z) for z in ZONE_ORDER)

    return {
        "version": int(existing.get("version") or 1),
        "refreshedOn": today.isoformat(),
        "quotas": quotas,
        "caps": caps,
        "zones": zones,
        "summary": summary,
    }


def main() -> None:
    today = date.today()
    start = next_or_current_friday(today)
    if today.weekday() > 4:
        start = today - timedelta(days=(today.weekday() - 4))

    end = start + timedelta(days=6)
    next_refresh = start + timedelta(days=7)

    with DATA.open(encoding="utf-8") as f:
        data = json.load(f)

    meta = data.setdefault("meta", {})
    meta["weekLabel"] = format_label(start, end)
    meta["weekStart"] = start.isoformat()
    meta["weekEnd"] = end.isoformat()
    meta["refreshedOn"] = today.isoformat()
    meta["nextRefresh"] = next_refresh.isoformat()
    meta["note"] = (
        "Only fresh finds this week — new openings, pop-ups, limited-run events, "
        "and menus you wouldn’t already have bookmarked. Familiar favourites are intentionally left out."
    )

    extra = (os.environ.get("FORCE_NOTE") or "").strip()
    stamp = (
        f"Auto-stamped {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC. "
        "Curate openings from City Nomads Just Opened, Eatbook, Expo events, HappyHourLah "
        "before relying on cards — auto-roll updates dates; humans keep quality high."
    )
    if extra:
        stamp = f"{extra} · {stamp}"
    meta["autoRefreshNote"] = stamp

    def is_blocked(act: dict) -> str | None:
        blob = " ".join(
            str(act.get(k, ""))
            for k in ("id", "title", "venue", "venueName", "name", "description", "why", "region")
        ).lower()
        if isinstance(act.get("travel"), dict):
            blob += " " + str(act["travel"].get("region", "")).lower()
        for bad in BLOCKLIST:
            if bad in blob:
                return bad
        return None

    kept = []
    offenders = []
    for act in data.get("activities", []):
        if not isinstance(act, dict):
            continue
        hit = is_blocked(act)
        if hit:
            offenders.append(f"{act.get('id')}: contains '{hit}'")
            continue
        if "fresh" in act and not isinstance(act["fresh"], bool):
            act["fresh"] = bool(act["fresh"])
        if "venue" in act and act["venue"] is not None:
            act["venue"] = str(act["venue"]).strip()
            if not act["venue"]:
                act.pop("venue", None)
        if "venueName" in act and act["venueName"] is not None:
            act["venueName"] = str(act["venueName"]).strip()
            if not act["venueName"]:
                act.pop("venueName", None)
        kept.append(act)
    data["activities"] = kept

    if offenders:
        meta["curatorWarnings"] = offenders
        print("WARNING: familiar staples removed:")
        for o in offenders:
            print(" ", o)
    else:
        meta.pop("curatorWarnings", None)

    if not isinstance(meta.get("zonePass"), dict) and STATE.exists():
        try:
            seed = json.loads(STATE.read_text(encoding="utf-8"))
            if isinstance(seed.get("zonePass"), dict):
                meta["zonePass"] = seed["zonePass"]
        except Exception:
            pass

    meta["zonePass"] = recompute_zone_pass(meta, kept, today)

    cap_hits = [
        f"{z}: {meta['zonePass']['zones'][z]['rawCount']} items vs cap "
        f"{meta['zonePass']['caps'][z]} — trim or move items out of {z}"
        for z in ZONE_ORDER
        if meta["zonePass"]["zones"][z].get("overCap")
    ]
    if cap_hits:
        warns = meta.get("curatorWarnings")
        if not isinstance(warns, list):
            warns = []
        meta["curatorWarnings"] = warns + cap_hits
        print("WARNING: zone cap exceeded:")
        for w in cap_hits:
            print(" ", w)

    with DATA.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    zp = meta["zonePass"]
    print(f"Updated {DATA}")
    print(f"  Week: {meta['weekLabel']}")
    print(f"  refreshedOn: {meta['refreshedOn']} → next {meta['nextRefresh']}")
    print(f"  zonePass: {zp['summary']}")
    print("  Reminder: replace activities with THIS week’s real openings (quality > volume).")


if __name__ == "__main__":
    main()
