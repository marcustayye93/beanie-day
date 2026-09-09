#!/usr/bin/env python3
"""Build data/parks.json — Singapore's public parks as a stable POI layer.

Source: official data.gov.sg NParks datasets (no key needed), fetched through
the public poll-download API — the same pattern the PlaySG project uses:

  Parks@SG  d_99b71f5d34cf57a3a592fbfdef1f42b6   (primary: 52 parks with
                                                 names, attraction/amenity
                                                 descriptions, NParks URLs)
  NParks Parks d_0542d48f0991541706b58059381a6eca (fallback: 462 points)

Each park gets lat/lng + a zone, so the app can sort by live per-user distance
(BeanieHomePostal.distanceKmTo works on the travel shape directly).

Parks barely change — run MONTHLY, not weekly:
  python3 scripts/parks-build.py
Writes data/parks.json.
"""

import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data", "parks.json")

POLL_API = "https://api-open.data.gov.sg/v1/public/api/datasets/{}/poll-download"
DATASETS = {
    "parks_sg": "d_99b71f5d34cf57a3a592fbfdef1f42b6",
    "nparks_parks": "d_0542d48f0991541706b58059381a6eca",
}

ZONE_LABEL = {"N": "North", "W": "West", "E": "East", "C": "Central", "S": "South"}

# Town names for a human "region" line, matched against park name + street.
TOWN_KEYWORDS = [
    "Jurong", "Tampines", "Woodlands", "Punggol", "Sengkang", "Hougang",
    "Sembawang", "Yishun", "Ang Mo Kio", "Bishan", "Toa Payoh",
    "Bukit Timah", "Bukit Batok", "Bukit Panjang", "Choa Chu Kang",
    "Clementi", "Queenstown", "Bukit Merah", "Tiong Bahru", "Tanjong Pagar",
    "Marina", "Kallang", "Geylang", "Bedok", "Pasir Ris", "Changi", "Simei",
    "Serangoon", "Seletar", "Mandai", "Kranji", "Tuas", "Pioneer", "Boon Lay",
    "Lakeside", "Dover", "Buona Vista", "Holland", "Tanglin", "Orchard",
    "Newton", "Novena", "Alexandra", "Telok Blangah", "Harbourfront",
    "Sentosa", "Labrador", "Kent Ridge", "Mount Faber", "Pandan",
    "MacRitchie", "Pulau Ubin", "Coney", "Sungei Buloh", "Lim Chu Kang",
    "Marsiling", "Admiralty", "Tengah", "Sungei Kadut", "Khatib",
]


