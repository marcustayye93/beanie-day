/**
 * Beanie Day — weekly discovery PWA (new finds only)
 */
(function () {
  "use strict";

  const DATA_URL = "data/week.json";
  const STORAGE_KEY = "beanie-day-week-cache-v3";
  const TAB_KEY = "beanie-day-active-tab";

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
      const json = await res.json();
      if (!json || !Array.isArray(json.activities) || !Array.isArray(json.tabs)) {
        throw new Error("Invalid week data shape");
      }
      state.data = json;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
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
          if (json && Array.isArray(json.activities) && Array.isArray(json.tabs)) {
            state.data = json;
            els.offlineStatus.hidden = false;
            toast("Offline — showing saved week");
            return;
          }
        } catch (_) {}
      }
      throw networkErr;
    }
  }

  function visualFor(id, tabs) {
    if (VISUALS[id]) return VISUALS[id];
    const primary = (tabs && tabs[0]) || "this-week";
    const theme = TAB_THEME[primary] || TAB_THEME["this-week"];
    return { emoji: theme.emoji, grad: theme.grad, image: "" };
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
    els.statPicks.textContent = String(acts.filter((a) => a.highlight).length);
    els.statHh.textContent = String(acts.filter((a) => a.tabs.includes("happy-hour")).length);
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

    if (items.length) {
      els.sectionCount.hidden = false;
      els.sectionCount.textContent = String(items.length);
    } else {
      els.sectionCount.hidden = true;
    }

    if (!items.length) {
      els.cardList.innerHTML = "";
      els.emptyState.hidden = false;
      return;
    }

    els.emptyState.hidden = true;
    els.cardList.innerHTML = items.map((a, i) => cardHtml(a, i)).join("");
  }

  function getFilteredActivities() {
    let list = state.data.activities.filter((a) => a.tabs.includes(state.activeTab));
    const q = state.query.trim().toLowerCase();

    if (q) {
      list = list.filter((a) => {
        const hay = [
          a.title,
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

  function cardHtml(a, index) {
    const v = visualFor(a.id, a.tabs);
    const isOpen = state.openCardId === a.id;
    const classes = ["card"];
    if (isOpen) classes.push("is-open");
    if (a.highlight) classes.push("highlight");
    if (a.nearHomeBonus) classes.push("near-home");

    const badges = [];
    badges.push(`<span class="badge top">🆕 New</span>`);
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
    if (a.travel?.fromWoodlands) {
      facts.push(
        `<span class="fact"><span class="fact-icon">🚗</span>${escapeHtml(a.travel.fromWoodlands)}</span>`
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
      details.push(`
        <div class="detail-block detail-when">
          <div class="label">📍 Area</div>
          ${escapeHtml(a.travel.region)} · ${escapeHtml(a.travel.zone || "")}
        </div>`);
    }

    const img = v.image
      ? `<img src="${escapeAttr(v.image)}" alt="" loading="lazy" decoding="async"
           onload="this.parentElement.classList.add('has-img')"
           onerror="this.remove()" />`
      : "";

    const source = a.source
      ? `<a class="source-link" href="${escapeAttr(a.source.url)}" target="_blank" rel="noopener noreferrer">
          Open ↗
        </a>`
      : "";

    const desc = escapeHtml(isOpen ? a.description : shortDesc(a.description, 110));

    return `
      <article class="${classes.join(" ")}" style="animation-delay:${Math.min(index, 12) * 45}ms; --card-grad:${v.grad}" data-id="${escapeAttr(a.id)}">
        <div class="card-hit" data-toggle="${escapeAttr(a.id)}" role="button" tabindex="0" aria-expanded="${isOpen}">
          <div class="card-media" style="background:${v.grad}">
            ${img}
            <div class="card-media-fallback" aria-hidden="true">${v.emoji}</div>
            <div class="card-media-shade"></div>
            <div class="card-media-top">${badges.join("")}</div>
            <div class="card-media-bottom">
              <span class="travel-chip">📍 ${escapeHtml(a.travel?.zone || "Singapore")}</span>
              <span class="expand-hint" aria-hidden="true">▾</span>
            </div>
          </div>
          <div class="card-body">
            <h3 class="card-title">${escapeHtml(a.title)}</h3>
            <p class="card-desc">${desc}</p>
            <div class="quick-facts">${facts.join("")}</div>
            <div class="card-details" ${isOpen ? "" : "inert"}>
              <div class="card-details-inner">
                ${details.join("")}
              </div>
            </div>
            <div class="card-footer">
              <span class="tap-hint">${isOpen ? "Tap to collapse" : "Tap for details"}</span>
              ${source}
            </div>
          </div>
        </div>
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

    // Logo → back to cinematic explore home
    els.homeBtn?.addEventListener("click", () => {
      showIntro();
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
        .register("./sw.js?v=5")
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

  document.addEventListener("DOMContentLoaded", init);
})();
