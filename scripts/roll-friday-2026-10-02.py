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
    "out-midautumn-gbtb",  # ended 27 Sep
    "out-lilytopia",  # ended 27 Sep
    "ev-shaping-hearts-2026",  # ended 27 Sep
    "ev-river-wonders-wilderful-2026",  # 25–26 Sep only
    "ev-it-takes-a-village-walk-2026",  # 26 Sep only
}

# Drop older Central to stay ≤10 raw after adds
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
    # User-facing privacy: never name Woodlands estate / postal
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
                # Prefer concrete north neighbourhoods already on the card
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
        # Keep fromWoodlands key for legacy schema; value is drive-band only
        if isinstance(travel.get("geoQuery"), str):
            # Scrub postal / estate from geoQuery display risk
            gq = travel["geoQuery"]
            gq = gq.replace("730587", "").replace("Woodlands", "North").strip(" ,")
            travel["geoQuery"] = gq
    if isinstance(a.get("venue"), str):
        v = a["venue"].strip()
        if v.lower() in {"woodlands", "the north", "north"}:
            # Prefer Marsiling / Yishun / concrete north labels
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

    elif aid == "ev-tlm-food-expo-2026-sep":
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

    return a


NEW_CARDS = [
    {
        "id": "fl-unagi-kikukawa-raffles",
        "title": "Unagi Yondaime Kikukawa — second SG outlet opens at Raffles City",
        "venue": "Raffles City / City Hall",
        "description": (
            "The Michelin-approved Nagoya unagi specialist opened its second Singapore restaurant on "
            "1 October 2026 at #B1-75 Raffles City Shopping Centre (252 North Bridge Road), in "
            "partnership with Les Amis Group. Whole eels are filleted and grilled over binchotan; "
            "classic Kabayaki and Shirayaki sets are the signatures. Shaw Centre remains the first outlet."
        ),
        "why": "Opened Thu 1 Oct — 90-year-old unagi masters now at Raffles City / City Hall MRT.",
        "when": "Daily (check venue); Raffles City #B1-75",
        "deal": "~$50-70/pax",
        "parking": "Raffles City carpark; directly above City Hall MRT.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
        "tags": ["Indoor", "AC"],
        "tabs": ["flavours", "this-week"],
        "highlight": True,
        "nearHomeBonus": False,
        "top3Tabs": ["flavours", "this-week"],
        "travel": {
            "zone": "Central",
            "fromWoodlands": "25–40 min",
            "region": "City Hall",
            "lat": 1.2936,
            "lng": 103.853,
            "geoSource": "approx",
            "geoQuery": "252 North Bridge Road, Raffles City #B1-75, Singapore 179103",
            "distanceKm": 16.5,
            "nearestMrt": "City Hall",
        },
        "google": None,
        "source": {
            "label": "Little Big Red Dot",
            "url": "https://littlebigreddot.com/unagi-yondaime-kikukawa-raffles-city-opens-1-october-2026/",
        },
    },
    {
        "id": "fl-creamie-sippies-bugis",
        "title": "Creamie Sippies Bugis — SG's first DIY banana pudding bar",
        "venue": "Bugis Street",
        "description": (
            "Creamie Sippies opened its fourth outlet at Bugis Street (#02-115, 160A Rochor Road) around "
            "28 September 2026. The headline is Singapore's first DIY banana pudding bar — bowls from "
            "S$4.50, or S$6.90 for two scoops + three toppings (Oreo, Lotus Biscoff, KitKat and more). "
            "Hand-whisked matcha drinks and a limited fall menu (Bueno Latte, Butter Popcorn Latte) run "
            "through 30 November."
        ),
        "why": "Brand-new Bugis outlet with Singapore's first DIY banana pudding bar — four minutes from Bugis MRT.",
        "when": "Daily 12pm–8pm",
        "deal": "Pudding from $4.50; matcha ~$5-6",
        "parking": "Bugis area carparks; Bugis MRT ~4 min walk.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
        "tags": ["Indoor", "AC"],
        "tabs": ["flavours", "this-week"],
        "highlight": False,
        "nearHomeBonus": False,
        "top3Tabs": ["flavours"],
        "travel": {
            "zone": "Central",
            "fromWoodlands": "25–40 min",
            "region": "Bugis",
            "lat": 1.3005,
            "lng": 103.855,
            "geoSource": "approx",
            "geoQuery": "160A Rochor Road, Bugis Street #02-115, Singapore 188435",
            "distanceKm": 16.0,
            "nearestMrt": "Bugis",
        },
        "google": None,
        "source": {
            "label": "Eatbook",
            "url": "https://eatbook.sg/creamie-sippies-bugis-street/",
        },
    },
    {
        "id": "fl-food-opera-ion",
        "title": "Food Opera at ION Orchard — 18 stalls, heritage + award names",
        "venue": "ION Orchard",
        "description": (
            "ION Orchard's basement food court reopened as Food Opera (B4) in late September 2026 — "
            "20,000 sq ft, 600 seats, 18 brands. Highlights: 93-year-old Ming Chung White Lor Mee, "
            "Hillman Restaurant claypot and paper-wrapped chicken, MasterChef winner Derek Cheong's "
            "Berempah Bros, Michelin-recognised Ah Er Herbal Soup and Bib Gourmand MP Thai, plus Toast "
            "Box's first live-roasting outlet."
        ),
        "why": "Just-reopened Orchard food atrium — heritage hawkers and award stalls under one roof.",
        "when": "Daily 10am–10pm",
        "deal": "~$8-15/dish",
        "parking": "ION Orchard carpark; Orchard MRT.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
        "tags": ["Indoor", "AC", "Family-friendly", "Budget"],
        "tabs": ["flavours", "this-week"],
        "highlight": False,
        "nearHomeBonus": False,
        "top3Tabs": ["flavours"],
        "travel": {
            "zone": "Central",
            "fromWoodlands": "25–40 min",
            "region": "Orchard",
            "lat": 1.304,
            "lng": 103.8319,
            "geoSource": "approx",
            "geoQuery": "2 Orchard Turn, ION Orchard B4-04, Singapore 238801",
            "distanceKm": 15.6,
            "nearestMrt": "Orchard",
        },
        "google": None,
        "source": {
            "label": "Little Day Out",
            "url": "https://www.littledayout.com/food-opera-ion-orchard-food-court/",
        },
    },
    {
        "id": "fl-jomaru-tanjong-pagar",
        "title": "Jomaru Korean Hot Pot — gamjatang chain opens in Tanjong Pagar",
        "venue": "Tanjong Pagar",
        "description": (
            "Korean gamjatang specialist Jomaru (220+ outlets worldwide; roots to 1989) has opened at "
            "75 Tanjong Pagar Road. One-person haejangguk from S$21.80; sharing gamjatang from S$56.80; "
            "hot pot combo S$108.80 feeds 3–4 with braised pork bone and a pancake or cold spicy rice "
            "cake. Open daily till 2am."
        ),
        "why": "Fresh Tanjong Pagar Korean hot-pot opening — proper gamjatang till 2am.",
        "when": "Daily 11:30am–2am",
        "deal": "~$22 solo / ~$40-60 sharing",
        "parking": "Limited street / nearby carparks; Tanjong Pagar MRT minutes away.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
        "tags": ["Indoor", "AC", "Supper"],
        "tabs": ["flavours", "this-week", "happy-hour"],
        "highlight": True,
        "nearHomeBonus": False,
        "top3Tabs": ["flavours"],
        "travel": {
            "zone": "Central",
            "fromWoodlands": "25–40 min",
            "region": "Tanjong Pagar",
            "lat": 1.2768,
            "lng": 103.8455,
            "geoSource": "approx",
            "geoQuery": "75 Tanjong Pagar Road, Singapore 088496",
            "distanceKm": 17.8,
            "nearestMrt": "Tanjong Pagar",
        },
        "google": None,
        "source": {
            "label": "HungryGoWhere",
            "url": "https://hungrygowhere.com/food-news/jomaru-gamjatang-singapore/",
        },
    },
    {
        "id": "ev-mummys-market-expo-2026",
        "title": "Mummys Market Biggest Baby Fair — Singapore EXPO Hall 5, 2–4 Oct",
        "venue": "Singapore EXPO",
        "description": (
            "Mummys Market Biggest Baby Fair in Southeast Asia runs 2–4 October 2026 at Singapore EXPO "
            "Hall 5, 11am–9pm, free admission. 250,000+ baby and maternity products, seminars, workshops, "
            "and freebies (pregnancy goodie bags, diapers, samples) while stocks last — discounts up to 90% off."
        ),
        "why": "Free-entry Expo baby fair this Fri–Sun (2–4 Oct) — pair with TLM Food Expo next door.",
        "when": "Fri–Sun 2–4 Oct, daily 11am–9pm",
        "deal": "Free entry",
        "parking": "EXPO carparks; Expo MRT.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun"],
        "tags": ["Indoor", "AC", "Family-friendly"],
        "tabs": ["events", "this-week"],
        "highlight": False,
        "nearHomeBonus": False,
        "top3Tabs": ["events"],
        "travel": {
            "zone": "East",
            "fromWoodlands": "25–40 min",
            "region": "Changi / EXPO",
            "lat": 1.334,
            "lng": 103.959,
            "geoSource": "approx",
            "geoQuery": "1 Expo Drive, Singapore EXPO Hall 5, Singapore 486150",
            "distanceKm": 20.5,
            "nearestMrt": "Expo",
        },
        "google": None,
        "source": {
            "label": "Singapore EXPO",
            "url": "https://www.singaporeexpo.com.sg/events-at-expo/mummys-market-biggest-baby-fair-in-southeast-asia-oct-2026/",
        },
    },
    {
        "id": "ev-winter-time-expo-2026",
        "title": "Winter Time Expo Sales — Hall 6B through 4 Oct",
        "venue": "Singapore EXPO",
        "description": (
            "Winter Time's biggest winter-wear and luggage expo sale runs at Singapore EXPO Hall 6B "
            "1–4 October 2026, daily 10:30am–9:30pm — parkas, jackets, thermal wear and luggage with "
            "expo-only deals (up to 80% off while stocks last)."
        ),
        "why": "Last days Fri–Sun through Sun 4 Oct — winter wear + luggage at Expo Hall 6B.",
        "when": "Daily 10:30am–9:30pm through Sun 4 Oct",
        "deal": "Up to 80% off expo deals",
        "parking": "EXPO carparks; Expo MRT.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun"],
        "tags": ["Indoor", "AC"],
        "tabs": ["events", "brands", "this-week"],
        "highlight": False,
        "nearHomeBonus": False,
        "top3Tabs": ["events"],
        "travel": {
            "zone": "East",
            "fromWoodlands": "25–40 min",
            "region": "Changi / EXPO",
            "lat": 1.334,
            "lng": 103.959,
            "geoSource": "approx",
            "geoQuery": "1 Expo Drive, Singapore EXPO Hall 6B, Singapore 486150",
            "distanceKm": 20.5,
            "nearestMrt": "Expo",
        },
        "google": None,
        "source": {
            "label": "Wintertime",
            "url": "https://wintertime.com.sg/expo-sales-2026/",
        },
    },
    {
        "id": "ev-porsche-917-jewel",
        "title": "1971 Porsche 917 KH at Jewel — free display through 5 Oct",
        "venue": "Jewel Changi Airport",
        "description": (
            "The 1971 Porsche 917 KH from the Porsche Museum (Spa 1,000 km record car) is on free "
            "public display at Porsche at Jewel, Jewel Changi Airport, through Monday 5 October 2026. "
            "After Jewel it moves to Raceborn Fest (9–11 Oct) at Guoco Midtown — catch it at Jewel this week "
            "before F1 crowds."
        ),
        "why": "Free museum race-car display at Jewel through Mon 5 Oct — last days this week.",
        "when": "Daily through Mon 5 Oct (Porsche at Jewel hours)",
        "deal": "Free",
        "parking": "Jewel / Changi Airport carparks; Changi Airport MRT.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun", "Mon"],
        "tags": ["Indoor", "AC"],
        "tabs": ["events", "brands", "this-week"],
        "highlight": True,
        "nearHomeBonus": False,
        "top3Tabs": ["events", "this-week"],
        "travel": {
            "zone": "East",
            "fromWoodlands": "25–40 min",
            "region": "Changi",
            "lat": 1.3602,
            "lng": 103.989,
            "geoSource": "approx",
            "geoQuery": "78 Airport Boulevard, Porsche at Jewel, Singapore 819666",
            "distanceKm": 22.0,
            "nearestMrt": "Changi Airport",
        },
        "google": None,
        "source": {
            "label": "DANAMIC",
            "url": "https://danamic.org/2026/10/01/the-1971-porsche-917-that-still-holds-a-55-year-spa-record-is-at-jewel-until-5-october/",
        },
    },
    {
        "id": "fl-vela-changi-t1",
        "title": "VE/LA — Bangkok 24-hour cafe opens at Changi T1",
        "venue": "Changi Airport Terminal 1",
        "description": (
            "Bangkok specialty coffee and matcha chain VE/LA opened its first Singapore cafe at Changi "
            "Airport Terminal 1 (#01-K22, landside by Jewel) on 25 September 2026 — and it runs 24 hours. "
            "Singapore exclusive: Kaya Toast Latte (S$10) with pandan kaya, coconut cream, toast cubes and "
            "salted egg drizzle. No boarding pass needed."
        ),
        "why": "Brand-new 24-hour specialty cafe at Changi T1 — Kaya Toast Latte is the local exclusive.",
        "when": "Daily 24 hours",
        "deal": "Drinks ~$8-10",
        "parking": "Changi T1 / Jewel carparks; Changi Airport MRT.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
        "tags": ["Indoor", "AC"],
        "tabs": ["flavours", "this-week"],
        "highlight": False,
        "nearHomeBonus": False,
        "top3Tabs": ["flavours"],
        "travel": {
            "zone": "East",
            "fromWoodlands": "25–40 min",
            "region": "Changi",
            "lat": 1.3644,
            "lng": 103.9915,
            "geoSource": "approx",
            "geoQuery": "60 Airport Boulevard, Changi T1 #01-K22, Singapore 819642",
            "distanceKm": 22.0,
            "nearestMrt": "Changi Airport",
        },
        "google": None,
        "source": {
            "label": "Little Big Red Dot",
            "url": "https://littlebigreddot.com/ve-la-changi-airport-terminal-1-24-hour-cafe-kaya-toast-latte/",
        },
    },
    {
        "id": "fl-koko-kawane-star-vista",
        "title": "KOKO Kawane — farm-to-cup matcha atelier at The Star Vista",
        "venue": "The Star Vista / Buona Vista",
        "description": (
            "KOKO Kawane opened 30 September 2026 at The Star Vista #01-02 (1 Vista Exchange Green) — "
            "a tie-up between GAIA Group's KOKO patisserie and Kawane Matcha, a Shizuoka tea farm run by "
            "the Ohashi family since the 1600s. Okumidori first-flush tencha is freshly ground to order; "
            "lattes from S$8.50, usucha from S$7, cakes S$10–14. Opening treat: free Matcha Clicker Mystery "
            "Box with S$25 spend while stocks last."
        ),
        "why": "Opened 30 Sep — west-side matcha milled to order from a 400-year-old Shizuoka farm.",
        "when": "Daily 10am–9pm (last orders 8:30pm)",
        "deal": "Matcha drinks ~$7-14; free mystery box with $25 spend",
        "parking": "The Star Vista carpark; Buona Vista MRT.",
        "heatNote": "",
        "days": ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
        "tags": ["Indoor", "AC"],
        "tabs": ["flavours", "near-home", "this-week"],
        "highlight": True,
        "nearHomeBonus": True,
        "top3Tabs": ["flavours", "near-home"],
        "travel": {
            "zone": "West",
            "fromWoodlands": "25–40 min",
            "region": "Buona Vista",
            "lat": 1.3069,
            "lng": 103.7884,
            "geoSource": "approx",
            "geoQuery": "1 Vista Exchange Green, The Star Vista #01-02, Singapore 138617",
            "distanceKm": 14.5,
            "nearestMrt": "Buona Vista",
        },
        "google": None,
        "source": {
            "label": "Eatbook",
            "url": "https://eatbook.sg/koko-kawane/",
        },
    },
    {
        "id": "ev-mandai-curiosity-cove-halloween",
        "title": "Curiosity Cove The Mischief Within — Mandai's first Halloween",
        "venue": "Curiosity Cove / Mandai",
        "description": (
            "Mandai Curiosity Cove's first Halloween, The Mischief Within, runs 1 October–1 November 2026. "
            "Boo-tiful Day (daily 10am–5:30pm) is included with regular admission — pumpkin games and Quest "
            "Card badges. Sundown evenings (6:30–9:30pm) run this weekend Fri 2 & Sat 3 Oct (also later "
            "Oct weekends): trail challenges, bubble show and Best Dressed awards. Sundown from S$40 "
            "(Fri/Sun) or S$50 (Sat) for one adult + one child."
        ),
        "why": "Mandai's first Halloween — free daytime layer all week; Sundown nights Fri 2 & Sat 3 Oct.",
        "when": "Daily 10am–5:30pm; Sundown Fri 2 & Sat 3 Oct 6:30–9:30pm",
        "deal": "Daytime incl. admission; Sundown from $40 adult+child",
        "parking": "Mandai Wildlife Reserve carparks; Mandai Khatib Shuttle / public buses.",
        "heatNote": "Evening outdoor/indoor mix — light jacket for kids after 8pm.",
        "days": ["Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
        "tags": ["Indoor", "Outdoor", "Family-friendly"],
        "tabs": ["events", "near-home", "outdoor", "this-week"],
        "highlight": True,
        "nearHomeBonus": True,
        "top3Tabs": ["events", "near-home", "this-week"],
        "travel": {
            "zone": "North",
            "fromWoodlands": "10–20 min",
            "region": "Mandai",
            "lat": 1.403,
            "lng": 103.793,
            "geoSource": "approx",
            "geoQuery": "80 Mandai Lake Road, Curiosity Cove, Singapore 729979",
            "distanceKm": 6.5,
            "nearestMrt": "Khatib (shuttle)",
        },
        "google": None,
        "source": {
            "label": "DANAMIC",
            "url": "https://danamic.org/2026/09/24/mandais-first-halloween-turns-curiosity-cove-into-a-night-mystery/",
        },
    },
    {
        "id": "ev-raikan-ilmu-one-punggol",
        "title": "Raikan Ilmu@Heartlands closing edition — One Punggol 3–4 Oct",
        "venue": "One Punggol",
        "description": (
            "Yayasan MENDAKI's Raikan Ilmu@Heartlands closing edition lands at One Punggol on 3–4 October "
            "2026, 10am–6pm — the final stop of a five-month nationwide roadshow. Workshops, educational "
            "showcases and family-friendly activities around lifelong learning, stronger families and a "
            "future-ready workforce."
        ),
        "why": "Free north community learning weekend Sat–Sun 3–4 Oct at One Punggol — last stop island-wide.",
        "when": "Sat–Sun 3–4 Oct, 10am–6pm",
        "deal": "Free",
        "parking": "Underground carpark at One Punggol; Punggol Coast MRT.",
        "heatNote": "",
        "days": ["Sat", "Sun"],
        "tags": ["Indoor", "Family-friendly"],
        "tabs": ["events", "near-home", "this-week"],
        "highlight": False,
        "nearHomeBonus": True,
        "top3Tabs": ["near-home", "events"],
        "travel": {
            "zone": "North",
            "fromWoodlands": "25–40 min",
            "region": "Punggol",
            "lat": 1.41477,
            "lng": 103.91061,
            "geoSource": "approx",
            "geoQuery": "1 Punggol Drive, One Punggol, Singapore 828629",
            "distanceKm": 12.9,
            "nearestMrt": "Punggol Coast",
        },
        "google": None,
        "source": {
            "label": "The New Age Parents",
            "url": "https://thenewageparents.com/one-punggol-october-events/",
        },
    },
]


