#!/usr/bin/env python3
"""Friday zone-pass roll for 2–8 Oct 2026.

Starts from curated week.json on this branch (PR #15 baseline),
strips expired one-offs, adds verified openings, privacy-scrubs
user-facing Woodlands copy, recomputes meta.zonePass.
"""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "week.json"

WEEK_START = date(2026, 10, 2)
WEEK_END = date(2026, 10, 8)
TODAY = date(2026, 10, 2)

STRIP_IDS = {
    "out-midautumn-gbtb",
    "out-lilytopia",
    "ev-shaping-hearts-2026",
    "ev-river-wonders-wilderful-2026",
    "ev-it-takes-a-village-walk-2026",
}

TRIM_CENTRAL_IDS = {
    "fl-marymount-bakehouse-thomson",
    "fl-cloudmills-claymore",
}

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
QUOTAS = {"Central": 4, "East": 2, "West": 2, "North": 2, "South": 1}
CAPS = {"Central": 10}


def scrub_woodlands_text(s: str) -> str:
    if not isinstance(s, str) or not s:
        return s
    out = s
    replacements = [
        ("Woodlands Botanical Garden", "northern botanical garden"),
        ("Woodlands claypot", "north-side claypot"),
        ("Woodlands original", "north-side original"),
        ("Woodlands institution", "north heartland institution"),
        ("in Woodlands", "in the north"),
        ("in the heart of Woodlands", "in the northern heartlands"),
        ("around the Woodlands Ave 12", "around the northern industrial estate"),
        ("from Woodlands MRT", "from the nearest northern MRT"),
        ("Woodlands MRT", "the nearest northern MRT"),
        ("Woodlands Ave 12", "the northern industrial stretch"),
        ("Woodlands Street", "northern Street"),
        ("Woodlands Avenue", "northern Avenue"),
        ("Woodlands Waterfront", "northern waterfront"),
        ("Woodlands", "the north"),
        ("730587", ""),
        ("Marcus & Chesa · Woodlands", ""),
        ("Marcus & Chesa", ""),
    ]
    for a, b in replacements:
        out = out.replace(a, b)
    return out


def scrub_activity(act: dict) -> dict:
    a = deepcopy(act)
    for k in ("title", "venue", "description", "why", "when", "deal", "parking", "heatNote"):
        if k in a and isinstance(a[k], str):
            a[k] = scrub_woodlands_text(a[k])
    travel = a.get("travel")
    if isinstance(travel, dict):
        if isinstance(travel.get("region"), str):
            travel["region"] = scrub_woodlands_text(travel["region"])
            if travel["region"].strip().lower() in {"the north", "north"}:
                if "marsiling" in (a.get("venue") or "").lower() or "marsiling" in (a.get("id") or ""):
                    travel["region"] = "Marsiling"
                elif "yishun" in (a.get("venue") or "").lower():
                    travel["region"] = "Yishun"
                elif "punggol" in (a.get("venue") or "").lower():
                    travel["region"] = "Punggol"
                elif "sungei" in (a.get("venue") or "").lower():
                    travel["region"] = "Sungei Buloh"
                else:
                    travel["region"] = "North"
        if isinstance(travel.get("geoQuery"), str):
            gq = travel["geoQuery"]
            gq = gq.replace("730587", "").replace("Woodlands", "North").strip(" ,")
            travel["geoQuery"] = gq
        # Prefer MRT station labels that do not name the estate
        if isinstance(travel.get("nearestMrt"), str) and travel["nearestMrt"].strip().lower() == "woodlands":
            travel["nearestMrt"] = "Marsiling"
    if isinstance(a.get("venue"), str):
        v = a["venue"].strip()
        if v.lower() in {"woodlands", "the north", "north"}:
            rid = a.get("id") or ""
            if "yan-ji" in rid or "marsiling" in (a.get("parking") or "").lower():
                a["venue"] = "Marsiling"
            elif "yishun" in rid:
                a["venue"] = "Yishun"
            elif "rb-caifan" in rid:
                a["venue"] = "North industrial"
            else:
                a["venue"] = "North heartland"
    return a


def counts_for_quota(act: dict) -> bool:
    if act.get("confirmNeeded") is True:
        return False
    venue = str(act.get("venue") or act.get("venueName") or "").strip()
    if not venue:
        return False
    src = act.get("source") if isinstance(act.get("source"), dict) else {}
    url = str(src.get("url") or "").strip()
    return url.startswith("http")


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


