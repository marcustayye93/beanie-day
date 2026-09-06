#!/usr/bin/env python3
"""
Friday refresh for Beanie Day.

- Rolls week meta to the current/next Friday window
- Stamps refreshedOn / nextRefresh
- Appends a curator reminder into meta (content still human-curated for quality)
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


def next_or_current_friday(today: date) -> date:
    # Monday=0 … Friday=4
    delta = (4 - today.weekday()) % 7
    return today + timedelta(days=delta)


def format_label(start: date, end: date) -> str:
    if start.month == end.month:
        return f"{start.day} {start.strftime('%b')} – {end.day} {end.strftime('%b %Y')}"
    return f"{start.day} {start.strftime('%b')} – {end.day} {end.strftime('%b %Y')}"


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
            for k in ("id", "title", "venue", "name", "description", "why", "region")
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
        kept.append(act)
    data["activities"] = kept

    if offenders:
        meta["curatorWarnings"] = offenders
        print("WARNING: familiar staples removed:")
        for o in offenders:
            print(" ", o)
    else:
        meta.pop("curatorWarnings", None)

    with DATA.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Updated {DATA}")
    print(f"  Week: {meta['weekLabel']}")
    print(f"  refreshedOn: {meta['refreshedOn']} → next {meta['nextRefresh']}")
    print("  Reminder: replace activities with THIS week’s real openings (quality > volume).")


if __name__ == "__main__":
    main()
