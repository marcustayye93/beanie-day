
    const detailsId = `card-details-${escapeAttr(a.id)}`;
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
      : `<div class="card-hit" data-toggle="${escapeAttr(a.id)}" role="button" tabindex="0"
          aria-expanded="${isOpen}" aria-controls="${detailsId}"
          aria-label="${escapeAttr((isOpen ? "Collapse " : "Expand ") + a.title)}">`;
    const hitClose = href ? "</a>" : "</div>";

    return `
      <article class="${classes.join(" ")}" style="animation-delay:${Math.min(index, 12) * 45}ms; --card-grad:${v.grad}" data-id="${escapeAttr(a.id)}">
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
              <span class="tap-hint">${href ? "Tap for details ↗" : isOpen ? "Tap to collapse" : "Tap for details"}</span>
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