def http_get_json(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "beanie-day-parks/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def fetch_dataset(dataset_id, attempts=5):
    """poll-download -> signed S3 URL -> GeoJSON, with retries."""
    last = None
    for i in range(attempts):
        try:
            meta = http_get_json(POLL_API.format(dataset_id), timeout=25)
            dl = (meta.get("data") or {}).get("url")
            if not dl:
                raise RuntimeError(f"no download url: {str(meta)[:120]}")
            req = urllib.request.Request(
                dl, headers={"User-Agent": "beanie-day-parks/1.0"}
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as exc:  # noqa: BLE001 - transient network
            last = exc
            time.sleep(2 * (i + 1))
    raise RuntimeError(f"dataset {dataset_id} failed after {attempts}: {last}")


def parse_attrs(desc_html):
    pairs = re.findall(
        r"<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>", desc_html or "", re.S
    )
    out = {}
    for k, v in pairs:
        k = html.unescape(re.sub(r"<[^>]+>", "", k)).strip()
        v = html.unescape(re.sub(r"<[^>]+>", "", v)).strip()
        if k:
            out[k] = v
    return out


def clean_attractions(raw):
    """Split the free-text DESCRIPTION into short attraction chips."""
    if not raw:
        return []
    parts = re.split(r"\s{2,}|\n+", raw)
    seen = set()
    out = []
    for p in parts:
        p = re.sub(r"\s+", " ", p).strip(" -–—;,.").strip()
        if not p or len(p) < 3:
            continue
        # "Fitness corner or stations ..." -> keep the first alternative
        p = re.split(r"\s+or\s+", p, maxsplit=1)[0].strip()
        if len(p) > 64:
            continue
        key = p.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
        if len(out) >= 8:
            break
    return out


def zone_from_latlng(lat, lng):
    try:
        la, ln = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (1.15 <= la <= 1.48 and 103.6 <= ln <= 104.1):
        return None
    if la >= 1.405:
        return "N"
    if la <= 1.275:
        return "S"
    if ln >= 103.92:
        return "E"
    if ln <= 103.74:
        return "W"
    return "C"


def guess_town(name, street):
    hay = f"{name} {street}".upper()
    for town in TOWN_KEYWORDS:
        if town.upper() in hay:
            return town
    return None


def slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"park-{s or 'unnamed'}"


def build_from_parks_sg(geojson):
    parks = []
    seen = set()
    for feat in geojson.get("features", []):
        props = feat.get("properties") or {}
        attrs = parse_attrs(props.get("Description", ""))
        name = attrs.get("NAME", "").strip()
        if not name or name.lower() in seen:
            continue
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lng, lat = float(coords[0]), float(coords[1])
        if not (1.15 <= lat <= 1.48 and 103.6 <= lng <= 104.1):
            continue
        seen.add(name.lower())
        street = attrs.get("ADDRESSSTREETNAME", "").strip()
        zone = zone_from_latlng(lat, lng)
        town = guess_town(name, street)
        parks.append(
            {
                "id": slug(name),
                "name": name,
                "travel": {
                    "lat": round(lat, 5),
                    "lng": round(lng, 5),
                    "zone": zone,
                    "region": town or (ZONE_LABEL.get(zone, "") + " Singapore").strip(),
                },
                "address": street,
                "attractions": clean_attractions(attrs.get("DESCRIPTION", "")),
                "url": attrs.get("HYPERLINK", "").strip(),
                "source": "Parks@SG via data.gov.sg",
            }
        )
    return parks


def build_from_nparks_points(geojson):
    """Fallback: raw NParks points (many are playgrounds). Keep only plausible parks."""
    parks = []
    seen = set()
    for feat in geojson.get("features", []):
        props = feat.get("properties") or {}
        name = (props.get("NAME") or "").strip()
        if not name or name.lower() in seen:
            continue
        # Skip playground / fitness-corner points — Parks@SG covers real parks
        if re.search(r"\bPG\b|PLAYGROUND|FITNESS", name, re.I):
            continue
        coords = (feat.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        lng, lat = float(coords[0]), float(coords[1])
        if not (1.15 <= lat <= 1.48 and 103.6 <= lng <= 104.1):
            continue
        seen.add(name.lower())
        zone = zone_from_latlng(lat, lng)
        parks.append(
            {
                "id": slug(name),
                "name": name.title(),
                "travel": {
                    "lat": round(lat, 5),
                    "lng": round(lng, 5),
                    "zone": zone,
                    "region": (ZONE_LABEL.get(zone, "") + " Singapore").strip(),
                },
                "address": "",
                "attractions": [],
                "url": "",
                "source": "NParks Parks via data.gov.sg",
            }
        )
    return parks


def main():
    try:
        geojson = fetch_dataset(DATASETS["parks_sg"])
        parks = build_from_parks_sg(geojson)
        source_note = "Parks@SG (data.gov.sg)"
    except Exception as exc:
        print(f"primary Parks@SG failed ({exc}); trying NParks points fallback")
        geojson = fetch_dataset(DATASETS["nparks_parks"])
        parks = build_from_nparks_points(geojson)
        source_note = "NParks Parks points (data.gov.sg) fallback"

    parks.sort(key=lambda p: p["name"].lower())
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "count": len(parks),
        "sourceNote": source_note,
        "parks": parks,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    zones = {}
    for p in parks:
        z = (p["travel"] or {}).get("zone") or "?"
        zones[z] = zones.get(z, 0) + 1
    print(f"parks: {len(parks)} -> {OUT}")
    print("zones:", " ".join(f"{z}={n}" for z, n in sorted(zones.items())))
    with_attr = sum(1 for p in parks if p["attractions"])
    print(f"with attractions: {with_attr}/{len(parks)}")


if __name__ == "__main__":
    sys.exit(main())
