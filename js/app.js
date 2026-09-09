/* Beanie Day — baked polish (no raw.githubusercontent.com boot). Patches from improve/discovery-polish. */
/**
 * Beanie Day — weekly discovery PWA (new finds only)
 */
(function () {
  "use strict";

  const DATA_URL = "data/week.json";
  const STORAGE_KEY = "beanie-day-week-cache-v3";
  const TAB_KEY = "beanie-day-active-tab";

  const G = window.BeanieGuards || {};
  const isBlocklisted = G.isBlocklisted || (() => false);
  const isFresh = G.isFresh || ((a) => Boolean(a && a.highlight));
  const venueName = G.venueName || (() => "");
  const normalizeWeekData =
    G.normalizeWeekData ||
    ((raw) =>
      raw && Array.isArray(raw.activities) && Array.isArray(raw.tabs) ? raw : null);

  const TAB_THEME = {
    "this-week": { emoji: "✨", color: "#8b5cf6", grad: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
    brands: { emoji: "🛍️", color: "#ec4899", grad: "linear-gradient(135deg,#f472b6,#db2777)" },
    flavours: { emoji: "🍜", color: "#f97316", grad: "linear-gradient(135deg,#fb923c,#ea580c)" },
    "happy-hour": { emoji: "🍺", color: "#f59e0b", grad: "linear-gradient(135deg,#fbbf24,#d97706)" },
    "hh-prices": { emoji: "🍻", color: "#eab308", grad: "linear-gradient(135deg,#fde047,#b45309)" },
    events: { emoji: "🎪", color: "#ef4444", grad: "linear-gradient(135deg,#f87171,#dc2626)" },
    "near-home": { emoji: "🏡", color: "#3b82f6", grad: "linear-gradient(135deg,#60a5fa,#2563eb)" },
    outdoor: { emoji: "🌳", color: "#22c55e", grad: "linear-gradient(135deg,#4ade80,#16a34a)" },
    parks: { emoji: "🌲", color: "#16a34a", grad: "linear-gradient(135deg,#4ade80,#15803d)" },
  };

  /* Generic category stills — mood only, never a venue lookalike */
  const U = "https://images.unsplash.com/";
  const Q = "?w=900&q=70&auto=format&fit=crop";
  const CATEGORY_PHOTOS = {
    flavours: [
      U + "photo-1565299624946-b28f40a0ae38" + Q,
      U + "photo-1555939594-58d7cb561ad1" + Q,
      U + "photo-1504674900247-0877df9cc836" + Q,
      U + "photo-1540189549336-e6e99c3679fe" + Q,
    ],
    "happy-hour": [
      U + "photo-1513558161293-cdaf765ed2fd" + Q,
      U + "photo-1437418747212-8d9709afab22" + Q,
      U + "photo-1551024709-8f23befc6f87" + Q,
      U + "photo-1608270586620-248524c67de9" + Q,
    ],
    "hh-prices": [
      U + "photo-1436076863939-06870fe779c2" + Q,
      U + "photo-1535958636474-b021ee887b13" + Q,
      U + "photo-1600788886242-5c96aabe3757" + Q,
      U + "photo-1571613316887-6f8d5cbf7ef7" + Q,
    ],
    brands: [
      U + "photo-1523381294911-8d3cead13475" + Q,
      U + "photo-1472851294608-062f824d29cc" + Q,
      U + "photo-1555529669-e69e7aa0ba9a" + Q,
      U + "photo-1445205170230-053b83016050" + Q,
    ],
    events: [
      U + "photo-1514525253161-7a46d19cd819" + Q,
      U + "photo-1492684223066-81342ee5ff30" + Q,
      U + "photo-1501281668745-f7f57925c3b4" + Q,
      U + "photo-1519671482749-fd09be7ccebf" + Q,
    ],
    outdoor: [
      U + "photo-1441974231531-c6227db76b6e" + Q,
      U + "photo-1506929562872-bb421503ef21" + Q,
      U + "photo-1469474968028-56623f02e42e" + Q,
      U + "photo-1507525428034-b723cf961d3e" + Q,
    ],
    parks: [
      U + "photo-1441974231531-c6227db76b6e" + Q,
      U + "photo-1476231682828-37e571bc172f" + Q,
      U + "photo-1502082553048-f009c37129b9" + Q,
      U + "photo-1447752875215-b2761acb3c5d" + Q,
    ],
    "near-home": [
      U + "photo-1545324418-cc1a3fa10c00" + Q,
      U + "photo-1515263487990-61b07816b324" + Q,
      U + "photo-1460317442991-0ec209397118" + Q,
      U + "photo-1600585154340-be6161a56a0c" + Q,
    ],
    "this-week": [
      U + "photo-1414235077428-338989a2e8c0" + Q,
      U + "photo-1514362545857-3bc16c4c7d1b" + Q,
      U + "photo-1492684223066-81342ee5ff30" + Q,
      U + "photo-1441986300917-64674bd600d8" + Q,
    ],
  };

  /** Emoji + gradient only. Photos come from CATEGORY_PHOTOS, never per-venue stills. */
  const VISUALS = {
    "tw-katong-omakase-new": {
      emoji: "🍣",
      grad: "linear-gradient(135deg,#fb923c,#ef4444)",
    },
    "tw-duxton-pop-up-brand": {
      emoji: "✨",
      grad: "linear-gradient(135deg,#f472b6,#a855f7)",
    },
    "tw-expo-public-fair": {
      emoji: "🎪",
      grad: "linear-gradient(135deg,#f87171,#a855f7)",
    },
    "tw-tanjong-pagar-hh-launch": {
      emoji: "🍻",
      grad: "linear-gradient(135deg,#fbbf24,#f97316)",
    },
    "tw-north-new-restaurant": {
      emoji: "🍜",
      grad: "linear-gradient(135deg,#fb923c,#3b82f6)",
    },
    "tw-artscience-show": {
      emoji: "🪷",
      grad: "linear-gradient(135deg,#22d3ee,#818cf8)",
    },
    "br-keong-saik-concept": {
      emoji: "💎",
      grad: "linear-gradient(135deg,#f472b6,#6366f1)",
    },
    "br-orchard-limited-drop": {
      emoji: "🛍️",
      grad: "linear-gradient(135deg,#818cf8,#c084fc)",
    },
    "br-bugis-weekend-market": {
      emoji: "🎨",
      grad: "linear-gradient(135deg,#f472b6,#fbbf24)",
    },
    "br-joo-chiat-new": {
      emoji: "🏘️",
      grad: "linear-gradient(135deg,#fcd34d,#f97316)",
    },
    "fl-tp-new-kitchen": {
      emoji: "🍽️",
      grad: "linear-gradient(135deg,#fb923c,#ef4444)",
    },
    "fl-robertson-new": {
      emoji: "🥘",
      grad: "linear-gradient(135deg,#f472b6,#fb923c)",
    },
    "fl-chinatown-new": {
      emoji: "🧧",
      grad: "linear-gradient(135deg,#ef4444,#f59e0b)",
    },
    "fl-west-new-opening": {
      emoji: "🌅",
      grad: "linear-gradient(135deg,#fb923c,#7c3aed)",
    },
    "fl-siglap-new": {
      emoji: "🌶️",
      grad: "linear-gradient(135deg,#f87171,#fbbf24)",
    },
    "hh-emerald-new-deal": {
      emoji: "🥂",
      grad: "linear-gradient(135deg,#fbbf24,#b45309)",
    },
    "hh-telok-ayer-new": {
      emoji: "🍸",
      grad: "linear-gradient(135deg,#a78bfa,#f472b6)",
    },
    "hh-boat-quay-limited": {
      emoji: "🌃",
      grad: "linear-gradient(135deg,#6366f1,#ec4899)",
    },
    "hh-woodlands-new-venue": {
      emoji: "🍺",
      grad: "linear-gradient(135deg,#38bdf8,#2563eb)",
    },
    "ev-expo-whats-on": {
      emoji: "🏟️",
      grad: "linear-gradient(135deg,#f43f5e,#8b5cf6)",
    },
    "ev-marina-light": {
      emoji: "🎆",
      grad: "linear-gradient(135deg,#38bdf8,#6366f1)",
    },
    "ev-national-gallery": {
      emoji: "🖼️",
      grad: "linear-gradient(135deg,#94a3b8,#6366f1)",
    },
    "ev-esplanade-show": {
      emoji: "🎭",
      grad: "linear-gradient(135deg,#f472b6,#8b5cf6)",
    },
    "nh-woodlands-new-opening": {
      emoji: "🏠",
      grad: "linear-gradient(135deg,#60a5fa,#14b8a6)",
    },
    "nh-sembawang-new": {
      emoji: "🆕",
      grad: "linear-gradient(135deg,#38bdf8,#22c55e)",
    },
    "nh-kallang-wave-new": {
      emoji: "🎫",
      grad: "linear-gradient(135deg,#f87171,#3b82f6)",
    },
    "nh-west-pop-up": {
      emoji: "📦",
      grad: "linear-gradient(135deg,#fb923c,#8b5cf6)",
    },
    "out-gardens-by-bay-show": {
      emoji: "🌺",
      grad: "linear-gradient(135deg,#4ade80,#0ea5e9)",
    },
    "out-botanic-event": {
      emoji: "🎶",
      grad: "linear-gradient(135deg,#86efac,#14b8a6)",
    },
    "out-sentosa-limited": {
      emoji: "🏝️",
      grad: "linear-gradient(135deg,#38bdf8,#fbbf24)",
    },
    "out-coney-seasonal": {
      emoji: "🚲",
      grad: "linear-gradient(135deg,#4ade80,#0ea5e9)",
    },
    "out-rooftop-new": {
      emoji: "🌃",
      grad: "linear-gradient(135deg,#a78bfa,#f97316)",
    },
  };

  /** Intro entry points → app tabs */
  const INTRO_TABS = {
    flavours: true,
    "happy-hour": true,
    "this-week": true,
  };

  const state = {
    data: null,
    parks: [],
    hhPrices: [],
    activeTab: "this-week",
    query: "",
    filters: new Set(),
    deferredInstall: null,
    openCardId: null,
    inIntro: true,
  };

  const els = {
    intro: document.getElementById("intro"),
    appShell: document.getElementById("app-shell"),
    homeBtn: document.getElementById("home-btn"),
    tabNav: document.getElementById("tab-nav"),
    catScroll: document.getElementById("cat-scroll"),
    cardList: document.getElementById("card-list"),
    emptyState: document.getElementById("empty-state"),
    panelTitle: document.getElementById("panel-title"),
    panelBlurb: document.getElementById("panel-blurb"),
    sectionCount: document.getElementById("section-count"),
    sectionIcon: document.getElementById("section-icon"),
    hhBanner: document.getElementById("hh-banner"),
    hhBannerLink: document.getElementById("hh-banner-link"),
    weekLabel: document.getElementById("week-label"),
    weekRefresh: document.getElementById("week-refresh"),
    weekNote: document.getElementById("week-note"),
    footerSources: document.getElementById("footer-sources"),
    offlineStatus: document.getElementById("offline-status"),
    searchToggle: document.getElementById("search-toggle"),
    searchSheet: document.getElementById("search-sheet"),
    searchInput: document.getElementById("search-input"),
    searchClear: document.getElementById("search-clear"),
    filterChips: document.getElementById("filter-chips"),
    installBtn: document.getElementById("install-btn"),
    menuToggle: document.getElementById("menu-toggle"),
    navDrawer: document.getElementById("nav-drawer"),
    navBackdrop: document.getElementById("nav-backdrop"),
    toast: document.getElementById("toast"),
    iosDialog: document.getElementById("ios-install-dialog"),
    navBar: document.getElementById("nav-bar"),
    statPicks: document.getElementById("stat-picks"),
    statHh: document.getElementById("stat-hh"),
    statNear: document.getElementById("stat-near"),
  };

  async function init() {
    try {
      bindUI();
      registerServiceWorker();
      watchInstallPrompt();
      watchOnlineStatus();
      watchScroll();

      const hashTab = (location.hash || "").replace("#", "");
      // Deep-link: skip intro when a tab hash is present
      if (hashTab && hashTab !== "intro") {
        state.activeTab = hashTab;
        state.inIntro = false;
        document.body.classList.remove("intro-active");
      } else {
        state.inIntro = true;
        document.body.classList.add("intro-active");
      }

      await loadData();
      renderAll();
      // Cancel the stuck-loading safety UI
      if (window.__beanieBoot) clearTimeout(window.__beanieBoot);
    } catch (err) {
      console.error(err);
      // Still allow intro to show; fatal only if shell open
      document.body.classList.remove("intro-active");
      state.inIntro = false;
      showFatal(
        "Couldn’t load this week’s finds. Check your connection, then hard-refresh (or use Reload clean)."
      );
    }
  }

  function enterApp(tabId) {
    const tab = INTRO_TABS[tabId] ? tabId : "this-week";
    state.inIntro = false;
    state.openCardId = null;

    if (els.intro) {
      els.intro.classList.add("is-leaving");
    }

    const finish = () => {
      document.body.classList.remove("intro-active");
      els.intro?.classList.remove("is-leaving");
      setTab(tab, true);
      window.scrollTo({ top: 0, behavior: "auto" });
    };

    // Short exit animation then show app
    setTimeout(finish, 280);
  }
  window.__beanieEnterApp = enterApp;

  function showIntro() {
    state.inIntro = true;
    state.openCardId = null;
    document.body.classList.add("intro-active");
    history.replaceState(null, "", "#intro");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    // No `cache: "no-cache"` here on purpose: the service worker already
    // guarantees freshness (network-first for shell/data), and forcing
    // revalidation on every load defeats the SW + HTTP cache on repeat visits.
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
  }

  async function loadData() {
    // Parks + happy-hours don't depend on week.json: kick them off first so
    // all three download in parallel instead of serially.
    const parksP = loadParks();
    const hhP = loadHappyHours();
    try {
      const res = await fetchWithTimeout(DATA_URL, 6000);
      if (!res.ok) throw new Error("Network response not ok");
      let json;
      try {
        json = await res.json();
      } catch (_) {
        throw new Error("week.json is not valid JSON");
      }
      try {
        const fr = await fetchWithTimeout("data/schema-flags.json", 4000);
        if (fr.ok) {
          const flags = await fr.json();
          if (G.mergeSchemaFlags) json = G.mergeSchemaFlags(json, flags);
        }
      } catch (_) {
        /* flags overlay optional */
      }
      const normalized = normalizeWeekData(json);
      if (!normalized) throw new Error("Invalid week data shape");
      state.data = normalized;
      state.parks = await parksP;
      state.hhPrices = await hhP;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        // Drop legacy caches that may be stale familiar-place content
        localStorage.removeItem("beanie-day-week-cache-v1");
        localStorage.removeItem("beanie-day-week-cache-v2");
      } catch (_) {}
      return;
    } catch (networkErr) {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        try {
          const json = JSON.parse(cached);
          const normalized = normalizeWeekData(json);
          if (normalized) {
            state.data = normalized;
            state.parks = await parksP;
            state.hhPrices = await hhP;
            els.offlineStatus.hidden = false;
            toast("Offline — showing saved week");
            return;
          }
        } catch (_) {}
      }
      throw networkErr;
    }
  }

  const PARKS_URL = "data/parks.json";
  const PARKS_CACHE_KEY = "beanie-day-parks-cache-v1";
  const HH_URL = "data/happy-hours.json";
  const HH_CACHE_KEY = "beanie-day-hh-cache-v1";

  /** Cheapest-pints ranking (scripts/build-hh.py). Optional — never fatal. */
  async function loadHappyHours() {
    const valid = (p) => (p && Array.isArray(p.bars) ? p.bars : null);
    try {
      const res = await fetchWithTimeout(HH_URL, 6000);
      if (res.ok) {
        const payload = valid(await res.json());
        if (payload) {
          try {
            localStorage.setItem(HH_CACHE_KEY, JSON.stringify(payload));
          } catch (_) {}
          return payload;
        }
      }
    } catch (_) {
      /* offline or missing — fall through to cache */
    }
    try {
      const cached = valid(JSON.parse(localStorage.getItem(HH_CACHE_KEY) || "null"));
      if (cached) return cached;
    } catch (_) {}
    return [];
  }

  /** Stable POI layer (NParks via scripts/parks-build.py). Optional — never fatal. */
  async function loadParks() {
    const valid = (p) =>
      p && Array.isArray(p.parks) ? p.parks : null;
    try {
      const res = await fetchWithTimeout(PARKS_URL, 6000);
      if (res.ok) {
        const payload = valid(await res.json());
        if (payload) {
          try {
            localStorage.setItem(PARKS_CACHE_KEY, JSON.stringify(payload));
          } catch (_) {}
          return payload;
        }
      }
    } catch (_) {
      /* offline or missing — fall through to cache */
    }
    try {
      const cached = valid(JSON.parse(localStorage.getItem(PARKS_CACHE_KEY) || "null"));
      if (cached) return cached;
    } catch (_) {}
    return [];
  }

  function categoryKey(tabs) {
    const order = [
      "flavours",
      "happy-hour",
      "hh-prices",
      "brands",
      "events",
      "outdoor",
      "parks",
      "near-home",
      "this-week",
    ];
    const set = new Set(tabs || []);
    return order.find((k) => set.has(k)) || "this-week";
  }

  function genericPhoto(id, tabs) {
    const key = categoryKey(tabs);
    const pack = CATEGORY_PHOTOS[key] || CATEGORY_PHOTOS["this-week"];
    const s = String(id || key);
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return pack[h % pack.length];
  }

  function visualFor(id, tabs) {
    const pack = VISUALS[id];
    const primary = (tabs && tabs[0]) || "this-week";
    const theme = TAB_THEME[primary] || TAB_THEME["this-week"];
    return {
      emoji: (pack && pack.emoji) || theme.emoji,
      grad: (pack && pack.grad) || theme.grad,
      image: genericPhoto(id, tabs),
    };
  }

  function shortDesc(text, max = 100) {
    if (!text) return "";
    const t = text.trim();
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
  }

  function renderAll() {
    renderWeekMeta();
    renderHeroStats();
    renderTabs();
    renderCatScroll();
    renderPanel();
  }

  function renderWeekMeta() {
    const m = state.data.meta;
    els.weekLabel.textContent = m.weekLabel;
    els.weekRefresh.textContent = `New finds · until ${formatShortDate(m.weekEnd)}`;
    els.weekNote.textContent =
      "Only things that are new or time-limited this week — not the places you already know by heart.";
    els.footerSources.textContent = m.sourcesNote;
  }

  function renderHeroStats() {
    const acts = state.data.activities;
    const freshCount = acts.filter((a) => isFresh(a)).length;
    els.statPicks.textContent = String(freshCount || acts.filter((a) => a.highlight).length);
    els.statHh.textContent = String(state.hhPrices.length);
    els.statNear.textContent = String(
      acts.filter((a) => a.nearHomeBonus || a.tabs.includes("near-home")).length
    );
  }

  function renderTabs() {
    const tabs = state.data.tabs;
    if (!tabs.some((t) => t.id === state.activeTab)) state.activeTab = tabs[0].id;

    els.tabNav.innerHTML = tabs
      .map((tab) => {
        const selected = tab.id === state.activeTab;
        const theme = TAB_THEME[tab.id] || TAB_THEME["this-week"];
        return `
          <button type="button" class="tab-btn" role="tab" aria-selected="${selected}"
            data-tab="${tab.id}" title="${escapeAttr(tab.label)}">
            <span class="tab-emoji" aria-hidden="true">${theme.emoji}</span>
            <span class="tab-label">${escapeHtml(tab.shortLabel)}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderCatScroll() {
    const tabs = state.data.tabs;
    els.catScroll.innerHTML = tabs
      .map((tab) => {
        const selected = tab.id === state.activeTab;
        const theme = TAB_THEME[tab.id] || TAB_THEME["this-week"];
        return `
          <button type="button" class="cat-chip" role="tab" aria-selected="${selected}"
            data-tab="${tab.id}" style="--cat-color:${theme.color}">
            <span class="cat-chip-emoji">${theme.emoji}</span>
            <span class="cat-chip-label">${escapeHtml(tab.shortLabel)}</span>
          </button>
        `;
      })
      .join("");

    requestAnimationFrame(() => {
      els.catScroll.querySelector('[aria-selected="true"]')?.scrollIntoView({
        inline: "center",
        block: "nearest",
        behavior: "smooth",
      });
    });
  }

  function renderPanel() {
    const tab = state.data.tabs.find((t) => t.id === state.activeTab) || state.data.tabs[0];
    const theme = TAB_THEME[tab.id] || TAB_THEME["this-week"];
    const items = getFilteredActivities();

    els.panelTitle.textContent = tab.label;
    els.panelBlurb.textContent = tab.blurb;
    els.sectionIcon.textContent = theme.emoji;
    if (els.hhBanner) els.hhBanner.hidden = state.activeTab !== "happy-hour";

    // Tabs that sort by live per-user distance. If the user saved a postal
    // but we never got coordinates for it (geocode failed), the sort silently
    // degrades to dataset order — say so instead of implying "nearest".
    const DIST_TABS = ["happy-hour", "near-home", "parks"];
    let geoNote = "";
    try {
      const home = window.BeanieHomePostal?.getHome?.();
      const geoMissing =
        home && !home.skipped && home.postal && (home.lat == null || home.lng == null);
      if (geoMissing && DIST_TABS.includes(state.activeTab)) {
        geoNote =
          `<div class="geo-note">📍 We couldn’t pin your postal code, so this list ` +
          `isn’t sorted by distance — showing island-wide order. ` +
          `<button type="button" class="geo-note-btn" id="geo-note-retry">Re-enter postal code</button></div>`;
      }
    } catch (_) {
      /* non-fatal */
    }

    if (items.length) {
      els.sectionCount.hidden = false;
      els.sectionCount.textContent = String(items.length);
    } else {
      els.sectionCount.hidden = true;
    }

    if (!items.length) {
      els.cardList.innerHTML = "";
      els.emptyState.hidden = false;
      const titleEl = els.emptyState.querySelector(".empty-title");
      const copyEl = els.emptyState.querySelector(".empty-copy");
      const hasFilters = state.filters.size > 0 || Boolean(state.query.trim());
      if (titleEl) {
        titleEl.textContent = hasFilters ? "No matches" : "Nothing in this section";
      }
      if (copyEl) {
        copyEl.textContent = hasFilters
          ? "Clear search or filters to see more finds."
          : "Try another category — fresh picks rotate every Friday.";
      }
      return;
    }

    els.emptyState.hidden = true;

    // Top-3 carousel: quick editorial picks first, then the full library.
    // Skipped on the ranking tab (already ordered) and while searching/filtering.
    // Happy Hour is location-aware: with a pinned postal it shows the 3 nearest
    // bars (the list below is nearest-sorted), otherwise the 3 cheapest.
    const hasFilters = state.filters.size > 0 || Boolean(state.query.trim());
    let top3Title = "⭐ Top picks";
    let top3 = [];
    if (state.activeTab !== "hh-prices" && !hasFilters) {
      if (state.activeTab === "happy-hour") {
        let hasGeo = false;
        try {
          const h = window.BeanieHomePostal?.getHome?.();
          hasGeo = !!(h && !h.skipped && h.lat != null && h.lng != null);
        } catch (_) {}
        if (hasGeo) {
          top3 = items.slice(0, 3); // already nearest-sorted
          top3Title = "⭐ Nearest to you";
        } else {
          top3 = items.filter((a) => (a.top3Tabs || []).includes("happy-hour")).slice(0, 3);
          top3Title = "⭐ Cheapest island-wide";
        }
      } else {
        top3 = items.filter((a) => (a.top3Tabs || []).includes(state.activeTab)).slice(0, 3);
      }
    }
    let lead = "";
    if (top3.length) {
      lead =
        `<div class="top3-wrap">` +
        `<h3 class="top3-title">${escapeHtml(top3Title)}</h3>` +
        `<div class="top3-carousel">${top3
          .map((a, i) => cardHtml(a, i, "-top3"))
          .join("")}</div>` +
        `</div>`;
    }
    els.cardList.innerHTML =
      geoNote + lead + items.map((a, i) => cardHtml(a, i)).join("");
    // Wire the "re-enter postal code" button in the geo notice, if present.
    const retryBtn = document.getElementById("geo-note-retry");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        if (window.BeanieHomePostal?.openModal) window.BeanieHomePostal.openModal();
      });
    }
  }

  /** Adapt a park record to the card shape activities use. */
  function parkToCard(p) {
    const t = p.travel || {};
    // Editorial top-3 for the Parks carousel: one classic, one central
    // heartland green, one northern waterfront.
    const PARKS_TOP3 = new Set([
      "park-east-coast-park",
      "park-bishan-ang-mo-kio-park",
      "park-woodlands-waterfront-park",
    ]);
    return {
      id: p.id,
      title: p.name,
      venue: "",
      description: (p.attractions || []).join(" · "),
      why: "",
      when: "",
      deal: "",
      parking: "",
      heatNote: "",
      days: [],
      tags: ["Outdoor"],
      tabs: ["parks"],
      highlight: false,
      nearHomeBonus: false,
      top3Tabs: PARKS_TOP3.has(p.id) ? ["parks"] : [],
      travel: { lat: t.lat, lng: t.lng, zone: t.zone, region: t.region, nearestMrt: t.nearestMrt },
      source: p.url ? { label: "NParks", url: p.url } : null,
    };
  }

  /** Adapt a happy-hour price record to the card shape activities use.
      idx = 0-based position in the cheapest-first ranking. */
  function hhPriceToCard(b, idx, ranked) {
    const t = b.travel || {};
    const price =
      typeof b.hh_price === "number" ? `$${b.hh_price.toFixed(2)}` : "";
    const whenBits = [b.hh_days, b.hh_hours].filter(Boolean).join(" · ");
    return {
      id: b.id,
      title: b.bar,
      venue: b.area || "",
      description: `${b.pour ? b.pour + " · " : ""}${whenBits}`.trim() || b.area || "",
      why: "",
      when: whenBits,
      deal:
        `${price ? price + (b.deal_kind === "everyday" ? " everyday pour" : " happy-hour pour") : "Happy-hour pour"}` +
        `${b.pour ? " · " + b.pour : ""}` +
        `${
          typeof b.regular_price === "number"
            ? ` (usual $${b.regular_price.toFixed(2)})`
            : ""
        }` +
        `${b.price_note ? " — " + b.price_note : ""}`,
      parking: "",
      heatNote: "",
      days: [],
      tags: ["Indoor"],
      tabs: ["hh-prices"],
      highlight: false,
      nearHomeBonus: false,
      rank: ranked ? idx + 1 : null,
      top3Tabs: idx < 3 ? ["happy-hour"] : [],
      travel: {
        lat: t.lat,
        lng: t.lng,
        zone: t.zone,
        region: t.region || b.area,
        nearestMrt: t.nearestMrt,
      },
      source:
        b.source && b.source.url
          ? { label: b.source.label || "Source", url: b.source.url }
          : null,
    };
  }

  function getFilteredActivities() {
    // Happy-hour tab: full bar library, nearest-first by live per-user distance.
    // The banner above it links to the cheapest-first ranking (hh-prices tab).
    if (state.activeTab === "happy-hour") {
      const q = state.query.trim().toLowerCase();
      let list = (state.hhPrices || []).map((b, i) => hhPriceToCard(b, i, false));
      if (q) {
        list = list.filter((a) =>
          [
            a.title,
            a.venue,
            a.description,
            a.deal,
            a.when,
            a.travel?.zone,
            a.travel?.region,
            a.travel?.nearestMrt,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }
      const distOf = (x) => {
        const d = window.BeanieHomePostal?.distanceKmTo?.(x);
        return typeof d === "number" && isFinite(d) ? d : Infinity;
      };
      return [...list].sort((a, b) => distOf(a) - distOf(b));
    }
    // Cheapest-pints tab: ranked cheapest-first by scripts/build-hh.py.
    if (state.activeTab === "hh-prices") {
      const q = state.query.trim().toLowerCase();
      let list = (state.hhPrices || []).map((b, i) => hhPriceToCard(b, i, true));
      if (q) {
        list = list.filter((a) =>
          [
            a.title,
            a.venue,
            a.description,
            a.deal,
            a.when,
            a.travel?.zone,
            a.travel?.region,
            a.travel?.nearestMrt,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }
      return list;
    }
    // Parks tab: stable NParks POI layer, nearest-first by live per-user distance.
    if (state.activeTab === "parks") {
      const q = state.query.trim().toLowerCase();
      let list = (state.parks || []).map(parkToCard);
      if (q) {
        list = list.filter((a) =>
          [a.title, a.description, a.travel?.zone, a.travel?.region, ...(a.tags || [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }
      const distOf = (x) => {
        const d = window.BeanieHomePostal?.distanceKmTo?.(x);
        return typeof d === "number" && isFinite(d) ? d : Infinity;
      };
      return [...list].sort((a, b) => distOf(a) - distOf(b));
    }

    let list = state.data.activities.filter(
      (a) => a.tabs.includes(state.activeTab) && !isBlocklisted(a)
    );
    const q = state.query.trim().toLowerCase();

    if (q) {
      list = list.filter((a) => {
        const hay = [
          a.title,
          a.venue,
          a.description,
          a.why,
          a.when,
          a.parking,
          a.deal,
          a.travel?.zone,
          a.travel?.region,
          ...(a.tags || []),
          ...(a.days || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (state.filters.has("AC")) {
      list = list.filter((a) => a.tags?.includes("AC") || a.tags?.includes("Indoor"));
    }
    if (state.filters.has("near")) {
      list = list.filter(
        (a) =>
          a.nearHomeBonus ||
          a.tabs.includes("near-home") ||
          ["North", "West"].includes(a.travel?.zone)
      );
    }
    if (state.filters.has("highlight")) list = list.filter((a) => a.highlight);
    if (state.filters.has("weekend")) {
      list = list.filter((a) => a.days?.includes("Sat") || a.days?.includes("Sun"));
    }

    if (state.activeTab === "this-week") {
      list = [...list].sort((a, b) => {
        const score = (x) => (x.highlight ? 2 : 0) + (x.nearHomeBonus ? 1 : 0);
        return score(b) - score(a);
      });
    } else if (state.activeTab === "near-home") {
      // Closest first — live per-user distance from the saved postal code.
      // Anything without a computable distance sinks to the bottom.
      const distOf = (x) => {
        const d = window.BeanieHomePostal?.distanceKmTo?.(x);
        return typeof d === "number" && isFinite(d) ? d : Infinity;
      };
      list = [...list].sort((a, b) => distOf(a) - distOf(b));
    } else if (state.activeTab !== "near-home") {
      list = [...list].sort((a, b) => {
        if (a.nearHomeBonus === b.nearHomeBonus) {
          if (a.highlight === b.highlight) return 0;
          return a.highlight ? -1 : 1;
        }
        return a.nearHomeBonus ? -1 : 1;
      });
    }

    return list;
  }

  function cardHtml(a, index, idSuffix = "") {
    const v = visualFor(a.id, a.tabs);
    const isOpen = state.openCardId === a.id + idSuffix;
    const fresh = isFresh(a);
    const venue = venueName(a);
    const classes = ["card"];
    if (isOpen) classes.push("is-open");
    if (a.highlight) classes.push("highlight");
    if (a.nearHomeBonus) classes.push("near-home");
    if (fresh) classes.push("is-fresh");

    const badges = [];
    if (fresh) badges.push(`<span class="badge fresh">🆕 This week</span>`);
    if (a.rank) badges.push(`<span class="badge rank">#${a.rank} cheapest</span>`);
    if (a.highlight) badges.push(`<span class="badge top">⭐ Top</span>`);
    if (a.nearHomeBonus) badges.push(`<span class="badge near">🏡 Near</span>`);
    (a.tags || []).slice(0, 2).forEach((t) => {
      const icon = t === "AC" ? "❄️" : t === "Outdoor" ? "🌤️" : t === "Indoor" ? "🏠" : "•";
      badges.push(`<span class="badge tag">${icon} ${escapeHtml(t)}</span>`);
    });

    const facts = [];
    if (a.days?.length) {
      facts.push(
        `<span class="fact"><span class="fact-icon">📅</span>${escapeHtml(
          a.days.slice(0, 3).join(" · ")
        )}${a.days.length > 3 ? "…" : ""}</span>`
      );
    }
    if (a.tags?.includes("AC")) {
      facts.push(`<span class="fact"><span class="fact-icon">❄️</span>AC</span>`);
    }
    const driveChip = window.BeanieHomePostal?.formatDriveChip?.(a.travel?.zone);
    if (driveChip) {
      facts.push(
        `<span class="fact"><span class="fact-icon">🚗</span>${escapeHtml(driveChip)}</span>`
      );
    }
    if (a.travel?.nearestMrt) {
      facts.push(
        `<span class="fact"><span class="fact-icon">🚇</span>${escapeHtml(a.travel.nearestMrt)} MRT</span>`
      );
    }

    const details = [];
    if (a.why) {
      details.push(`
        <div class="detail-block detail-why">
          <div class="label">💚 Why this week</div>
          ${escapeHtml(a.why)}
        </div>`);
    }
    if (a.deal) {
      details.push(`
        <div class="detail-block detail-deal">
          <div class="label">🍺 The deal</div>
          ${escapeHtml(a.deal)}
        </div>`);
    }
    if (a.heatNote) {
      details.push(`
        <div class="detail-block detail-heat">
          <div class="label">☀️ Heat note</div>
          ${escapeHtml(a.heatNote)}
        </div>`);
    }
    if (a.when) {
      details.push(`
        <div class="detail-block detail-when">
          <div class="label">🕐 When</div>
          ${escapeHtml(a.when)}
        </div>`);
    }
    if (a.parking) {
      details.push(`
        <div class="detail-block detail-park">
          <div class="label">🅿️ Parking</div>
          ${escapeHtml(a.parking)}
        </div>`);
    }
    if (a.travel?.region) {
      // Live per-user distance from the saved postal. Falls back to nothing
      // (not the baked curator reference) when the user skipped postal entry.
      const liveKm = window.BeanieHomePostal?.distanceKmTo?.(a);
      const dist =
        typeof liveKm === "number" && isFinite(liveKm)
          ? ` · ≈${Math.round(liveKm)} km from you`
          : "";
      details.push(`
        <div class="detail-block detail-when">
          <div class="label">📍 Area</div>
          ${escapeHtml(a.travel.region)} · ${escapeHtml(a.travel.zone || "")}${dist}
        </div>`);
    }

    const img = v.image
      ? `<img src="${escapeAttr(v.image)}" alt="" loading="lazy" decoding="async"
           onload="this.parentElement.classList.add('has-img')"
           onerror="this.remove()" />`
      : "";

    const source = a.source
      ? `<a class="source-link" href="${escapeAttr(a.source.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(a.source.label || "Open")} <span aria-hidden="true">↗</span>
        </a>`
      : "";

    const desc = escapeHtml(isOpen ? a.description : shortDesc(a.description, 110));

    const detailsId = `card-details-${escapeAttr(a.id)}${idSuffix}`;
    const metaBits = [];
    if (venue) metaBits.push(`<span class="card-venue">${escapeHtml(venue)}</span>`);
    if (a.travel?.zone) {
      metaBits.push(
        `<span class="card-meta-sep" aria-hidden="true">·</span><span class="card-meta-zone">${escapeHtml(
          a.travel.zone
        )}</span>`
      );
    }
    const driveMeta = window.BeanieHomePostal?.formatDriveChip?.(a.travel?.zone);
    if (driveMeta) {
      metaBits.push(
        `<span class="card-meta-sep" aria-hidden="true">·</span><span class="card-meta-drive">${escapeHtml(
          driveMeta
        )}</span>`
      );
    }

    const href = a.source && a.source.url ? escapeAttr(a.source.url) : "";
    const hitOpen = href
      ? `<a class="card-hit" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(
          "Open details: " + a.title
        )}">`
      : `<div class="card-hit" data-toggle="${escapeAttr(a.id)}${idSuffix}" role="button" tabindex="0"
          aria-expanded="${isOpen}" aria-controls="${detailsId}"
          aria-label="${escapeAttr((isOpen ? "Collapse " : "Expand ") + a.title)}">`;
    const hitClose = href ? "</a>" : "</div>";

    return `
      <article class="${classes.join(" ")}" style="animation-delay:${Math.min(index, 12) * 45}ms; --card-grad:${v.grad}" data-id="${escapeAttr(a.id)}${idSuffix}">
        ${hitOpen}
          <div class="card-media" style="background:${v.grad}">
            ${img}
            <div class="card-media-fallback" aria-hidden="true">${v.emoji}</div>
            <div class="card-media-shade"></div>
            <div class="card-media-top">${badges.join("")}</div>
            <div class="card-media-bottom">
              <span class="travel-chip">📍 ${escapeHtml(a.travel?.zone || "Singapore")}</span>
              <span class="expand-hint" aria-hidden="true">↗</span>
            </div>
          </div>
          <div class="card-body">
            <div class="card-header">
              <h3 class="card-title">${escapeHtml(a.title)}</h3>
              ${
                metaBits.length
                  ? `<p class="card-meta">${metaBits.join("")}</p>`
                  : ""
              }
            </div>
            <p class="card-desc">${desc}</p>
            <div class="quick-facts">${facts.join("")}</div>
            <div class="card-details" id="${detailsId}" ${isOpen ? "" : "inert"}>
              <div class="card-details-inner">
                ${details.join("")}
              </div>
            </div>
            <div class="card-footer">
              <span class="tap-hint">${href ? "Read more ↗" : isOpen ? "Tap to collapse" : "Tap for details"}</span>
            </div>
          </div>
        ${hitClose}
        ${source ? `<div class="card-source-row">${source}</div>` : ""}
      </article>
    `;
  }

  function showFatal(msg) {
    els.cardList.innerHTML = `
      <div class="empty-state">
        <div class="empty-art">😵</div>
        <p class="empty-title">Something went wrong</p>
        <p class="empty-copy">${escapeHtml(msg)}</p>
      </div>`;
    els.emptyState.hidden = true;
  }

  function bindUI() {
    // Intro panels → section
    els.intro?.addEventListener("click", (e) => {
      const panel = e.target.closest("[data-enter-tab]");
      if (!panel) return;
      enterApp(panel.dataset.enterTab);
    });

    // Happy-hour banner → cheapest-pints ranking
    els.hhBannerLink?.addEventListener("click", () => setTab("hh-prices"));

    const setNavOpen = (open) => {
      const drawer = els.navDrawer;
      const backdrop = els.navBackdrop;
      const toggle = els.menuToggle;
      if (!drawer || !toggle) return;
      drawer.hidden = !open;
      if (backdrop) backdrop.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("nav-open", open);
    };
    const closeNavDrawer = () => setNavOpen(false);
    const openNavDrawer = () => setNavOpen(true);

    // Logo → back to cinematic explore home
    els.homeBtn?.addEventListener("click", () => {
      closeNavDrawer();
      showIntro();
    });

    els.menuToggle?.addEventListener("click", () => {
      const open = els.menuToggle.getAttribute("aria-expanded") !== "true";
      setNavOpen(open);
    });
    els.navBackdrop?.addEventListener("click", closeNavDrawer);
    els.navDrawer?.addEventListener("click", (e) => {
      const action = e.target.closest("[data-nav-action]");
      if (!action) return;
      const kind = action.dataset.navAction;
      closeNavDrawer();
      if (kind === "explore") {
        showIntro();
      } else if (kind === "search") {
        els.searchSheet.hidden = false;
        els.searchToggle?.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => els.searchInput?.focus());
      } else if (kind === "install") {
        onInstallClick();
      } else if (kind === "home-postal") {
        window.BeanieHomePostal?.openModal?.({ required: false });
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("nav-open")) {
        closeNavDrawer();
      }
    });

    window.addEventListener("beanie:home-postal-changed", () => {
      try {
        renderPanel();
      } catch (_) {}
    });

    const onTab = (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      setTab(btn.dataset.tab);
    };
    els.tabNav.addEventListener("click", onTab);
    els.catScroll.addEventListener("click", onTab);

    const toggleCard = (id) => {
      state.openCardId = state.openCardId === id ? null : id;
      renderPanel();
      if (state.openCardId) {
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-id="${CSS.escape(state.openCardId)}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    };

    els.cardList.addEventListener("click", (e) => {
      if (e.target.closest("a.source-link")) return;
      const hit = e.target.closest("[data-toggle]");
      if (!hit) return;
      toggleCard(hit.dataset.toggle);
    });

    els.cardList.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target.closest("a.source-link")) return;
      const hit = e.target.closest("[data-toggle]");
      if (!hit) return;
      e.preventDefault();
      toggleCard(hit.dataset.toggle);
    });

    els.searchToggle.addEventListener("click", () => {
      const open = els.searchSheet.hidden;
      els.searchSheet.hidden = !open;
      els.searchToggle.setAttribute("aria-expanded", String(open));
      if (open) requestAnimationFrame(() => els.searchInput.focus());
      else clearSearch();
    });

    els.searchInput.addEventListener("input", () => {
      state.query = els.searchInput.value;
      els.searchClear.hidden = !state.query;
      renderPanel();
    });

    els.searchClear.addEventListener("click", () => {
      clearSearch();
      els.searchInput.focus();
    });

    els.filterChips.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-filter]");
      if (!chip) return;
      const key = chip.dataset.filter;
      if (state.filters.has(key)) {
        state.filters.delete(key);
        chip.setAttribute("aria-pressed", "false");
      } else {
        state.filters.add(key);
        chip.setAttribute("aria-pressed", "true");
      }
      renderPanel();
    });

    els.installBtn.addEventListener("click", onInstallClick);

    window.addEventListener("hashchange", () => {
      const tab = (location.hash || "").replace("#", "");
      if (!tab || tab === "intro") {
        if (!state.inIntro) showIntro();
        return;
      }
      if (state.inIntro) {
        enterApp(tab);
        return;
      }
      if (tab !== state.activeTab) setTab(tab, false);
    });
  }

  function clearSearch() {
    state.query = "";
    els.searchInput.value = "";
    els.searchClear.hidden = true;
    renderPanel();
  }

  function setTab(id, updateHash = true) {
    state.activeTab = id;
    state.openCardId = null;
    localStorage.setItem(TAB_KEY, id);
    if (updateHash) history.replaceState(null, "", `#${id}`);
    renderTabs();
    renderCatScroll();
    renderPanel();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function watchInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredInstall = e;
      els.installBtn.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      state.deferredInstall = null;
      els.installBtn.hidden = true;
      toast("Beanie Day installed ✨");
    });
    if (isIos() && !isStandalone()) els.installBtn.hidden = false;
  }

  async function onInstallClick() {
    if (state.deferredInstall) {
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      els.installBtn.hidden = true;
      return;
    }
    els.iosDialog?.showModal();
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("./sw.js?v=19")
        .then((reg) => {
          // Prefer the newest worker immediately
          if (reg.waiting) reg.waiting.postMessage("SKIP_WAITING");
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                nw.postMessage("SKIP_WAITING");
              }
            });
          });
        })
        .catch(() => {});

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        // One soft reload so the new SW is live
        // (avoid loops by only doing this when we requested an update)
      });
    });
  }

  function watchOnlineStatus() {
    const update = () => {
      els.offlineStatus.hidden = navigator.onLine;
    };
    window.addEventListener("online", () => {
      update();
      toast("Back online 🌐");
    });
    window.addEventListener("offline", () => {
      update();
      toast("Offline — saved week still works");
    });
    update();
  }

  function watchScroll() {
    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          els.navBar?.classList.toggle("is-scrolled", window.scrollY > 8);
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  function toast(msg, ms = 2400) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      els.toast.hidden = true;
    }, ms);
  }

  function formatShortDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso + "T12:00:00").toLocaleDateString("en-SG", {
        day: "numeric",
        month: "short",
      });
    } catch {
      return iso;
    }
  }

  function isIos() {
    return (
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }

  function isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  // Parts load async after DOMContentLoaded may already have fired
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
