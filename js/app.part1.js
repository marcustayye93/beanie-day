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
      state.parks = await loadParks();
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
            state.parks = await loadParks();
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
    els.cardList.innerHTML = items.map((a, i) => cardHtml(a, i)).join("");
  }

  /** Adapt a park record to the card shape activities use. */
  function parkToCard(p) {
    const t = p.travel || {};
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
      travel: { lat: t.lat, lng: t.lng, zone: t.zone, region: t.region },
      source: p.url ? { label: "NParks", url: p.url } : null,
    };
  }

  function getFilteredActivities() {
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

  function cardHtml(a, index) {
    const v = visualFor(a.id, a.tabs);
    const isOpen = state.openCardId === a.id;
    const fresh = isFresh(a);
    const venue = venueName(a);
    const classes = ["card"];
    if (isOpen) classes.push("is-open");
    if (a.highlight) classes.push("highlight");
    if (a.nearHomeBonus) classes.push("near-home");
    if (fresh) classes.push("is-fresh");

    const badges = [];
    if (fresh) badges.push(`<span class="badge fresh">🆕 This week</span>`);
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
