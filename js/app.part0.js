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
      U + "photo-1498837164877-96005e283c1c" + Q,
      U + "photo-1467003903916-b12f468f0c8c" + Q,
      U + "photo-1504674900247-0877df9cc836" + Q,
      U + "photo-1540189549336-e6e99c3679fe" + Q,
    ],
    "happy-hour": [
      U + "photo-1513558161293-cdaf765ed2fd" + Q,
      U + "photo-1437418747212-8d9709afab22" + Q,
      U + "photo-1551024709-8f23befc6f87" + Q,
      U + "photo-1608270586620-248524c67de9" + Q,
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
      U + "photo-1501785888041-af3ef285b470" + Q,
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
      U + "photo-1480714378408-67cf0d13bc1b" + Q,
      U + "photo-1519501025264-65ba15a82390" + Q,
      U + "photo-1449824913935-59a10b8d2000" + Q,
      U + "photo-1477959858617-67f85cf4f1df" + Q,
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
    return fetch(url, { cache: "no-cache", signal: ctrl.signal }).finally(() =>
      clearTimeout(t)
    );
  }

  async function loadData() {
    try {
      const res = await fetchWithTimeout(DATA_URL, 6000);
      if (!res.ok) throw new Error("Network response not ok");
