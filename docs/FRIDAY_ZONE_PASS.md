# Friday Zone Pass

Human Friday curation across Singapore zones — **not scraping**. Quality over volume.

**The mission:** Beanie Day is for the public, not one household. Singapore's
activities concentrate downtown, so suburban Singaporeans routinely get a thin
week. Everything below exists to correct that: quotas pull the heartlands up,
the Central cap keeps downtown from flooding the week, and API candidates are
swept around heartland anchors — not one home point. Blocklist unchanged
(including New Bahru). **Never invent restaurant names.**

The Beanie Day agent runs this checklist every Friday before relying on cards.

**Per-user distance:** every activity carries `travel.lat`/`travel.lng`
(stamped by `friday-ingest.py geocode`). The app computes live distance from
each visitor's own saved postal code (`BeanieHomePostal.distanceKmTo`) for the
near-home sort and the "≈N km from you" line. The baked `travel.distanceKm`
in `week.json` is a curator reference only (measured from `HOME_POSTAL`,
default `730587`) — never shown as a visitor's distance.

## Scout sources

Check these for real openings / limited-run finds (then confirm on venue pages):

- City Nomads Just Opened
- Eatbook
- HungryGoWhere
- Honeycombers
- Time Out SG
- Seth Lui / TheSmartLocal
- Expo events (singaporeexpo.com.sg)
- HappyHourLah
- Urban List
- Venue pages (hours, menus, end dates)

### API candidates (review queue, not auto-publish)

`python3 scripts/friday-ingest.py fetch` pulls structured candidates into
`data/candidates.json` for human review. Nothing is auto-published into `week.json`.

- **Eventbrite** — geographic sweep around four heartland anchors
  (Woodlands, Jurong East, Tampines, Punggol, 12 km each; see `SEARCH_ANCHORS`
  in `scripts/friday-ingest.py`). Needs `EVENTBRITE_TOKEN`; get a private token
  at eventbrite.com/platform/api-keys. This is the big heartland fix: it
  surfaces neighbourhood workshops, markets, and classes the editorial sites
  never cover. Candidates record their nearest anchor; the app recomputes
  distance per visitor.
- **SISTIC** — Singapore's main ticketing platform: concerts, theatre, comedy,
  musicals. No public API is offered, so the adapter reads the same CMS JSON
  the sistic.com.sg site itself uses
  (`cms.sistic.com.sg/sistic/docroot/api/get-solr-search-results`, client=1 —
  verified 2026-09-09). No key needed; it is unauthenticated but undocumented,
  so treat it as fragile and watch for breakage. Events are filtered to the
  week by parsing the free-text `event_date` (ranges take the start date;
  "Daily" evergreen listings are skipped as not week-specific). Venue strings
  are geocoded via OneMap with a small verified hint map for hall names OneMap
  doesn't know (`SISTIC_VENUE_HINTS` in the script).
- **STB Tourism Information Hub** (tih.stb.gov.sg) — free business account,
  then request an API key under "My Setting". Add as a second adapter in
  `SOURCES` in `scripts/friday-ingest.py` once the key is in hand.

### Google verification (review queue, not auto-publish)

`python3 scripts/friday-ingest.py verify` (via `scripts/google-enrich.py`)
checks every candidate in `data/candidates.json` against the Google Places
API and stamps `candidate.google` with open status, rating, review count,
and match confidence. Results are cached 30 days in
`data/research/google-cache.json` (one text-search + one details call per
uncached place — inside the free tier at our volumes).

It flags, never deletes: `CLOSED_PERMANENTLY` / `CLOSED_TEMPORARILY`
venues and weak name matches print under "HUMAN REVIEW NEEDED". The same
script verifies `data/research/food-picks.json`
(`google-enrich.py enrich-picks`); `rebuild-week.py` reads the cache and
stamps `activity.google = {rating, reviews}`, which the card renderer shows
as a ⭐ fact chip. Skips cleanly in CI where the google-places skill isn't
installed.

### NParks parks layer (stable POI, not weekly)

