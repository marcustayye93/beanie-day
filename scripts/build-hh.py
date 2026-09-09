"""Build data/happy-hours.json from researched HH beer prices.

Source: data/hh-research.json (checked in; researched 2026-09-09).
Geocodes each bar via OneMap, stamps nearest MRT, sorts cheapest-first.

Honesty rules (Marcus's call: the page is about the cheapest beer ON TAP):
- Chupitos is dropped: bottled beer, not draught.
- Entries without a timed happy hour are labelled deal_kind="everyday"
  (their price_note says so on the card); the rest are "happy-hour".

Run: python3 scripts/build-hh.py
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "data", "happy-hours.json")
SRC = os.path.join(REPO, "data", "hh-research.json")

sys.path.insert(0, os.path.join(REPO, "scripts"))
from mrt import stamp_nearest_mrt  # noqa: E402
from zones import zone_from_latlng  # noqa: E402

# Dropped from the ranking: not draught ("beer on tap" page).
DROP_BARS = {
    "Chupitos": "bottled beer, not draught",
}

# OneMap query overrides for bars the raw address fails on.
GEOCODE_OVERRIDES = {
    "Loof": "331 North Bridge Road Singapore 188720",
    "Wine Connection": "10 Tampines Central 1 Singapore",
    "Druggists": "119 Tyrwhitt Road Singapore 207547",
    "The Public House": "Circular Road Singapore",
    "Mischief": "8 Raffles Avenue Singapore 039802",
    "Ice-Cold B's": "50 Stamford Road Singapore 178899",
    "Five Izakaya Bar": "5 Changi Business Park Central 1 Singapore 486038",
    "Stickies Bar": "11 Keng Cheow Street Singapore 059608",
    "Al Capone's Ristorante & Bar": "2 Jurong Gateway Road Singapore",
    "Five Tapas Bar": "Cuppage Terrace Singapore",
    "The Good Beer Company": "335 Smith Street Singapore 050335",
    "HaveFun Karaoke & Outdoor Beer Garden": "60 Yishun Avenue 4 Singapore 769027",
    "Al Capone's Ristorante & Bar (Sembawang)": "1030 Sembawang Road Singapore 758501",
    "The Carpenters Bar": "28 Woodlands Sector 2 Singapore 737686",
    "The Patio SG": "60 Jalan Mempurong Singapore 759058",
}

SOURCE_LABELS = {
    "thesmartlocal.com": "TheSmartLocal",
    "secretsingapore.co": "SecretSingapore",
    "it.hotels.com": "Hotels.com",
    "citynomads.com": "City Nomads",
    "www.wineconnection.com.sg": "Wine Connection",
    "www.asiaone.com": "AsiaOne",
    "www.findglocal.com": "Al Capone's (Facebook)",
}

ZONE_FULL = {"N": "North", "S": "South", "E": "East", "W": "West", "C": "Central"}

# On-disk cache of successful OneMap geocodes (bar name -> {query, lat, lng}).
# The script reads this first and only hits OneMap for uncached bars,
# so rebuilds are reproducible and don't get throttled.
GEOCODE_CACHE_PATH = os.path.join(REPO, "data", "hh-geocode-cache.json")


def source_label(url):
    try:
        host = urllib.parse.urlparse(url).netloc
    except Exception:
        host = ""
    return SOURCE_LABELS.get(host, host or "Source")


def deal_kind(b):
    """'happy-hour' for timed HH deals, 'everyday' for regular cheap pricing."""
    note = (b.get("price_note") or "").lower()
    hours = (b.get("hh_hours") or "").lower()
    if (
        "no formal happy hour" in note
        or "not a timed happy hour" in note
        or "regular pricing" in hours
    ):
        return "everyday"
    return "happy-hour"


def onemap_search(query, tries=3):
    url = (
        "https://www.onemap.gov.sg/api/common/elastic/search?searchVal="
        + urllib.parse.quote(query)
        + "&returnGeom=Y&getAddrDetails=Y&pageNum=1"
    )
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                data = json.load(r)
            res = (data.get("results") or [None])[0]
            if not res:
                return None
            return float(res["LATITUDE"]), float(res["LONGITUDE"])
        except Exception as e:
            if attempt < tries - 1:
                time.sleep(1.5 * (attempt + 1))
            else:
                print(f"  ! onemap fail {query!r}: {e}")
                return None
    return None


def geocode_cached(name, query):
    """Return (lat, lng), consulting the on-disk cache before OneMap."""
    cache = {}
    if os.path.exists(GEOCODE_CACHE_PATH):
        try:
            cache = json.load(open(GEOCODE_CACHE_PATH))
        except Exception:
            cache = {}
    hit = cache.get(name)
    if hit and hit.get("lat") is not None:
        return float(hit["lat"]), float(hit["lng"])
    ll = onemap_search(query)
    time.sleep(1.0)
    if ll:
        cache[name] = {"query": query, "lat": round(ll[0], 5), "lng": round(ll[1], 5)}
        try:
            with open(GEOCODE_CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump(cache, f, ensure_ascii=False, indent=2)
                f.write("\n")
        except Exception as e:
            print(f"  ! cache write fail: {e}")
    return ll


def clean_query(addr):
    """Strip unit numbers and expand abbreviations so OneMap resolves."""
    q = re.sub(r",?\s*#[0-9A-Za-z/\-]+", "", addr).strip()
    q = re.sub(r"\bRd\b", "Road", q)
    q = re.sub(r"\bAve\b", "Avenue", q)
    q = re.sub(r"\bSt\b", "Street", q)
    return q
    """Strip unit numbers and expand abbreviations so OneMap resolves."""
    q = re.sub(r",?\s*#[0-9A-Za-z/\-]+", "", addr).strip()
    q = re.sub(r"\bRd\b", "Road", q)
    q = re.sub(r"\bAve\b", "Avenue", q)
    q = re.sub(r"\bSt\b", "Street", q)
    return q


def main():
    raw = json.load(open(SRC))
    bars = raw if isinstance(raw, list) else raw.get("bars", raw)
    out = []
    for b in bars:
        name = b["bar"]
        if name in DROP_BARS:
            print(f"  - dropped {name}: {DROP_BARS[name]}")
            continue
        query = GEOCODE_OVERRIDES.get(name)
        if not query:
            addr = clean_query(b.get("address") or name)
            query = addr if "singapore" in addr.lower() else addr + " Singapore"
        ll = geocode_cached(name, query)
        if not ll and name not in GEOCODE_OVERRIDES:
            # One retry with the bar name + area before giving up.
            ll = geocode_cached(name, f"{name} {b.get('area', '')} Singapore")
        travel = {"region": b.get("area", ""), "zone": ""}
        if ll:
            lat, lng = ll
            travel.update({"lat": round(lat, 5), "lng": round(lng, 5)})
            travel["zone"] = zone_from_latlng(lat, lng)
            stamp_nearest_mrt(travel)
        else:
            print(f"  ! no geo for {name} (add a GEOCODE_OVERRIDES entry)")
        note = b.get("price_note", "")
        # Trim outlet lists that don't apply to the listed outlet.
        if name.startswith("Wine Connection"):
            note = "$20 for 2 full pints = $10/pint; till 7pm daily"
        out.append(
            {
                "id": "hhp-" + "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-")[:24],
                "bar": name,
                "area": b.get("area", ""),
                "address": b.get("address", ""),
                "hh_days": b.get("hh_days", ""),
                "hh_hours": b.get("hh_hours", ""),
                "pour": b.get("cheapest_pint", ""),
                "hh_price": b.get("hh_price"),
                "regular_price": b.get("regular_price"),
                "price_note": note,
                "deal_kind": deal_kind(b),
                "source": {"label": source_label(b.get("source_url", "")), "url": b.get("source_url", "")},
                "verified": b.get("verified", "2026-09-09"),
                "travel": travel,
            }
        )
    out.sort(key=lambda x: (x["hh_price"] is None, x["hh_price"] or 0))
    payload = {
        "generatedAt": "2026-09-09",
        "count": len(out),
        "note": "Cheapest verified draught pours. Sizes differ (half pint vs pint) — check the pour column. 'Everyday' means regular cheap pricing, not a timed happy hour. Prices change; verify before heading out.",
        "bars": out,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {len(out)} bars -> {OUT}")
    for b in out:
        print(f"  ${b['hh_price']:.2f} [{b['deal_kind']}] {b['pour'] and '(' + b['pour'] + ') '}@ {b['bar']} — {b['area']}")


if __name__ == "__main__":
    main()