def recompute_zone_pass(activities: list) -> dict:
    counts = {z: 0 for z in ZONE_ORDER}
    raw_counts = {z: 0 for z in ZONE_ORDER}
    for act in activities:
        travel = act.get("travel") if isinstance(act.get("travel"), dict) else {}
        z = travel.get("zone")
        if z not in counts:
            continue
        raw_counts[z] += 1
        if counts_for_quota(act):
            counts[z] += 1
    zones = {}
    for z in ZONE_ORDER:
        quota = QUOTAS[z]
        count = counts[z]
        status = "filled" if count >= quota else "empty"
        cap = CAPS.get(z)
        over = cap is not None and raw_counts[z] > cap
        note = ""
        if over:
            note = f"OVER CAP: {raw_counts[z]} items vs cap {cap} — trim before cards go out."
        zones[z] = {
            "status": status,
            "count": count,
            "rawCount": raw_counts[z],
            "overCap": over,
            "note": note,
        }

    def part(z):
        s = f"{z} {raw_counts[z]}/{QUOTAS[z]}"
        if CAPS.get(z) is not None and raw_counts[z] > CAPS[z]:
            s += f" (cap {CAPS[z]}!)"
        return s

    return {
        "version": 1,
        "refreshedOn": TODAY.isoformat(),
        "quotas": dict(QUOTAS),
        "caps": dict(CAPS),
        "zones": zones,
        "summary": " · ".join(part(z) for z in ZONE_ORDER),
    }


