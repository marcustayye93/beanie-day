"""Rebuild data/week.json activities from verified research picks.

Inputs (researcher-verified, real venues only), checked into the repo:
  data/research/food-picks.json       — 10 restaurants/cafes
  data/research/heartland-picks.json  — 6 heartland gems + 4 outdoor activities
  data/research/brand-event-picks.json — brands + dated events (optional, if present)

Geocodes each address via OneMap, stamps nearest MRT, computes zone,
and writes the activity list. Placeholders are fully replaced.

Run: python3 scripts/rebuild-week.py
"""
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data", "week.json")
sys.path.insert(0, os.path.join(REPO, "scripts"))
from mrt import stamp_nearest_mrt  # noqa: E402
from zones import zone_from_latlng as _zone_ll  # noqa: E402


def load_google_cache():
    """Google verification cache (scripts/google-enrich.py). Returns {} when absent."""
    path = os.path.join(REPO, "data", "research", "google-cache.json")
    try:
        return json.load(open(path))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


GOOGLE_CACHE = load_google_cache()


def google_stamp(pid):
    g = GOOGLE_CACHE.get(pid) or {}
    if g.get("rating") is None:
        return None
    return {"rating": g["rating"], "reviews": g.get("userRatingCount")}


def zone_from_latlng(lat, lng):
    # Letter form, matching this script's ZONE_FULL lookup.
    z = _zone_ll(lat, lng)
    return {"North": "N", "South": "S", "East": "E", "West": "W", "Central": "C"}.get(
        z, "C"
    )

HOME_POSTAL = "730587"

ZONE_FULL = {"N": "North", "S": "South", "E": "East", "W": "West", "C": "Central"}


def onemap_search(query):
    url = (
        "https://www.onemap.gov.sg/api/common/elastic/search?searchVal="
        + urllib.parse.quote(query)
        + "&returnGeom=Y&getAddrDetails=Y&pageNum=1"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.load(r)
        res = (data.get("results") or [None])[0]
        if not res:
            return None
        return float(res["LATITUDE"]), float(res["LONGITUDE"])
    except Exception as e:
        print(f"  ! onemap fail {query!r}: {e}")
        return None


def haversine_km(a, b, c, d):
    r = 6371.0
    dlat = math.radians(c - a)
    dlng = math.radians(d - b)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a)) * math.cos(
        math.radians(c)
    ) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def drive_band(km):
    if km < 5:
        return "5–15 min"
    if km < 12:
        return "15–25 min"
    if km < 20:
        return "25–40 min"
    return "45–65 min"


# OneMap query overrides: full addresses that OneMap fails on (unit fragments,
# bad building-name resolution). Values verified manually.
QUERY_OVERRIDES = {
    "fl-burma-social-siglap": "907 East Coast Road Singapore 459107",
    "fl-katsu-by-kyu": "6A Shenton Way Singapore 068815",
    "fl-sushidan-parkway": "80 Marine Parade Road Singapore 449269",
    "br-novela-changi-city-point": "Changi City Point",
    "br-chagee-suntec-family": "Suntec City Singapore",
    "ev-twilight-flea-feast": "1 Raffles Boulevard Singapore 039593",
    # Woodlands food batch (2026-09-10): OneMap misses comma-form addresses and
    # unit-suffixed blocks; these resolve to Google-confirmed coordinates.
    "fl-jin-le-claypot": "111 Woodlands Street 13 Singapore 730111",
    "fl-ivans-carbina": "730354 Singapore",  # Blk 354 Woodlands Ave 5 (Lucky Star Coffeeshop)
    "fl-yan-ji-soup": "Marsiling Mall Hawker Centre Singapore",
}
# Editorial top-3 per category (carousel). Item id -> list of tab ids.
TOP3 = {
    "fl-casa-vostra-tampines": ["flavours"],
    "fl-im-qalb": ["flavours", "this-week"],
    "fl-sushidan-parkway": ["flavours"],
    "nh-rb-caifan": ["near-home"],
    "nh-yishun-park-hc": ["near-home"],
    "nh-one-punggol-bash": ["near-home", "this-week"],
    "out-midautumn-gbtb": ["outdoor", "this-week"],
    "out-sungei-buloh-walk": ["outdoor"],
    "out-wings-of-time": ["outdoor"],
    "br-salomon-imm": ["brands"],
    "br-novela-changi-city-point": ["brands"],
    "br-chagee-suntec-family": ["brands"],
    "ev-srf-2026": ["events"],
    "ev-homegrown-2026": ["events"],
    "ev-twilight-flea-feast": ["events"],
}


