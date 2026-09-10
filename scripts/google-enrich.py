#!/usr/bin/env python3
"""Google Places verification for Bean There research.

Stamps Google data (open status, rating, review count, hours, coordinates)
onto food picks and Friday candidates so a human reviewer sees verification
state instead of discovering closures after publishing. Nothing is
auto-published: closed venues are flagged, never deleted.

Commands:
  enrich-picks        verify every pick in data/research/food-picks.json
  enrich-candidates   verify data/candidates.json (the human review queue)
  verify              enrich-candidates + print a flag report (Friday pipeline)

Cache: data/research/google-cache.json, keyed by pick/candidate id, 30-day
TTL. One text-search + one details call per uncached place; at our volumes
this stays inside the Places API free tier.

Auth: calls the google-places skill CLI (~/workspace/skills/google-places),
which uses the stored custom.google-places connector. No keys in this file.
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICKS = os.path.join(REPO, "data", "research", "food-picks.json")
CANDIDATES = os.path.join(REPO, "data", "candidates.json")
CACHE = os.path.join(REPO, "data", "research", "google-cache.json")
GCLI = os.path.expanduser("~/workspace/skills/google-places/bin/gplaces")
TTL_DAYS = 30


def load_cache():
    try:
        return json.load(open(CACHE))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(cache, open(CACHE, "w"), indent=1, ensure_ascii=False)


def gplaces(*args):
    r = subprocess.run([GCLI, *args], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(f"gplaces {' '.join(args[:2])} failed: {r.stderr.strip()[:200]}")
    return json.loads(r.stdout or "null")


def tokens(s):
    # "singapore" is appended to every query as a locale hint; it must not
    # count against the name match.
    return set(re.findall(r"[a-z0-9]+", (s or "").lower())) - {"singapore"}


def match_ratio(query, name):
    qt, nt = tokens(query), tokens(name)
    if not qt:
        return 0.0
    return len(qt & nt) / len(qt)


def enrich_one(pid, query):
    """Return (record, flags). Record is None when Google has no confident match."""
    results = gplaces("search", query) or []
    if not results:
        return None, ["no Google match"]
    top = results[0]
    name = top["displayName"]["text"]
    ratio = match_ratio(query, name)
    detail = gplaces("details", top["id"]) or {}
    hours = (detail.get("regularOpeningHours") or {}).get("weekdayDescriptions", [])
    loc = detail.get("location") or top.get("location") or {}
    rec = {
        "place_id": top["id"],
        "name": name,
        "address": detail.get("formattedAddress") or top.get("formattedAddress"),
        "rating": detail.get("rating") if detail.get("rating") is not None else top.get("rating"),
        "userRatingCount": detail.get("userRatingCount") if detail.get("userRatingCount") is not None else top.get("userRatingCount"),
        "businessStatus": detail.get("businessStatus") or top.get("businessStatus"),
        "priceLevel": detail.get("priceLevel") or top.get("priceLevel"),
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "hours": hours,
        "match_ratio": round(ratio, 2),
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    flags = []
    if rec["businessStatus"] and rec["businessStatus"] != "OPERATIONAL":
        flags.append(f"status={rec['businessStatus']}")
    if ratio < 0.5:
        flags.append("weak name match")
    if rec["rating"] is not None and rec["rating"] < 3.5:
        flags.append(f"low rating {rec['rating']}")
    return rec, flags


def fresh(entry):
    try:
        ts = datetime.fromisoformat(entry["fetched_at"])
        return (datetime.now(timezone.utc) - ts).days < TTL_DAYS
    except Exception:
        return False


def pick_query(pick):
    title = (pick.get("title") or "").split("—")[0].split("-")[0].strip()
    area = pick.get("neighbourhood") or ""
    return f"{title} {area} Singapore".strip()


def cmd_enrich_picks(_args):
    picks = json.load(open(PICKS))
    cache = load_cache()
    for p in picks:
        pid = p["id"]
        entry = cache.get(pid)
        if entry and fresh(entry):
            print(f"  cached {pid}: {entry.get('rating')} x {entry.get('userRatingCount')}")
            continue
        rec, flags = enrich_one(pid, pick_query(p))
        if rec:
            cache[pid] = rec
            flag_txt = f"  !! {' '.join(flags)}" if flags else ""
            print(f"  ok {pid}: {rec['rating']} x {rec['userRatingCount']} {rec['businessStatus']}{flag_txt}")
        else:
            print(f"  !! {pid}: {'; '.join(flags)}")
        time.sleep(0.4)
    save_cache(cache)
    return 0


def cmd_enrich_candidates(_args):
    data = json.load(open(CANDIDATES))
    if isinstance(data, dict) and isinstance(data.get("candidates"), list):
        items = data["candidates"]
        def persist():
            json.dump(data, open(CANDIDATES, "w"), indent=1, ensure_ascii=False)
    else:
        items = data if isinstance(data, list) else list(data.values())
        def persist():
            json.dump(data, open(CANDIDATES, "w"), indent=1, ensure_ascii=False)
    cache = load_cache()
    report = []
    for c in items:
        cid = c.get("id", c.get("title", "?"))
        entry = cache.get(cid)
        if entry and fresh(entry):
            rec, flags = entry, []
        else:
            venue = c.get("venue") or ""
            query = f"{venue} Singapore" if venue else f"{c.get('title','')} Singapore"
            rec, flags = enrich_one(cid, query)
            if rec:
                cache[cid] = rec
            time.sleep(0.4)
        if rec:
            c["google"] = {
                "place_id": rec["place_id"],
                "name": rec["name"],
                "rating": rec["rating"],
                "userRatingCount": rec["userRatingCount"],
                "businessStatus": rec["businessStatus"],
                "match_ratio": rec["match_ratio"],
            }
            status = "ok " if not flags else "FLAG"
            print(f"  {status} {cid}: {rec['name']} ({rec['rating']} x {rec['userRatingCount']}, {rec['businessStatus']})")
        else:
            c.pop("google", None)
            print(f"  -- {cid}: {'; '.join(flags)}")
        if flags:
            report.append((cid, flags))
    save_cache(cache)
    persist()
    return report


def cmd_verify(_args):
    print("Google-verifying candidates.json (review queue; nothing auto-published)...")
    report = cmd_enrich_candidates(_args)
    print()
    if not report:
        print("verify: no flags — all matched candidates look operational.")
    else:
        print("verify: HUMAN REVIEW NEEDED")
        for cid, flags in report:
            print(f"  !! {cid}: {'; '.join(flags)}")
    return 0


BARS = os.path.join(REPO, "data", "happy-hours.json")


def cmd_enrich_bars(_args):
    """Verify every bar in data/happy-hours.json (the Cheapest Pints list).

    Bars were never in the Friday pipeline; this closes that gap. Closed
    venues are flagged for human removal, never auto-deleted.
    """
    data = json.load(open(BARS))
    bars = data.get("bars", data) if isinstance(data, dict) else data
    cache = load_cache()
    report = []
    for b in bars:
        bid = b["id"]
        entry = cache.get(bid)
        if entry and fresh(entry):
            rec, flags = entry, []
            print(f"  cached {bid}: {rec.get('rating')} x {rec.get('userRatingCount')} {rec.get('businessStatus')}")
        else:
            query = f"{b['bar']} {b.get('area','')} Singapore".strip()
            rec, flags = enrich_one(bid, query)
            if rec:
                cache[bid] = rec
            status = "ok " if not flags else "FLAG"
            if rec:
                print(f"  {status} {bid}: {rec['name']} ({rec['rating']} x {rec['userRatingCount']}, {rec['businessStatus']})")
            else:
                print(f"  -- {bid}: {'; '.join(flags)}")
            time.sleep(0.4)
        if flags:
            report.append((bid, flags))
    save_cache(cache)
    print()
    if not report:
        print("enrich-bars: no flags — all bars look operational.")
    else:
        print("enrich-bars: HUMAN REVIEW NEEDED")
        for bid, flags in report:
            print(f"  !! {bid}: {'; '.join(flags)}")
    return 0


COMMANDS = {
    "enrich-picks": cmd_enrich_picks,
    "enrich-candidates": cmd_enrich_candidates,
    "enrich-bars": cmd_enrich_bars,
    "verify": cmd_verify,
}


def main(argv):
    cmds = [c for c in argv[1:] if not c.startswith("-")]
    if not cmds or any(c not in COMMANDS for c in cmds):
        print("usage: google-enrich.py [enrich-picks|enrich-candidates|verify]", file=sys.stderr)
        return 2
    for cmd in cmds:
        rc = COMMANDS[cmd]([])
        if rc:
            return rc if isinstance(rc, int) else 0
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