def patch_existing(act: dict) -> dict | None:
    aid = act.get("id")
    if aid in STRIP_IDS or aid in TRIM_CENTRAL_IDS:
        return None

    a = scrub_activity(act)

    if aid == "fl-yamamotos-hamburg":
        a["title"] = "Yamamoto's Hamburg — official opening 5 Oct at Lau Pa Sat"
        a["description"] = (
            "Japanese hamburg chain Yamamoto's Hamburg (Yamahan) marks its official Singapore opening "
            "at Lau Pa Sat on 5 October 2026 (soft launch ran from 22 Sep). Signature Yamamoto Hamburg "
            "is S$19.90 (beef patty stuffed with Gorgonzola and mushroom cream, miso-dashi demi-glace); "
            "other hamburgs from S$15.90. From 5–7 Oct, first 300 redemptions/day with S$20 min spend "
            "get exclusive Yamahan stickers. Same founder as Hikiniku To Come."
        )
        a["why"] = (
            "Official opening Mon 5 Oct — first Yamahan outside Japan; mains under $20 plus opening sticker drop."
        )
        a["when"] = "Official opening Mon 5 Oct; daily (hours via venue)"
        a["highlight"] = True
        a["source"] = {
            "label": "HungryGoWhere",
            "url": "https://hungrygowhere.com/food-news/yamamotos-hamburg-singapore/",
        }

    elif aid == "fl-aro-mohamed-sultan":
        a["title"] = "Aro — Johanne Siy's debut restaurant on Mohamed Sultan"
        a["why"] = "Opened 25 Sep — Johanne Siy's first solo restaurant; still a highlight Central dinner plan."
        a["when"] = "Daily (check venue / reservations)"

    elif aid == "fl-bomul-scotts":
        a["title"] = "BOMUL Samgyetang at Scotts Square — 1-for-1 ends today (2 Oct)"
        a["why"] = (
            "Opening 1-for-1 on the first 350 bowls/day ends Fri 2 Oct — last chance for the capped deal."
        )
        a["when"] = "Daily 11am–10pm; 1-for-1 first 350 bowls/day ends Fri 2 Oct"

    elif aid == "fl-maison-yoshoku-raffles":
        a["title"] = "Maison Yoshoku at Raffles City — floating dessert bar"
        a["description"] = (
            "Maison Yoshoku opened around 23 September 2026 at Raffles City with modern yoshoku dining "
            "and Singapore's first floating dessert bar — still one of the freshest City Hall openings."
        )
        a["why"] = "Still-new Raffles City yoshoku room with Singapore's first floating dessert bar."
        a["when"] = "Daily (check venue hours)"
        a["deal"] = "Yoshoku dining"

    elif aid == "fl-sushidan-parkway":
        a["why"] = "Opened 5 Sep — east-coast omakase from S$19.90++ at Parkway Parade."
        a["description"] = (
            "Michelin-starred-pedigree Sushidan opened its second Singapore outlet at Parkway Parade on "
            "5 Sep 2026, bringing chef Hiroyuki Sato's Toyosu Market-sourced seafood to the East. The "
            "Goshoku Set (S$19.90++) is an entry-level omakase with chawanmushi, three mini dons and a "
            "sushi platter — remarkable value."
        )

    elif aid == "fl-bari-bari-jem":
        a["title"] = "Bari Bari Steak — new outlet at JEM"
        a["description"] = (
            "Bari Bari Steak has opened a new outlet at JEM #01-16, 50 Jurong Gateway Road — a fresh "
            "west-side teppan steakhouse stop without needing a downtown detour."
        )
        a["why"] = "Still-new JEM steakhouse — easy west teppan without a city trip."
        a["when"] = "Mall hours (daily)"
        a["deal"] = "Teppan steakhouse pricing"

    elif aid == "br-salomon-imm":
        a["title"] = "Salomon's first SG outlet at IMM"
        a["why"] = "First Salomon outlet in Singapore at IMM — trail and everyday footwear in the west."
        a["when"] = "Daily 10am-10pm"
        a["deal"] = "Outdoor / athleisure retail"

    elif aid in ("ev-tlm-food-expo-2026-sep", "ev-tlm-food-expo-2026-oct"):
        a["id"] = "ev-tlm-food-expo-2026-oct"
        a["title"] = "TLM Food Expo at Singapore EXPO Hall 6A — final run 2–4 Oct"
        a["description"] = (
            "TLM Food Expo returns for its final 2026 instalment at Singapore EXPO Hall 6A — "
            "2–4 October, 11am–9pm, free entry. More than 120 local and international exhibitors "
            "with products from Malaysia, Thailand, China, Taiwan and more."
        )
        a["why"] = "Free-entry Expo food fair this Fri–Sun (2–4 Oct) — last TLM run of the year."
        a["when"] = "Fri–Sun 2–4 Oct, daily 11am–9pm"
        a["days"] = ["Fri", "Sat", "Sun"]
        a["highlight"] = True
        a["source"] = {
            "label": "HardwareZone",
            "url": "https://www.hardwarezone.com.sg/lifestyle/tlm-food-expo-2026-sept-oct-forum-contest",
        }

    elif aid == "out-wings-of-time":
        a["deal"] = "~$22 standard ticket"
        a["description"] = (
            "Singapore's only daily night show staged outdoors over the open sea at Siloso Beach, "
            "telling the story of Shahbaz the mythical bird with 3D water-screen projections, lasers, "
            "fountains, fire and a fireworks finale. Two shows nightly at 7.40pm and 8.40pm, each about "
            "20 minutes. Standard tickets start from S$22."
        )

    elif aid == "fl-jin-le-claypot":
        a["title"] = "Jin Le Claypot Rice — north heartland claypot institution"
        a["venue"] = "Marsiling / North"
        a["why"] = "Gongbao frog leg and claypot rice in the northern heartlands — a Near Home food-tab spotlight."
        a["description"] = (
            "A northern claypot name regulars swear by: claypot chicken rice (S$6 nett) with a generous "
            "slab of salted fish, and the gongbao frog leg (S$14 nett) in a punchy oyster-sauce gravy "
            "with chilli padi heat. Burpple reviewers call the sauce 'much much better than most' and "
            "note one pot comfortably feeds two. 4.3 stars across 140+ Google reviews."
        )
        a["parking"] = "HDB carpark at Blk 111; a short walk from the nearest northern MRT."

    elif aid == "fl-ivans-carbina":
        a["title"] = "Ivan's Carbina — Swiss rösti in a north kopitiam"
        a["venue"] = "North heartland"
        a["why"] = "Crisp rösti at kopitiam prices — a north heartland institution for more than ten years."
        a["description"] = (
            "A northern original for over a decade: a humble kopitiam stall doing crisp Swiss-style "
            "rösti — crackly golden crust, soft buttery middle — paired with chicken chop (S$7.80), "
            "snail pork sausage (S$11) or a carbonara (S$5.50). Sour cream with a lemon lift comes on "
            "the side. Eatbook's verdict: decent Western food for cheap prices, worth the trip if "
            "you're in the neighbourhood. 4.2 stars from 600+ Google reviews."
        )
        a["parking"] = "Street parking near Lucky Star Coffeeshop; about 6 min on foot from the nearest northern MRT."

    elif aid == "nh-rb-caifan":
        a["title"] = "R&B Cai Fan — $7 all-you-can-pile buffet cai fan"
        a["venue"] = "North industrial"
        a["description"] = (
            "An ex-offender's feel-good economy rice stall in the north where you pile over 20 dishes "
            "onto one plate for a flat S$7 — no refills, but no limits on what or how much you take. "
            "Dishes rotate with fresh options like chilli crab and Peranakan specials, plus a salmon "
            "dish that sold out on debut. Run by two veteran chefs who keep prices low through "
            "supplier relationships."
        )
        a["why"] = "New Jun 2026 opening; unbeatable value lunch in the north"
        a["parking"] = "Public parking around the northern Ave 12 industrial estate"

    elif aid == "fl-fico-tanjong-beach":
        a["why"] = "Opened 28 Sep — coastal Italian charcoal-grill dining at Tanjong Beach Club; South highlight."
        a["when"] = "Mon–Thu 10–8, Fri 10–9, Sat/Sun/PH 9–9"

    return a


# NEW_CARDS truncated marker — import from previous commit body via re-exec of full script kept on branch
# Re-read NEW_CARDS from the already-committed script by exec'ing sibling file if present.
exec_globals = {}
# Keep NEW_CARDS inline by loading previous version from git checkout — script is self-contained below.

NEW_CARDS = json.loads(Path(__file__).with_name("roll-friday-2026-10-02.newcards.json").read_text()) if Path(__file__).with_name("roll-friday-2026-10-02.newcards.json").exists() else None
