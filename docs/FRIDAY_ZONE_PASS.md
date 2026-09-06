# Friday Zone Pass

Human Friday curation across Singapore zones — **not scraping**. Quality over volume. Woodlands-first Near Home stays. Blocklist unchanged (including New Bahru). **Never invent restaurant names.**

The Beanie Day agent runs this checklist every Friday before relying on cards.

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

## Zone quotas

Fill quotas for: **North**, **West**, **East**, **Central**, **South**.

Suggested minimums (tuneable in `meta.zonePass.quotas`):

| Zone | Minimum |
|------|---------|
| Central | 4 |
| East | 2 |
| West | 2 |
| North | 2 (include near-home / Woodlands-first) |
| South | 1 |

Only cards that credit a quota:

- Real `venue` / `venueName` (no placeholders)
- Concrete `source.url`
- `confirmNeeded: false`

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
python3 scripts/friday-refresh.py
```

This rolls week meta dates, filters the blocklist, and **recomputes** `meta.zonePass` counts / status / summary from confirmed activities only. It does not invent activities.
