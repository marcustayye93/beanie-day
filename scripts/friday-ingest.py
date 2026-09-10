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
  4. verify  — Google-verify candidates.json (open status, rating, hours);
               flags closures for human review, never auto-publishes

Run order on Fridays:  geocode -> fetch -> verify -> zones -> friday-refresh.py

Env:
  HOME_POSTAL       Home postal for distance math. Default 730587 (Woodlands).
  EVENTBRITE_TOKEN  Private token from https://www.eventbrite.com/platform/api-keys
                    (only needed for `fetch` on machines without the eventbrite
                    skill; on this machine the stored credential is used via
                    the skill's eb-call CLI. Everything else works without it).
"""

from __future__ import annotations

import json
import math
import os
import re
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mrt import stamp_nearest_mrt  # noqa: E402  (nearest-MRT stamping)
from zones import zone_from_latlng as _zone_ll  # noqa: E402  (shared thresholds)

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
    """Shared thresholds (scripts/zones.py); full zone names."""
    return _zone_ll(lat, lng) or "Central"


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
            stamp_nearest_mrt(travel)
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
        stamp_nearest_mrt(travel)
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
# SISTIC (Singapore) — the main local ticketing platform: concerts, theatre,
# comedy, musicals. No public API is offered, so this adapter reads the same
# CMS JSON the sistic.com.sg site itself uses (verified 2026-09-09):
#   GET https://cms.sistic.com.sg/sistic/docroot/api/get-solr-search-results
#       ?client=1&first=0&limit=100&search=a&sort_type=date&sort_order=ASC
#       &genre=&index=global
# It is an undocumented, unauthenticated endpoint — no key needed — but it can
# change without notice, so failures degrade to ("error", ...) like any source.
# ---------------------------------------------------------------------------
SISTIC_API = "https://cms.sistic.com.sg/sistic/docroot/api/get-solr-search-results"
SISTIC_EVENT_URL = "https://www.sistic.com.sg/events/{}"

# Venue-name fallbacks: SISTIC often lists hall names OneMap doesn't know
# ("Esplanade Recital Studio"). Each query below was verified against OneMap
# on 2026-09-09 — add new rows only after verifying the same way.
SISTIC_VENUE_HINTS = [
    ("esplanade", "Esplanade Singapore"),
    ("scape", "Scape Orchard Singapore"),
    ("victoria concert hall", "Victoria Concert Hall Singapore"),
    ("national gallery", "National Gallery Singapore"),
    ("arts house", "The Arts House Singapore"),
]


def geocode_sistic_venue(venue):
    """Best-effort lat/lng for a SISTIC venue string. Returns (lat, lng, hint_used)."""
    if not venue:
        return None, None, False
    ll = onemap_search(venue + " Singapore")
    if ll:
        return round(ll[0], 5), round(ll[1], 5), False
    lowered = venue.lower()
    for keyword, query in SISTIC_VENUE_HINTS:
        if keyword in lowered:
            ll = onemap_search(query)
            if ll:
                return round(ll[0], 5), round(ll[1], 5), True
    return None, None, False


def nearest_anchor(lat, lng):
    best, best_d = None, None
    for name, alat, alng in SEARCH_ANCHORS:
        d = haversine_km(alat, alng, lat, lng)
        if best_d is None or d < best_d:
            best, best_d = name, d
    return best, (round(best_d, 1) if best_d is not None else None)

_SISTIC_DATE_RE = re.compile(
    r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})",
    re.IGNORECASE,
)


def parse_sistic_date(text):
    """First concrete calendar date in SISTIC's free-text event_date.

    Returns a date or None. Handles 'Mon, 19 Oct 2026, 8pm',
    'Fri, 21 Aug 2026 - Wed, 30 Sep 2026' (takes the start) and multi-show
    strings. Returns None for 'Daily', 'Valid for 90 days…' and the like —
    those are evergreen listings, not week-specific candidates.
    """
    m = _SISTIC_DATE_RE.search(text or "")
    if not m:
        return None
    try:
        return datetime.strptime(
            f"{m.group(1)} {m.group(2)[:3].title()} {m.group(3)}", "%d %b %Y"
        ).date()
    except ValueError:
        return None


def strip_html(text):
    return re.sub(r"<[^>]+>", " ", text or "")


def fetch_sistic(home_lat, home_lng, start, end):
    """SISTIC CMS sweep for events in the week window.

    Returns (status, note, candidates). No API key needed. The week filter is
    applied client-side on the parsed event_date; geocoding uses the existing
    OneMap helper so candidates carry zone + nearest anchor for the curator.
    """
    start_d = start.date() if hasattr(start, "date") else start
    end_d = end.date() if hasattr(end, "date") else end
    seen = set()
    dated = []
    try:
        first = 0
        total = None
        while total is None or first < total:
            params = {
                "client": "1",
                "first": first,
                "limit": 100,
                "search": "a",  # mandatory param; broad match
                "sort_type": "date",
                "sort_order": "ASC",
                "genre": "",
                "index": "global",
            }
            data = http_get_json(SISTIC_API, params)
            if total is None:
                total = int(data.get("total_records") or 0)
            rows = data.get("data") or []
            if not rows:
                break
            for ev in rows:
                nid = ev.get("nid")
                if not nid or nid in seen:
                    continue
                seen.add(nid)
                ev_date = parse_sistic_date(ev.get("event_date"))
                if ev_date is None:
                    continue  # evergreen / undated listing
                if ev_date < start_d or ev_date > end_d:
                    continue
                dated.append((ev, ev_date))
            first += len(rows)
            time.sleep(0.3)  # be polite between pages
    except Exception as exc:
        return ("error", str(exc)[:160], [])
    out = []
    for ev, ev_date in dated:
        cand = sistic_event_to_candidate(ev, ev_date)
        if cand:
            out.append(cand)
            time.sleep(0.25)  # be polite to the OneMap endpoint
    return ("ok", f"{len(out)} dated events in week window ({len(seen)} scanned)", out)


def sistic_event_to_candidate(ev, ev_date):
    nid = ev.get("nid")
    title = (ev.get("title") or "").strip()
    if not nid or not title:
        return None
    alias = (ev.get("alias") or "").strip()
    url = SISTIC_EVENT_URL.format(alias) if alias else ""
    venue = (ev.get("venue") or "").strip()
    genre = (ev.get("genre") or "").strip()
    bits = [b for b in [genre] if b]
    try:
        price = float(ev.get("min_price")) if ev.get("min_price") else None
    except (TypeError, ValueError):
        price = None
    if price:
        bits.append(f"from S${price:g}")
    syn = strip_html(ev.get("synopsis"))
    syn = re.sub(r"\s+", " ", syn).strip()
    if syn:
        bits.append(syn[:220] + ("…" if len(syn) > 220 else ""))
    vlat, vlng, hinted = geocode_sistic_venue(venue)
    zone = zone_from_latlng(vlat, vlng) if vlat and vlng else None
    anchor, dist = nearest_anchor(vlat, vlng) if vlat and vlng else (None, None)
    return {
        "id": f"cand-sistic-{nid}",
        "origin": "sistic",
        "status": "proposed",
        "title": title,
        "description": " · ".join(bits),
        "when": (ev.get("event_date") or "").strip(),
        "date": ev_date.isoformat(),
        "venue": venue,
        "url": url,
        "tabs": ["events"],
        "anchor": anchor,
        "travel": {
            "zone": zone,
            "region": zone or "",
            "lat": vlat,
            "lng": vlng,
            "distanceKm": dist,
            "geoSource": ("onemap-hint" if hinted else "onemap") if vlat else None,
        },
        "source": {"label": "SISTIC", "url": url},
    }


# ---------------------------------------------------------------- Eventbrite
#
# The documented GET /v3/events/search/ was removed in Feb 2020 — do NOT use
# it. This adapter uses the undocumented POST
# https://www.eventbriteapi.com/v3/destination/search/, the same endpoint the
# eventbrite.com discovery frontend calls (request shape verified live
# 2026-09-10 from its JS bundles + tokened runs).
#   {"event_search": {"places": ["85632605"], "page_size": 50,
#                     "dates": ["future"], "q": "kids family children",
#                     "continuation": "<token>"}}
# `dates` takes enum strings only ("future", "today", "this_weekend") — no
# server-side custom range — so the sweep filters client-side to [start, end].
# Place ID 85632605 = Singapore (country), scraped from the SSR bytes of
# https://www.eventbrite.com/d/singapore/events/ (single "placeId").
# q="kids family children" keeps the sweep family-plausible (~176 events vs
# thousands island-wide); the human review queue filters the rest.
#
# Honest limits: this endpoint publishes no venue name, no coordinates and
# no price. Candidates carry nulls for those; the curator fills venue/geo
# when promoting by hand. Never invent them here.
EB_DEST_SEARCH = "https://www.eventbriteapi.com/v3/destination/search/"
EB_SG_PLACE_ID = "85632605"  # Singapore, verified 2026-09-10
EB_Q = "kids family children"


def _eb_sg_post(body):
    """POST a dict body to destination/search; return the parsed payload.

    Prefers EVENTBRITE_TOKEN (env Bearer). Falls back to the eventbrite
    skill's eb-call CLI, which authenticates via Marcus's stored credential.
    """
    token = (os.environ.get("EVENTBRITE_TOKEN") or "").strip()
    if token:
        req = urllib.request.Request(
            EB_DEST_SEARCH, data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json",
                     "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise RuntimeError(f"Eventbrite HTTP {exc.code}: "
                               f"{exc.read()[:200]!r}")
    import subprocess
    cli = Path.home() / "workspace" / "skills" / "eventbrite" / "bin" / "eb-call"
    if not cli.exists():
        raise RuntimeError("no EVENTBRITE_TOKEN in env and no eventbrite skill CLI")
    r = subprocess.run([str(cli), "POST", EB_DEST_SEARCH, json.dumps(body)],
                       capture_output=True, text=True, timeout=90)
    if r.returncode != 0:
        raise RuntimeError(f"eb-call failed: {r.stderr.strip()[:200]}")
    return json.loads(r.stdout)


def fetch_eventbrite(home_lat, home_lng, start, end):
    """Eventbrite destination/search island-wide sweep.

    Returns (status, note, candidates). Distances/zones are NOT computed —
    the endpoint gives no coordinates — so travel stays null and the
    curator fills venue/geo on promotion.
    """
    try:
        start_s, end_s = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
        out, seen, pages = [], set(), 0
        continuation = None
        for _ in range(6):  # ~176 events at page_size 50
            body = {"event_search": {"places": [EB_SG_PLACE_ID],
                                     "page_size": 50,
                                     "dates": ["future"],
                                     "q": EB_Q}}
            if continuation:
                body["event_search"]["continuation"] = continuation
            payload = _eb_sg_post(body)
            pages += 1
            evs = (payload.get("events") or {}).get("results", [])
            for ev in evs:
                eid = str(ev.get("eventbrite_event_id") or ev.get("id") or "")
                if not eid or eid in seen or ev.get("is_cancelled"):
                    continue
                seen.add(eid)
                sd = str(ev.get("start_date") or "")
                if not (start_s <= sd <= end_s):
                    continue
                cand = event_to_candidate(ev, eid)
                if cand:
                    out.append(cand)
            continuation = ((payload.get("events") or {})
                            .get("pagination", {}).get("continuation"))
            if not continuation:
                break
            time.sleep(0.5)  # be polite between pages
    except Exception as exc:  # noqa: BLE001 - fragile endpoint, never fatal
        return ("error", str(exc)[:160], [])
    return ("ok", f"{len(out)} events in window (island-wide, {pages} pages)", out)


def event_to_candidate(ev, eid):
    name = (ev.get("name") or "").strip()
    if not name:
        return None
    sd = str(ev.get("start_date") or "")
    st, et = ev.get("start_time"), ev.get("end_time")
    when = f"{sd} {(st or '').strip()}–{(et or '').strip()}".strip() if (st or et) else sd
    desc = (ev.get("summary") or "").strip()
    if ev.get("is_online_event"):
        desc = (desc + " [Online event]").strip()
    url = ev.get("url") or ""
    return {
        "id": f"cand-eb-{eid}",
        "origin": "eventbrite",
        "status": "proposed",
        "title": name,
        "description": desc[:280] or None,
        "when": when or None,
        "venue": None,  # not published by destination/search — curator fills in
        "url": url,
        "tabs": ["events"],
        "anchor": "Singapore (island-wide)",
        "travel": {
            "zone": None,
            "region": "Singapore",
            "lat": None,
            "lng": None,
            "distanceKm": None,
            "geoSource": None,
        },
        "source": {"label": "Eventbrite", "url": url},
    }


# Registry: add new adapters here as (name, fetch_fn). Each fetch_fn takes
# (home_lat, home_lng, start, end) and returns (status, note, candidates).
SOURCES = {
    "eventbrite": fetch_eventbrite,
    "sistic": fetch_sistic,
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

def cmd_verify(_args):
    """Google-verify the candidate review queue (scripts/google-enrich.py).

    Stamps open status / rating / hours onto candidates.json and flags
    closures for human review. Nothing is auto-published or deleted.
    """
    import subprocess

    script = str(ROOT / "scripts" / "google-enrich.py")
    cli = os.path.expanduser("~/workspace/skills/google-places/bin/gplaces")
    if not os.path.exists(cli):
        # CI / environments without the google-places skill: skip cleanly.
        print("verify: skipped (google-places skill not installed here)")
        return 0
    r = subprocess.run([sys.executable, script, "verify"])
    return r.returncode


COMMANDS = {
    "geocode": cmd_geocode,
    "fetch": cmd_fetch,
    "verify": cmd_verify,
    "zones": cmd_zones,
}


def main(argv):
    cmds = [c for c in argv[1:] if not c.startswith("-")]
    if not cmds or any(c not in COMMANDS for c in cmds):
        print("usage: friday-ingest.py [geocode] [fetch] [verify] [zones]  (runs in given order)", file=sys.stderr)
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