def main() -> None:
    data = json.loads(DATA.read_text(encoding="utf-8"))
    meta = data.setdefault("meta", {})
    meta["weekLabel"] = "2–8 Oct 2026"
    meta["weekStart"] = WEEK_START.isoformat()
    meta["weekEnd"] = WEEK_END.isoformat()
    meta["refreshedOn"] = TODAY.isoformat()
    meta["nextRefresh"] = "2026-10-09"
    meta["note"] = (
        "Only fresh finds this week — new openings, pop-ups, limited-run events, "
        "and menus you wouldn’t already have bookmarked. Familiar favourites are intentionally left out."
    )
    meta["sourcesNote"] = (
        "Scouted from Eatbook, HungryGoWhere, Little Big Red Dot, Little Day Out, DANAMIC, "
        "Singapore EXPO, Wintertime, Mandai / Curiosity Cove, The New Age Parents, and prior-week "
        "carry-overs still running. Always re-check hours before you go — new places change fast."
    )
    meta["autoRefreshNote"] = (
        "Auto-stamped 2026-10-02 SGT. Friday zone-pass 2 Oct 2026: rolled week from PR #15 baseline, "
        "stripped expired Mid-Autumn / Lilytopia / Shaping Hearts / River Wonders / Woodlands walk, "
        "added verified Oct openings, privacy-scrubbed user-facing Woodlands copy, recomputed zonePass."
    )

    kept = []
    stripped = []
    for act in data.get("activities", []):
        if not isinstance(act, dict):
            continue
        patched = patch_existing(act)
        if patched is None:
            stripped.append(act.get("id"))
            continue
        hit = is_blocked(patched)
        if hit:
            stripped.append(f"{patched.get('id')}:block:{hit}")
            continue
        kept.append(patched)

    existing_ids = {a.get("id") for a in kept}
    added = []
    for card in NEW_CARDS:
        if card["id"] in existing_ids:
            continue
        if is_blocked(card):
            continue
        kept.append(card)
        added.append(card["id"])

    # Central cap trim if still over
    central = [a for a in kept if (a.get("travel") or {}).get("zone") == "Central"]
    if len(central) > CAPS["Central"]:
        # Drop lowest-priority Central (non-highlight, older) until at cap
        drop_order = [
            "fl-maison-yoshoku-raffles",
            "fl-noci-orchard-gateway",
            "fl-aro-mohamed-sultan",
            "fl-bomul-scotts",
            "fl-dolpan-hwajoo",
            "fl-food-opera-ion",
        ]
        drop_set = set()
        over = len(central) - CAPS["Central"]
        for did in drop_order:
            if over <= 0:
                break
            if any(a.get("id") == did for a in central):
                drop_set.add(did)
                over -= 1
        kept = [a for a in kept if a.get("id") not in drop_set]
        stripped.extend(sorted(drop_set))

    # Final privacy scrub pass
    kept = [scrub_activity(a) for a in kept]

    data["activities"] = kept
    meta["zonePass"] = recompute_zone_pass(kept)
    meta.pop("curatorWarnings", None)
    zp = meta["zonePass"]
    cap_hits = [
        f"{z}: {zp['zones'][z]['rawCount']} items vs cap {CAPS[z]}"
        for z in ZONE_ORDER
        if zp["zones"][z].get("overCap")
    ]
    if cap_hits:
        meta["curatorWarnings"] = cap_hits

    DATA.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {DATA} ({DATA.stat().st_size} bytes)")
    print(f"Week: {meta['weekLabel']}")
    print(f"Activities: {len(kept)}")
    print(f"zonePass: {zp['summary']}")
    print(f"Added: {added}")
    print(f"Stripped/trimmed: {stripped}")


if __name__ == "__main__":
    main()