`python3 scripts/parks-build.py` rebuilds `data/parks.json` from the official
data.gov.sg NParks datasets (Parks@SG: 52 parks with per-park attraction
descriptions + NParks page URLs; no key needed). Parks barely change, so this
runs **monthly** (`.github/workflows/parks-refresh.yml`), not on Fridays. The
app's 🌲 Parks tab renders them nearest-first by live per-user distance — pure
heartland content, free and always open.

### Heartland beats (explicit North / West searches)

Editorial sources are structurally downtown-biased. Every Friday, run at least
one explicit search per beat below — this is where non-central coverage comes from:

- **North:** Mandai / Zoo / Night Safari / Bird Paradise programming, Kranji
  countryside & farm events, Sungei Buloh Wetland Reserve activities,
  Woodlands Waterfront / Admiralty / Canberra / Yishun CC and mall atriums
  (Causeway Point excluded — blocklisted), Sembawang Hot Spring Park happenings
- **West:** Jurong Lake Gardens / Chinese Garden events, Science Centre,
  IMM / JEM / Westgate atrium roadshows, Bukit Batok / Choa Chu Kang CC events
- **Island-wide:** NLB library programmes (nlb.gov.sg), onePA community-centre
  courses & events (onepa.gov.sg), NParks events (nparks.gov.sg), mall atrium
  roadshows outside the core

## Zone quotas

Fill quotas for: **North**, **West**, **East**, **Central**, **South**.

Suggested minimums (tuneable in `meta.zonePass.quotas`):

| Zone | Minimum |
|------|---------|
| Central | 4 |
| East | 2 |
| West | 2 |
| North | 2 |
| South | 1 |

Quotas are audience-neutral minimums: every zone deserves a real week, not
just downtown. They pair with the Central cap below.

Only cards that credit a quota:

- Real `venue` / `venueName` (no placeholders)
- Concrete `source.url`
- `confirmNeeded: false`

## Zone caps (the downtown guardrail)

Quotas set minimums but never maximums — so Central can hit its quota of 4 and
keep going to 19. Caps fix that. Tuneable in `meta.zonePass.caps` / the
`caps` key of `data/zone-pass.state.json`.

| Zone | Cap |
|------|-----|
| Central | 10 |
| East / West / North / South | none |

When a zone exceeds its cap, `friday-refresh.py` flags it: the zone gets
`"overCap": true`, a note in `meta.zonePass.zones.<Zone>.note`, a `(cap N!)`
marker in the summary, and a warning in `meta.curatorWarnings` plus the
console output. The Friday workflow still runs green — the cap is a loud
signal, not a hard failure. Trim or move items before cards go out.

## Empty zones

If a zone has nothing real this week: **leave it empty**. Do not invent.

Mark `meta.zonePass.zones.<Zone>.status`:

- `filled` — count meets or exceeds quota
- `empty` — scouted, nothing (or under quota)
- `skipped` — intentionally skipped this week

## Placeholders & stale cards

- Replace generic `confirmNeeded` placeholders when real openings exist
- Delete stale generics that never got confirmed
- Never add blocklisted staples (VivoCity, Holland V, AMK Hub, Northpoint, Causeway Point, **New Bahru**, etc.)

## After editing `data/week.json`

```bash
python3 scripts/friday-ingest.py geocode   # stamp lat/lng + distanceKm via OneMap
python3 scripts/friday-ingest.py fetch     # API candidates -> data/candidates.json (review queue)
python3 scripts/friday-ingest.py verify    # Google-verify candidates (status/rating/hours); flags closures
python3 scripts/friday-ingest.py zones     # raw zone counts vs quotas + caps
python3 scripts/friday-refresh.py
```

`friday-ingest.py geocode` fills any missing `travel.lat` / `travel.lng` (OneMap)
and stamps `travel.distanceKm` from `HOME_POSTAL` (default `730587`) as a
curator reference. The app itself computes live per-user distance from each
visitor's saved postal code — the near-home tab sorts by that, and cards show
"≈N km from you". Visitors who skip postal entry see no km line (their
zone-bucket drive estimates still work).

`friday-refresh.py` rolls week meta dates, filters the blocklist, and
**recomputes** `meta.zonePass` counts / status / summary from confirmed
activities only. It does not invent activities.
