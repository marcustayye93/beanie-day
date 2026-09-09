#!/usr/bin/env python3
"""
Beanie Day Friday ingest — data wholeness upgrade.

Fills the gaps a human curator can't cover alone:
  1. geocode — stamp travel.lat/lng via OneMap (+ travel.distanceKm from
               HOME_POSTAL as a curator reference; the app recomputes live
               per-user distance from each visitor's own postal code)
  2. fetch   — sweep event candidates around heartland anchors
               (Woodlands / Jurong East / Tampines / Punggol) into
               data/candidates.json (a human review queue; nothing is
               auto-published into week.json)
  3. zones   — report raw zone counts vs quotas + caps so Central can't flood

Run order on Fridays:  geocode -> fetch -> zones -> friday-refresh.py

Env:
  HOME_POSTAL       Home postal for distance math. Default 730587 (Woodlands).
  EVENTBRITE_TOKEN  Private token from https://www.eventbrite.com/platform/api-keys
                    (only needed for `fetch`; everything else works without it).
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEEK = ROOT / "data" / "week.json"
STATE = ROOT / "data" / "zone-pass.state.json"
CANDIDATES = ROOT / "data" / "candidates.json"

HOME_POSTAL = os.environ.get("HOME_POSTAL", "730587").strip() or "730587"
ONEMAP_SEARCH = "https://www.onemap.gov.sg/api/common/elastic/search"

# Heartland anchors for candidate discovery. Editorial sources are
# downtown-biased; sweeping the API around these anchors (instead of one home
# point) is what surfaces suburban events — the core gap for a public audience.
# 12 km per anchor covers the island with overlap; Central needs no anchor
# because editorial coverage already floods it (see the Central cap).
SEARCH_ANCHORS = [
    ("Woodlands", 1.4390, 103.7890),    # North
    ("Jurong East", 1.3331, 103.7422),  # West
    ("Tampines", 1.3531, 103.9452),     # East
    ("Punggol", 1.4043, 103.9025),      # North-East
]
ANCHOR_RADIUS_KM = 12

# Region text -> OneMap query for cases where the raw region is vague
# ("X / Y fringe") or better served by a landmark name.
REGION_GEO_OVERRIDES = {
    "Expo / Changi": "Singapore Expo",
    "Expo": "Singapore Expo",
    "Esplanade / Bayfront": "Esplanade Theatres",
    "Marina Bay / Bayfront": "Marina Bay",
    "City Hall / Padang": "Padang Singapore",
    "Botanic Gardens / Tanglin": "Singapore Botanic Gardens",
    "Sentosa / HarbourFront": "Sentosa",
    "Punggol / Coney": "Punggol",
    "CBD / Orchard fringe": "Orchard Road",
    "Orchard / Emerald Hill": "Emerald Hill",
    "Yishun / Sembawang fringe": "Sembawang",
    "North / Yishun": "Yishun",
    "Jurong East / west fringe": "Jurong East",
    "Jurong / West": "Jurong East",
    "Katong / East Coast": "Katong",
    "Joo Chiat / Katong": "Joo Chiat",
    "Siglap / East Coast": "Siglap",
    "Duxton / Tanjong Pagar": "Duxton",
    "Keong Saik / Outram": "Keong Saik",
    "Chinatown / Club Street": "Chinatown",
    "Boat Quay / Clarke fringe": "Boat Quay",
    "Telok Ayer / CBD": "Telok Ayer",
    "Bugis / Kampong Glam": "Bugis",
    "Orchard": "Orchard Road",
    "Admiralty": "Admiralty MRT Station",
}

VAGUE_SEGMENTS = {"north", "south", "east", "west", "central", "cbd", "fringe"}

ZONE_ORDER = ("Central", "East", "West", "North", "South")
DEFAULT_QUOTAS = {"Central": 4, "East": 2, "West": 2, "North": 2, "South": 1}
DEFAULT_CAPS = {"Central": 10}  # no cap on other zones


# ---------------------------------------------------------------- HTTP helpers

def http_get_json(url, params=None, headers=None, timeout=20, retries=3):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers or {"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            # 4xx (bad key, bad params) will never succeed on retry — fail fast
            if 400 <= exc.code < 500:
                raise RuntimeError(f"GET {exc.code}: {url}")
            last = exc
            time.sleep(1.0 * (attempt + 1))
        except Exception as exc:  # noqa: BLE001 - network flakiness, retry
            last = exc
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"GET failed after {retries} tries: {url} ({last})")


# ---------------------------------------------------------------- geo

def onemap_search(query):
    """Return (lat, lng) for a query via the public OneMap search, or None."""
    data = http_get_json(
        ONEMAP_SEARCH,
        {"searchVal": query, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1},
    )
    results = data.get("results") or []
    if not results:
        return None
    row = results[0]
    try:
        lat = float(row["LATITUDE"])
        lng = float(row["LONGITUDE"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (1.15 <= lat <= 1.48 and 103.6 <= lng <= 104.1):
        return None
    return (lat, lng)


def geo_query_for_region(region):
    region = (region or "").strip()
    if not region:
        return None
    if region in REGION_GEO_OVERRIDES:
        return REGION_GEO_OVERRIDES[region]
    segments = [s.strip() for s in region.split("/") if s.strip()]
    for seg in segments:
        low = seg.lower().replace(" fringe", "").strip()
        if low and low not in VAGUE_SEGMENTS:
            return seg
    return region


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def zone_from_latlng(lat, lng):
    """Mirror of js/home-postal.js zoneFromLatLng thresholds."""
    if lat >= 1.405:
        return "North"
    if lat <= 1.275:
        return "South"
    if lng >= 103.92:
        return "East"
    if lng <= 103.74:
        return "West"
    return "Central"


def map_zone(raw):
    if raw is None:
        return None
    key = str(raw).strip().lower().replace(" ", "").replace("_", "-")
    if key == "central":
        return "Central"
    if key in ("east", "central-east", "centraleast", "east-central", "eastcentral"):
        return "East"
    if key == "west":
        return "West"
    if key == "north":
        return "North"
    if key == "south":
        return "South"
    return None


def resolve_home():
    ll = onemap_search(HOME_POSTAL)
    if not ll:
        raise RuntimeError(f"Could not geocode HOME_POSTAL={HOME_POSTAL}")
    return ll


# ---------------------------------------------------------------- geocode

def cmd_geocode(_args):
    with WEEK.open(encoding="utf-8") as f:
        data = json.load(f)
    activities = data.get("activities", [])
    home_lat, home_lng = resolve_home()
    print(f"Home {HOME_POSTAL} -> ({home_lat:.5f}, {home_lng:.5f})")

    filled, skipped = 0, 0
    for act in activities:
        if not isinstance(act, dict):
            continue
        travel = act.get("travel")
        if not isinstance(travel, dict):
            continue
        if isinstance(travel.get("lat"), (int, float)) and isinstance(travel.get("lng"), (int, float)):
            # still refresh distance in case HOME_POSTAL changed
            travel["distanceKm"] = round(
                haversine_km(home_lat, home_lng, travel["lat"], travel["lng"]), 1
            )
            filled += 1
            continue
        region = travel.get("region") or ""
        query = geo_query_for_region(region)
        ll = onemap_search(query + " Singapore") if query else None
        time.sleep(0.25)  # be polite to the public endpoint
        if not ll:
            print(f"  ! no geo for {act.get('id')}: region={region!r}")
            skipped += 1
            continue
        lat, lng = ll
        travel["lat"] = round(lat, 5)
        travel["lng"] = round(lng, 5)
        travel["geoSource"] = "onemap"
        travel["geoQuery"] = query
        travel["distanceKm"] = round(haversine_km(home_lat, home_lng, lat, lng), 1)
        filled += 1

    with WEEK.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"geocode: {filled} stamped, {skipped} unresolved -> {WEEK}")
    return 0


# ---------------------------------------------------------------- fetch: sources

def norm_title(t):
    return "".join(ch for ch in str(t).lower() if ch.isalnum() or ch.isspace()).strip()


def existing_titles():
    titles = set()
    try:
        data = json.loads(WEEK.read_text(encoding="utf-8"))
        for act in data.get("activities", []):
            if isinstance(act, dict) and act.get("title"):
                titles.add(norm_title(act["title"]))
    except Exception:
        pass
    return titles


# ---------------------------------------------------------------------------
# Ticketmaster Discovery (Singapore) — the structured answer to the SISTIC gap:
# ticketed concerts, theatre, comedy and shows. Direct HTTPS via the public
# Discovery API; needs TICKETMASTER_API_KEY (free at developer.ticketmaster.com).
# ---------------------------------------------------------------------------
TM_API = "https://app.ticketmaster.com/discovery/v2/events.json"
TM_KEYWORDS = [
    "concert", "comedy", "theatre", "musical", "festival",
    "orchestra", "ballet", "opera", "gig", "exhibition",
]


def nearest_anchor(lat, lng):
    best, best_d = None, None
    for name, alat, alng in SEARCH_ANCHORS:
        d = haversine_km(alat, alng, lat, lng)
        if best_d is None or d < best_d:
            best, best_d = name, d
    return best, (round(best_d, 1) if best_d is not None else None)


def fetch_ticketmaster(home_lat, home_lng, start, end):
    """Ticketmaster Discovery sweep for SG events in the week window.

    Returns (status, note, candidates). Events are filtered to the week by
    localDate — the API's date filter is loose, so we enforce it client-side.
    """
    key = (os.environ.get("TICKETMASTER_API_KEY") or "").strip()
    if not key:
        return ("missing_token", "set TICKETMASTER_API_KEY to enable", [])
    start_d = start.date() if hasattr(start, "date") else start
    end_d = end.date() if hasattr(end, "date") else end
    seen = set()
    out = []
    try:
        for kw in TM_KEYWORDS:
            params = {
                "apikey": key,
                "countryCode": "SG",
                "keyword": kw,
                "startDateTime": start.strftime("%Y-%m-%dT00:00:00"),
                "endDateTime": end.strftime("%Y-%m-%dT23:59:59"),
                "size": 50,
                "sort": "date,asc",
            }
            data = http_get_json(TM_API, params)
            for ev in (data.get("_embedded") or {}).get("events", []):
                eid = ev.get("id")
                if not eid or eid in seen:
                    continue
                seen.add(eid)
                cand = tm_event_to_candidate(ev, start_d, end_d)
                if cand:
                    out.append(cand)
            time.sleep(0.4)  # be polite between keyword sweeps
    except Exception as exc:
        return ("error", str(exc)[:160], out)
    return ("ok", f"{len(out)} unique events in week window", out)


def tm_event_to_candidate(ev, start_d, end_d):
    eid = ev.get("id")
    name = (ev.get("name") or "").strip()
    if not eid or not name:
        return None
    dates = (ev.get("dates") or {}).get("start") or {}
    local_date = (dates.get("localDate") or "").strip()
    try:
        ev_date = datetime.strptime(local_date, "%Y-%m-%d").date()
    except ValueError:
        return None
    if ev_date < start_d or ev_date > end_d:
        return None
    local_time = (dates.get("localTime") or "").strip()
    venues = ((ev.get("_embedded") or {}).get("venues")) or [{}]
    venue = venues[0] or {}
    vname = (venue.get("name") or "").strip()
    loc = venue.get("location") or {}
    try:
        vlat = float(loc.get("latitude")) if loc.get("latitude") else None
        vlng = float(loc.get("longitude")) if loc.get("longitude") else None
    except (TypeError, ValueError):
        vlat, vlng = None, None
    zone = zone_from_latlng(vlat, vlng) if vlat and vlng else None
    anchor, dist = nearest_anchor(vlat, vlng) if vlat and vlng else (None, None)
    classifications = []
    for c in ev.get("classifications", []) or []:
        seg = ((c.get("segment") or {}).get("name") or "").strip()
        gen = ((c.get("genre") or {}).get("name") or "").strip()
        if seg and seg not in classifications:
            classifications.append(seg)
        if gen and gen not in classifications:
            classifications.append(gen)
    when = local_date + (f" {local_time[:5]}" if local_time else "")
    return {
        "id": f"cand-tm-{eid}",
        "origin": "ticketmaster",
        "status": "proposed",
        "title": name,
        "description": " · ".join(classifications[:3]),
        "when": when,
        "venue": vname,
        "url": ev.get("url") or "",
        "tabs": ["events"],
        "anchor": anchor,
        "travel": {
            "zone": zone,
            "region": zone or "",
            "lat": vlat,
            "lng": vlng,
            "distanceKm": dist,
            "geoSource": "ticketmaster",
        },
        "source": {"label": "Ticketmaster", "url": ev.get("url") or ""},
    }


def fetch_eventbrite(home_lat, home_lng, start, end):
    """Eventbrite v3 events/search around each heartland anchor.

    Returns (status, note, candidates). Distances on candidates are measured
    from the nearest anchor (curator reference) — the app recomputes per user.
    """
    token = (os.environ.get("EVENTBRITE_TOKEN") or "").strip()
    if not token:
        return ("missing_token", "set EVENTBRITE_TOKEN to enable", [])
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    seen_ids = set()
    out = []
    try:
        for anchor_name, alat, alng in SEARCH_ANCHORS:
            params = {
                "location.latitude": alat,
                "location.longitude": alng,
                "location.within": f"{ANCHOR_RADIUS_KM}km",
                "start_date.range_start": start.strftime("%Y-%m-%dT00:00:00"),
                "start_date.range_end": end.strftime("%Y-%m-%dT23:59:59"),
                "expand": "venue",
                "sort_by": "date",
                "page_size": 50,
            }
            data = http_get_json(
                "https://www.eventbriteapi.com/v3/events/search/",
                params,
                headers=headers,
            )
            for ev in data.get("events", []) or []:
                eid = ev.get("id")
                if not eid or eid in seen_ids:
                    continue
                seen_ids.add(eid)
                cand = event_to_candidate(ev, anchor_name, alat, alng)
                if cand:
                    out.append(cand)
            time.sleep(0.5)  # be polite between anchor sweeps
    except Exception as exc:
        return ("error", str(exc)[:160], out)
    return ("ok", f"{len(out)} unique events across {len(SEARCH_ANCHORS)} anchors", out)


def event_to_candidate(ev, anchor_name, alat, alng):
    name = ((ev.get("name") or {}).get("text") or "").strip()
    if not name:
        return None
    venue = ev.get("venue") or {}
    vlat = venue.get("latitude")
    vlng = venue.get("longitude")
    try:
        vlat = float(vlat) if vlat is not None else None
        vlng = float(vlng) if vlng is not None else None
    except (TypeError, ValueError):
        vlat, vlng = None, None
    zone = zone_from_latlng(vlat, vlng) if vlat and vlng else None
    dist = round(haversine_km(alat, alng, vlat, vlng), 1) if vlat and vlng else None
    desc = ((ev.get("description") or {}).get("text") or "").strip()
    start_local = ((ev.get("start") or {}).get("local") or "").strip()
    return {
        "id": f"cand-eb-{ev.get('id')}",
        "origin": "eventbrite",
        "status": "proposed",
        "title": name,
        "description": desc[:280],
        "when": start_local,
        "venue": (venue.get("name") or "").strip(),
        "url": ev.get("url") or "",
        "tabs": ["events"],
        "anchor": anchor_name,
        "travel": {
            "zone": zone,
            "region": zone or "",
            "lat": vlat,
            "lng": vlng,
            "distanceKm": dist,
            "geoSource": "eventbrite",
        },
        "source": {"label": "Eventbrite", "url": ev.get("url") or ""},
    }


# Registry: add new adapters here as (name, fetch_fn). Each fetch_fn takes
# (home_lat, home_lng, start, end) and returns (status, note, candidates).
SOURCES = {
    "eventbrite": fetch_eventbrite,
    "ticketmaster": fetch_ticketmaster,
    # Next adapters (documented in docs/FRIDAY_ZONE_PASS.md):
    # - STB Tourism Information Hub (tih.stb.gov.sg) — free business account + API key
    # - NLB library events / onePA CC events — no public API; manual Friday beats
}


def week_window():
    """Next Friday 00:00 SGT through +7 days (matches the Friday cron)."""
    today = date.today()
    delta = (4 - today.weekday()) % 7
    start = today + timedelta(days=delta)
    return start, start + timedelta(days=7)


def cmd_fetch(_args):
    home_lat, home_lng = resolve_home()
    start_d, end_d = week_window()
    start = datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc)
    end = datetime(end_d.year, end_d.month, end_d.day, tzinfo=timezone.utc)

    known = existing_titles()
    prev = {}
    if CANDIDATES.exists():
        try:
            prev = json.loads(CANDIDATES.read_text(encoding="utf-8"))
        except Exception:
            prev = {}
    kept = [
        c
        for c in (prev.get("candidates") or [])
        if isinstance(c, dict) and c.get("status") in ("proposed", "approved")
    ]
    known |= {norm_title(c.get("title", "")) for c in kept}
    known_urls = {c.get("url") for c in kept if c.get("url")}

    sources, fresh = {}, []
    for name, fn in SOURCES.items():
        status, note, cands = fn(home_lat, home_lng, start, end)
        added = 0
        for c in cands:
            t = norm_title(c.get("title", ""))
            if not t or t in known or c.get("url") in known_urls:
                continue
            known.add(t)
            if c.get("url"):
                known_urls.add(c["url"])
            fresh.append(c)
            added += 1
        sources[name] = {"status": status, "note": note, "new": added}
        print(f"fetch {name}: {status} — {note} (+{added} new)")

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "homePostal": HOME_POSTAL,
        "home": {"lat": round(home_lat, 5), "lng": round(home_lng, 5)},
        "anchors": [
            {"name": n, "lat": la, "lng": ln, "radiusKm": ANCHOR_RADIUS_KM}
            for n, la, ln in SEARCH_ANCHORS
        ],
        "weekWindow": {"start": start_d.isoformat(), "end": end_d.isoformat()},
        "sources": sources,
        "_note": "Human review queue. Promote by hand into data/week.json activities[]; never auto-publish.",
        "candidates": kept + fresh,
    }
    CANDIDATES.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"fetch: {len(fresh)} new candidates, {len(kept)} carried over -> {CANDIDATES}")
    return 0


# ---------------------------------------------------------------- zones

def load_quotas_caps():
    quotas = dict(DEFAULT_QUOTAS)
    caps = dict(DEFAULT_CAPS)
    try:
        seed = json.loads(STATE.read_text(encoding="utf-8"))
        zp = seed.get("zonePass") or {}
        for k, v in (zp.get("quotas") or {}).items():
            if k in quotas:
                quotas[k] = int(v)
        for k, v in (zp.get("caps") or {}).items():
            caps[k] = int(v)
    except Exception:
        pass
    return quotas, caps


def cmd_zones(_args):
    data = json.loads(WEEK.read_text(encoding="utf-8"))
    counts = {z: 0 for z in ZONE_ORDER}
    for act in data.get("activities", []):
        if not isinstance(act, dict):
            continue
        travel = act.get("travel") if isinstance(act.get("travel"), dict) else {}
        bucket = map_zone(travel.get("zone"))
        if bucket:
            counts[bucket] += 1
    quotas, caps = load_quotas_caps()
    print(f"{'Zone':<9}{'count':>6}{'quota':>7}{'cap':>6}  status")
    over = []
    for z in ZONE_ORDER:
        c, q = counts[z], quotas[z]
        cap = caps.get(z)
        flag = ""
        if c < q:
            flag = "UNDER QUOTA"
        elif cap is not None and c > cap:
            flag = f"OVER CAP (+{c - cap})"
            over.append(z)
        print(f"{z:<9}{c:>6}{q:>7}{str(cap) if cap else '-':>6}  {flag}")
    if over:
        print("WARNING: " + ", ".join(over) + " over cap — trim or move items before relying on cards.")
    else:
        print("zone check clean.")
    return 0


# ---------------------------------------------------------------- main

COMMANDS = {
    "geocode": cmd_geocode,
    "fetch": cmd_fetch,
    "zones": cmd_zones,
}


def main(argv):
    cmds = [c for c in argv[1:] if not c.startswith("-")]
    if not cmds or any(c not in COMMANDS for c in cmds):
        print("usage: friday-ingest.py [geocode] [fetch] [zones]  (runs in given order)", file=sys.stderr)
        return 2
    try:
        for cmd in cmds:
            rc = COMMANDS[cmd]([])
            if rc:
                return rc
    except Exception as exc:  # noqa: BLE001 - surface failures plainly
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