def load_picks():
    picks = []
    for name in ("food-picks.json", "heartland-picks.json", "brand-event-picks.json"):
        path = os.path.join(REPO, "data", "research", name)
        if not os.path.exists(path):
            print(f"  (skip missing {path})")
            continue
        data = json.load(open(path))
        items = data if isinstance(data, list) else data.get("picks", data)
        print(f"  loaded {len(items)} from {path}")
        picks.extend(items)
    return picks


def main():
    home = onemap_search(HOME_POSTAL + " Singapore")
    if not home:
        raise SystemExit("could not geocode home postal")
    print(f"home {HOME_POSTAL} -> {home}")

    picks = load_picks()
    # Merge duplicate: Casa Vostra appears in both files; keep the richer food entry.
    picks = [p for p in picks if p.get("id") != "nh-casa-vostra"]
    by_id = {p["id"]: p for p in picks}
    cv = by_id.get("fl-casa-vostra-tampines")
    if cv:
        tabs = set(cv.get("tabs", [])) | {"near-home", "this-week"}
        cv["tabs"] = sorted(tabs)
    # Every pick is one of this week's finds.
    for p in picks:
        if "this-week" not in p.get("tabs", []):
            p["tabs"] = sorted(set(p.get("tabs", [])) | {"this-week"})

    activities = []
    for p in picks:
        pid = p.get("id")
        addr = p.get("address") or ""
        # Explicit coordinates (e.g. verified Eventbrite JSON-LD) win over
        # OneMap search — they pin the exact event spot, not the street.
        ll = None
        geo_source = "onemap"
        if p.get("lat") is not None and p.get("lng") is not None:
            ll = (float(p["lat"]), float(p["lng"]))
            geo_source = p.get("geoSource") or "explicit"
        if ll is None:
            # Strip unit numbers ("#01-02") — they break OneMap search.
            addr = re.sub(r",?\s*#[0-9A-Za-z\-]+", "", addr).strip()
            query = QUERY_OVERRIDES.get(pid) or (
                addr if "singapore" in addr.lower() else (addr + " Singapore" if addr else "")
            )
            ll = onemap_search(query) if query else None
            if not ll and p.get("neighbourhood"):
                ll = onemap_search(p["neighbourhood"] + " Singapore")
            time.sleep(0.3)
        zone_letter = zone_from_latlng(*ll) if ll else "C"
        travel = {
            "zone": ZONE_FULL[zone_letter],
            "fromWoodlands": "",
            "region": p.get("neighbourhood", ""),
            "lat": round(ll[0], 5) if ll else None,
            "lng": round(ll[1], 5) if ll else None,
            "geoSource": geo_source,
            "geoQuery": addr,
            "distanceKm": round(haversine_km(home[0], home[1], ll[0], ll[1]), 1) if ll else None,
            "nearestMrt": "",
        }
        if ll:
            travel["fromWoodlands"] = drive_band(travel["distanceKm"])
        stamp_nearest_mrt(travel)
        tabs = p.get("tabs", [])
        activities.append(
            {
                "id": p["id"],
                "title": p["title"],
                "venue": p.get("neighbourhood", ""),
                "description": p.get("description", ""),
                "why": p.get("why", ""),
                "when": p.get("when", ""),
                "deal": p.get("price", ""),
                "parking": p.get("parking", ""),
                "heatNote": "",
                "days": p.get("days", []),
                "tags": p.get("tags", []),
                "tabs": tabs,
                "highlight": bool(p.get("highlight")),
                "nearHomeBonus": "near-home" in tabs,
                "top3Tabs": TOP3.get(p["id"], []),
                "travel": travel,
                "google": google_stamp(p["id"]),
                "source": p.get("source"),
            }
        )
        print(f"  ok {p['id']} zone={travel['zone']} mrt={travel.get('nearestMrt')}")

    week = json.load(open(OUT))
    week["activities"] = activities
    json.dump(week, open(OUT, "w"), indent=2, ensure_ascii=False)
    open(OUT, "a").write("\n")
    print(f"wrote {len(activities)} activities -> {OUT}")


if __name__ == "__main__":
    main()
