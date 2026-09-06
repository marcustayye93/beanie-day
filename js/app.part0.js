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
  };

  /** Visual pack per activity id */
  const VISUALS = {
    "tw-katong-omakase-new": {
      emoji: "🍣",
      grad: "linear-gradient(135deg,#fb923c,#ef4444)",
      image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80&auto=format&fit=crop",
    },
    "tw-duxton-pop-up-brand": {
      emoji: "✨",
      grad: "linear-gradient(135deg,#f472b6,#a855f7)",
      image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&q=80&auto=format&fit=crop",
    },
    "tw-expo-public-fair": {
      emoji: "🎪",
      grad: "linear-gradient(135deg,#f87171,#a855f7)",
      image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80&auto=format&fit=crop",
    },
    "tw-tanjong-pagar-hh-launch": {
      emoji: "🍻",
      grad: "linear-gradient(135deg,#fbbf24,#f97316)",
      image: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80&auto=format&fit=crop",
    },
    "tw-new-bahru-new-tenant": {
      emoji: "🏷️",
      grad: "linear-gradient(135deg,#e879f9,#8b5cf6)",
      image: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&q=80&auto=format&fit=crop",
    },
    "tw-north-new-restaurant": {
      emoji: "🍜",
      grad: "linear-gradient(135deg,#fb923c,#3b82f6)",
      image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&q=80&auto=format&fit=crop",
    },
    "tw-artscience-show": {
      emoji: "🪷",
      grad: "linear-gradient(135deg,#22d3ee,#818cf8)",
      image: "https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=800&q=80&auto=format&fit=crop",
    },
    "br-keong-saik-concept": {
      emoji: "💎",
      grad: "linear-gradient(135deg,#f472b6,#6366f1)",
      image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&q=80&auto=format&fit=crop",
    },
    "br-orchard-limited-drop": {
      emoji: "🛍️",
      grad: "linear-gradient(135deg,#818cf8,#c084fc)",
      image: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800&q=80&auto=format&fit=crop",
    },
    "br-bugis-weekend-market": {
      emoji: "🎨",
      grad: "linear-gradient(135deg,#f472b6,#fbbf24)",
      image: "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&q=80&auto=format&fit=crop",
    },
    "br-joo-chiat-new": {
      emoji: "🏘️",
      grad: "linear-gradient(135deg,#fcd34d,#f97316)",
      image: "https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800&q=80&auto=format&fit=crop",
    },
    "fl-tp-new-kitchen": {
      emoji: "🍽️",
      grad: "linear-gradient(135deg,#fb923c,#ef4444)",
      image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80&auto=format&fit=crop",
    },
    "fl-robertson-new": {
      emoji: "🥘",
      grad: "linear-gradient(135deg,#f472b6,#fb923c)",
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80&auto=format&fit=crop",
    },
    "fl-chinatown-new": {
      emoji: "🧧",
      grad: "linear-gradient(135deg,#ef4444,#f59e0b)",
      image: "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=800&q=80&auto=format&fit=crop",
    },
    "fl-west-new-opening": {
      emoji: "🌅",
      grad: "linear-gradient(135deg,#fb923c,#7c3aed)",
      image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80&auto=format&fit=crop",
    },
    "fl-siglap-new": {
      emoji: "🌶️",
      grad: "linear-gradient(135deg,#f87171,#fbbf24)",
      image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=80&auto=format&fit=crop",
    },
    "hh-emerald-new-deal": {
      emoji: "🥂",
      grad: "linear-gradient(135deg,#fbbf24,#b45309)",
      image: "https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=800&q=80&auto=format&fit=crop",
    },
    "hh-telok-ayer-new": {
      emoji: "🍸",
      grad: "linear-gradient(135deg,#a78bfa,#f472b6)",
      image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=800&q=80&auto=format&fit=crop",
    },
    "hh-boat-quay-limited": {
      emoji: "🌃",
      grad: "linear-gradient(135deg,#6366f1,#ec4899)",
      image: "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&q=80&auto=format&fit=crop",
    },
    "hh-woodlands-new-venue": {
      emoji: "🍺",
      grad: "linear-gradient(135deg,#38bdf8,#2563eb)",
      image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=800&q=80&auto=format&fit=crop",
    },
    "ev-expo-whats-on": {
      emoji: "🏟️",
      grad: "linear-gradient(135deg,#f43f5e,#8b5cf6)",
      image: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80&auto=format&fit=crop",
    },
    "ev-marina-light": {
      emoji: "🎆",
      grad: "linear-gradient(135deg,#38bdf8,#6366f1)",
      image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=800&q=80&auto=format&fit=crop",
    },
    "ev-national-gallery": {
      emoji: "🖼️",
      grad: "linear-gradient(135deg,#94a3b8,#6366f1)",
      image: "https://images.unsplash.com/photo-1577083552431-6e5fd01988ec?w=800&q=80&auto=format&fit=crop",
    },
    "ev-esplanade-show": {
      emoji: "🎭",
      grad: "linear-gradient(135deg,#f472b6,#8b5cf6)",
      image: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=800&q=80&auto=format&fit=crop",
    },
    "nh-woodlands-new-opening": {
      emoji: "🏠",
      grad: "linear-gradient(135deg,#60a5fa,#14b8a6)",
      image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80&auto=format&fit=crop",
    },
    "nh-sembawang-new": {
      emoji: "🆕",
      grad: "linear-gradient(135deg,#38bdf8,#22c55e)",
      image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80&auto=format&fit=crop",
    },
    "nh-kallang-wave-new": {
      emoji: "🎫",
      grad: "linear-gradient(135deg,#f87171,#3b82f6)",
      image: "https://images.unsplash.com/photo-1459749411177-041415906c1e?w=800&q=80&auto=format&fit=crop",
    },
    "nh-west-pop-up": {
      emoji: "📦",
      grad: "linear-gradient(135deg,#fb923c,#8b5cf6)",
      image: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=800&q=80&auto=format&fit=crop",
    },
    "out-gardens-by-bay-show": {
      emoji: "🌺",
      grad: "linear-gradient(135deg,#4ade80,#0ea5e9)",
      image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80&auto=format&fit=crop",
    },
    "out-botanic-event": {
      emoji: "🎶",
      grad: "linear-gradient(135deg,#86efac,#14b8a6)",
      image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80&auto=format&fit=crop",
    },
    "out-sentosa-limited": {
      emoji: "🏝️",
      grad: "linear-gradient(135deg,#38bdf8,#fbbf24)",
      image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80&auto=format&fit=crop",
    },
    "out-coney-seasonal": {
      emoji: "🚲",
      grad: "linear-gradient(135deg,#4ade80,#0ea5e9)",
      image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80&auto=format&fit=crop",
    },
    "out-rooftop-new": {
      emoji: "🌃",
      grad: "linear-gradient(135deg,#a78bfa,#f97316)",
      image: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&q=80&auto=format&fit=crop",
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
