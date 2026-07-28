# Beanie Day

A personal **weekly discovery** PWA for **Marcus & Chesa** in Woodlands, Singapore (730587).

**Purpose:** surface *new* things to do each week — openings, pop-ups, limited-run events, and menus — not familiar defaults.

Preferences (Holland Village energy, New Bahru browsing, dense food halls, Expo, afternoon beers, AC, parking) inform *taste*, but those familiar places are **not** listed as destinations.

## Live app (GitHub Pages)

**https://marcustayye93.github.io/beanie-day/**

Repo: [github.com/marcustayye93/beanie-day](https://github.com/marcustayye93/beanie-day)

### Install on iPhone (PWA)

1. Open the GitHub Pages URL in **Safari** (not Chrome-in-app browsers)
2. Tap the **Share** button
3. Tap **Add to Home Screen**
4. Open **Beanie Day** from your home screen

After the first online load, the current week’s data works offline.

## Features

- **7 sections**: This Week · Cool Brands · New Flavours · Happy Hour · Events & Expo · Near Home · Outdoor & Chill
- Image-led cards, expand for parking / heat / deals
- Installable PWA (iOS + Android)
- Offline for the cached week after first load
- No login

## Friday automation

GitHub Actions runs **every Friday 08:00 SGT** (cron `0 0 * * 5` UTC):

1. `scripts/friday-refresh.py` rolls `data/week.json` meta dates
2. Stamps an auto-refresh note + warns if familiar staples sneak back in
3. Commits & pushes → Pages redeploys

**Important:** the cron keeps dates honest; **you still curate real openings** into `activities[]` for quality (or run a manual research pass on Fridays). Auto-roll alone does not invent new restaurants.

### Manual Friday refresh

```bash
python3 scripts/friday-refresh.py
# edit data/week.json with this week’s real finds
git add data/week.json && git commit -m "chore(week): curated Friday finds" && git push
```

Or run the **Friday week refresh** workflow from the GitHub Actions tab (`workflow_dispatch`).

### Research sources

| Theme | Sources |
|--------|---------|
| New openings & food | City Nomads Just Opened, Eatbook.sg, HungryGoWhere, Honeycombers, Time Out SG, Seth Lui |
| Expo | singaporeexpo.com.sg/en/events |
| Happy hour | HappyHourLah, Urban List Singapore |
| Markets / Bugis | Time Out, local listings |
| Parking | ParkingGoWhere, OneMotoring, Parking.sg |

## Run locally

```bash
cd beanie-day
python3 -m http.server 8765 --bind 0.0.0.0
# open http://127.0.0.1:8765
```

## Project structure

```
beanie-day/
├── index.html
├── manifest.json
├── sw.js
├── css/styles.css
├── js/app.js
├── data/week.json          # curated weekly feed
├── scripts/friday-refresh.py
├── .github/workflows/
│   ├── deploy-pages.yml    # deploy on push to main
│   └── friday-refresh.yml  # Friday cron
└── icons/
```

## Deploy notes

- Static site only — no server runtime
- Relative URLs work on project Pages (`/beanie-day/`)
- `.nojekyll` is present so GitHub doesn’t process the site with Jekyll
- Service worker is network-first for shell + week data so Friday updates land

---

Helpful, clear, lightly cheerful — a friend who already knows what you both like, and only bothers you with what’s *new*.
