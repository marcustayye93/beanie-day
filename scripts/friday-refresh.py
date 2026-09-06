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

# Preferences that inform taste but must never appear as destination cards
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


def next_or_current_friday(today: date) -> date:
    # Monday=0 … Friday=4
    delta = (4 - today.weekday()) % 7
    return today + timedelta(days=delta)


def format_label(start: date, end: date) -> str:
    if start.month == end.month:
        return f"{start.day} {start.strftime('%b')} – {end.day} {end.strftime('%b %Y')}"
    return f"{start.day} {start.strftime('%b')} – {end.day} {end.strftime('%b %Y')}"


def map_zone(raw) -> str | None:
    """Map activity travel.zone into the five quota buckets. Missing → unknown."""
    if raw is None:
        return None
    z = str(raw).strip()
    if not z:
        return None
    key = z.lower().replace(" ", "").replace("_", "-")
    if key in ("central",):
        return "Central"
    # Central-East → East (Kallang / Sports Hub fringe); also plain East
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
    """Confirmed cards only: confirmNeeded not true, real venue, concrete source.url."""
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

    prev_zones = existing.get("zones") if isinstance(existing.get("zones"), dict) else {}
    counts = {z: 0 for z in ZONE_ORDER}

    for act in activities:
        if not isinstance(act, dict) or not counts_for_quota(act):
            continue
        travel = act.get("travel") if isinstance(act.get("travel"), dict) else {}
        bucket = map_zone(travel.get("zone"))
        if bucket is None:
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
        zones[z] = {
            "status": status,
            "count": count,
            "note": str(prev.get("note") or ""),
        }

    summary = " · ".join(f"{z} {counts[z]}/{quotas[z]}" for z in ZONE_ORDER)

    return {
        "version": int(existing.get("version") or 1),
        "refreshedOn": today.isoformat(),
        "quotas": quotas,
        "zones": zones,
        "summary": summary,
    }


def main() -> None:
    today = date.today()
    start = next_or_current_friday(today)
    # If we're past Friday evening logic: on Fri–Thu show that Friday's week
    # If today is Sat/Sun, still show the Friday that started this weekend
    if today.weekday() > 4:  # Sat=5 Sun=6 → use most recent Friday
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

    # Safety: drop familiar staples from the feed (defensive), and flag them
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
        # Schema consistency: ensure fresh is a bool when present
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

    # Zone pass: recompute from confirmed activities only — never invent
    meta["zonePass"] = recompute_zone_pass(meta, kept, today)

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
