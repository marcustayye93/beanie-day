/** Beanie Day — home postal gate + zone drive estimates (no analytics) */
(function () {
  "use strict";

  var STORAGE_KEY = "beanie-home-postal";
  var ZONES = ["N", "W", "E", "C", "S"];

  /** First-2-digit postal sector → N/W/E/C/S (bundled offline fallback). */
  var SECTOR_ZONE = {
    "01": "C", "02": "C", "03": "C", "04": "C", "05": "C", "06": "C",
    "07": "C", "08": "C",
    "09": "S", "10": "S",
    "11": "W", "12": "W", "13": "W",
    "14": "S", "15": "S", "16": "S",
    "17": "C", "18": "C", "19": "C", "20": "C", "21": "C",
    "22": "C", "23": "C", "24": "C", "25": "C", "26": "C", "27": "C",
    "28": "C", "29": "C", "30": "C", "31": "C", "32": "C", "33": "C",
    "34": "C", "35": "C", "36": "C", "37": "C",
    "38": "E", "39": "E", "40": "E", "41": "E",
    "42": "E", "43": "E", "44": "E", "45": "E",
    "46": "E", "47": "E", "48": "E",
    "49": "E", "50": "E", "51": "E", "52": "E",
    "53": "E", "54": "E", "55": "E",
    "56": "N", "57": "N",
    "58": "W", "59": "W",
    "60": "W", "61": "W", "62": "W", "63": "W", "64": "W",
    "65": "W", "66": "W", "67": "W", "68": "W",
    "69": "N", "70": "N", "71": "N",
    "72": "N", "73": "N",
    "75": "N", "76": "N",
    "77": "N", "78": "N",
    "79": "N", "80": "N",
    "81": "E", "82": "E"
  };

  /** Adjacent zones for drive matrix (same → 10–20; adjacent → 25–40; far → 45–65). */
  var ADJACENT = {
    N: { W: 1, C: 1, E: 1 },
    W: { N: 1, C: 1, S: 1 },
    E: { N: 1, C: 1, S: 1 },
    C: { N: 1, W: 1, E: 1, S: 1 },
    S: { W: 1, C: 1, E: 1 }
  };

  var ZONE_LABEL = { N: "North", W: "West", E: "East", C: "Central", S: "South" };

  var pendingRequired = false;
  var lastResolved = null;
  var els = {};

  function normZone(z) {
    if (!z) return null;
    var s = String(z).trim();
    if (/^[NWECS]$/i.test(s)) return s.toUpperCase();
    var map = {
      north: "N",
      west: "W",
      east: "E",
      central: "C",
      south: "S",
      n: "N",
      w: "W",
      e: "E",
      c: "C",
      s: "S"
    };
    return map[s.toLowerCase()] || null;
  }

  function sectorFromPostal(postal) {
    var p = String(postal || "").replace(/\D/g, "");
    if (p.length < 2) return null;
    return p.slice(0, 2);
  }

  function zoneFromSector(postal) {
    var sector = sectorFromPostal(postal);
    if (!sector) return null;
    return SECTOR_ZONE[sector] || null;
  }

  /** Rough lat/lng → zone when OneMap returns geometry (Singapore bbox).
      Thresholds mirror scripts/zones.py — keep them in sync. */
  function zoneFromLatLng(lat, lng) {
    var la = Number(lat);
    var ln = Number(lng);
    if (!isFinite(la) || !isFinite(ln)) return null;
    if (la < 1.15 || la > 1.48 || ln < 103.6 || ln > 104.1) return null;
    if (la >= 1.405) return "N";
    if (la <= 1.275) return "S";
    if (ln >= 103.88) return "E";
    if (ln <= 103.745) return "W";
    return "C";
  }

  function estimateDrive(homeZone, destZone) {
    var h = normZone(homeZone);
    var d = normZone(destZone);
    if (!h || !d) return null;
    var low;
    var high;
    if (h === d) {
      low = 10;
      high = 20;
    } else if (ADJACENT[h] && ADJACENT[h][d]) {
      low = 25;
      high = 40;
    } else {
      low = 45;
      high = 65;
    }
    return {
      low: low,
      high: high,
      label: "~" + low + "–" + high + " min drive",
      fromHomeLabel: "~" + low + "–" + high + " min · from home"
    };
  }

  function formatDriveChip(destZone) {
    var dest = normZone(destZone);
    if (!dest) return null;
    var home = getHome();
    if (!home || !home.zone) return null;
    var est = estimateDrive(home.zone, dest);
    if (!est) return null;
    return est.label;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var toRad = function (d) {
      return (d * Math.PI) / 180;
    };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /**
   * Live per-user distance (km) from the saved home postal to an activity.
   * Uses activity.travel.lat/lng stamped by scripts/friday-ingest.py geocode.
   * Returns null when the user skipped postal entry (zone-only path) or the
   * activity has no coordinates. This is the source of truth for the public
   * app — the baked travel.distanceKm in week.json is only a curator reference.
   */
  function distanceKmTo(activity) {
    var home = getHome();
    if (!home || home.lat == null || home.lng == null) return null;
    var hLat = Number(home.lat);
    var hLng = Number(home.lng);
    if (!isFinite(hLat) || !isFinite(hLng)) return null;
    var t = activity && activity.travel;
    if (!t) return null;
    var aLat = Number(t.lat);
    var aLng = Number(t.lng);
    if (!isFinite(aLat) || !isFinite(aLng)) return null;
    return haversineKm(hLat, hLng, aLat, aLng);
  }

  function getHome() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data) return null;
      // Neutral skip: no postal, no zone — distances/drive chips stay hidden.
      if (data.skipped) {
        return {
          postal: "",
          zone: null,
          skipped: true,
          lat: null,
          lng: null,
          updatedAt: data.updatedAt || null
        };
      }
      var zone = normZone(data.zone);
      if (!zone) return null;
      var postal = data.postal != null ? String(data.postal).replace(/\D/g, "") : "";
      if (postal && !isValidPostal(postal)) return null;
      return {
        postal: postal || "",
        zone: zone,
        zoneOnly: false,
        lat: data.lat != null ? Number(data.lat) : null,
        lng: data.lng != null ? Number(data.lng) : null,
        updatedAt: data.updatedAt || null
      };
    } catch (_) {
      return null;
    }
  }

  function saveHome(record) {
    // Neutral skip — persists the choice so we don't nag on every visit.
    if (record && record.skipped) {
      var payload = {
        skipped: true,
        postal: "",
        zone: null,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      lastResolved = payload;
      window.dispatchEvent(
        new CustomEvent("beanie:home-postal-changed", { detail: payload })
      );
      return payload;
    }
    var zone = normZone(record.zone);
    if (!zone) throw new Error("Missing zone");
    var postal = record.postal != null ? String(record.postal).replace(/\D/g, "") : "";
    var payload = {
      postal: postal,
      zone: zone,
      updatedAt: new Date().toISOString()
    };
    if (record.lat != null && isFinite(Number(record.lat))) payload.lat = Number(record.lat);
    if (record.lng != null && isFinite(Number(record.lng))) payload.lng = Number(record.lng);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    lastResolved = payload;
    window.dispatchEvent(
      new CustomEvent("beanie:home-postal-changed", { detail: payload })
    );
    return payload;
  }

  function isValidPostal(value) {
    return /^\d{6}$/.test(String(value || "").trim());
  }

  function setError(msg) {
    if (!els.error) return;
    if (!msg) {
      els.error.hidden = true;
      els.error.textContent = "";
      return;
    }
    els.error.hidden = false;
    els.error.textContent = msg;
  }

  function setHint(msg) {
    if (!els.hint) return;
    els.hint.textContent = msg || "";
  }

  function cacheEls() {
    els.modal = document.getElementById("home-postal-modal");
    els.backdrop = document.getElementById("home-postal-backdrop");
    els.input = document.getElementById("home-postal-input");
    els.error = document.getElementById("home-postal-error");
    els.hint = document.getElementById("home-postal-hint");
    els.saveBtn = document.getElementById("home-postal-save");
    els.skipBtn = document.getElementById("home-postal-skip");
  }

  function openModal(opts) {
    cacheEls();
    if (!els.modal) return;
    pendingRequired = !!(opts && opts.required);
    els.modal.hidden = false;
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("home-postal-open");
    if (pendingRequired) document.body.classList.add("postal-pending");
    var home = getHome();
    if (els.input) {
      var prefill = (opts && opts.postal) || (home && home.postal) || "";
      els.input.value = prefill;
    }
    setError("");
    if (home && home.zone) {
      if (home.postal) {
        setHint("Saved: " + home.postal + " · " + (ZONE_LABEL[home.zone] || home.zone));
      } else {
        setHint("Saved: " + (ZONE_LABEL[home.zone] || home.zone) + " Singapore · drive times on");
      }
      lastResolved = home;
    } else {
      setHint("Enter your 6-digit Singapore postal code.");
      lastResolved = null;
    }
    requestAnimationFrame(function () {
      els.input && els.input.focus();
    });
  }

  function closeModal() {
    cacheEls();
    if (pendingRequired && !getHome()) return false;
    if (els.modal) {
      els.modal.hidden = true;
      els.modal.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("home-postal-open");
    document.body.classList.remove("postal-pending");
    pendingRequired = false;
    return true;
  }

  async function fetchOneMap(postal) {
    var url =
      "https://www.onemap.gov.sg/api/common/elastic/search?searchVal=" +
      encodeURIComponent(postal) +
      "&returnGeom=Y&getAddrDetails=Y&pageNum=1";
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var t = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, 6000);
    try {
      var res = await fetch(url, {
        method: "GET",
        signal: ctrl ? ctrl.signal : undefined,
        headers: { Accept: "application/json" }
      });
      if (!res.ok) throw new Error("OneMap HTTP " + res.status);
      var data = await res.json();
      var row = data && data.results && data.results[0];
      if (!row) throw new Error("No OneMap result");
      var lat = row.LATITUDE != null ? Number(row.LATITUDE) : null;
      var lng = row.LONGITUDE != null ? Number(row.LONGITUDE) : null;
      var zone = zoneFromLatLng(lat, lng) || zoneFromSector(postal);
      return {
        postal: postal,
        zone: zone,
        lat: isFinite(lat) ? lat : null,
        lng: isFinite(lng) ? lng : null,
        source: "onemap"
      };
    } finally {
      clearTimeout(t);
    }
  }

  function resolveOffline(postal) {
    var zone = zoneFromSector(postal);
    if (!zone) return null;
    return {
      postal: postal,
      zone: zone,
      lat: null,
      lng: null,
      source: "sector"
    };
  }

  async function resolvePostal(postal) {
    var p = String(postal || "").replace(/\D/g, "");
    if (!isValidPostal(p)) {
      throw new Error("Enter a valid 6-digit Singapore postal code.");
    }
    try {
      var online = await fetchOneMap(p);
      if (online && online.zone) return online;
    } catch (_) {
      /* CORS / offline / fail → sector table */
    }
    var offline = resolveOffline(p);
    if (!offline) {
      throw new Error("Couldn’t map that postal. Try another code.");
    }
    return offline;
  }

  /** Validate + resolve the typed postal (internal — Save calls this). */
  async function validateInput() {
    cacheEls();
    setError("");
    var postal = els.input ? els.input.value.trim() : "";
    if (!isValidPostal(postal)) {
      setError("Enter a valid 6-digit Singapore postal code.");
      lastResolved = null;
      return null;
    }
    try {
      var resolved = await resolvePostal(postal);
      lastResolved = resolved;
      return resolved;
    } catch (err) {
      lastResolved = null;
      setError((err && err.message) || "Couldn’t validate that postal.");
      return null;
    }
  }

  async function onSave() {
    cacheEls();
    setError("");
    var postal = els.input ? els.input.value.trim() : "";
    var resolved = lastResolved;
    if (!resolved || String(resolved.postal) !== postal) {
      resolved = await validateInput();
    }
    if (!resolved) return;
    saveHome(resolved);
    closeModal();
  }

  /** Neutral skip — no postal, no zone; distances stay hidden until set. */
  function onSkip() {
    cacheEls();
    setError("");
    saveHome({ skipped: true });
    lastResolved = null;
    closeModal();
  }

  function bindModal() {
    cacheEls();
    if (!els.modal || els.modal.dataset.bound === "1") return;
    els.modal.dataset.bound = "1";

    els.saveBtn && els.saveBtn.addEventListener("click", function () {
      onSave();
    });
    els.skipBtn && els.skipBtn.addEventListener("click", function () {
      onSkip();
    });
    els.input &&
      els.input.addEventListener("input", function () {
        setError("");
        lastResolved = null;
      });
    els.input &&
      els.input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          onSave();
        }
      });

    els.backdrop &&
      els.backdrop.addEventListener("click", function () {
        if (pendingRequired && !getHome()) {
          setError("Save a postal or skip for now.");
          return;
        }
        closeModal();
      });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!document.body.classList.contains("home-postal-open")) return;
      if (pendingRequired && !getHome()) {
        e.preventDefault();
        e.stopPropagation();
        setError("Save a postal or skip for now.");
        return;
      }
      closeModal();
    });
  }

  function boot() {
    bindModal();
    var home = getHome();
    if (!home) {
      document.body.classList.add("postal-pending");
      openModal({ required: true });
    }
  }

  window.BeanieHomePostal = {
    STORAGE_KEY: STORAGE_KEY,
    getHome: getHome,
    saveHome: saveHome,
    estimateDrive: estimateDrive,
    formatDriveChip: formatDriveChip,
    resolvePostal: resolvePostal,
    distanceKmTo: distanceKmTo,
    zoneFromSector: zoneFromSector,
    openModal: openModal,
    closeModal: closeModal,
    ZONE_LABEL: ZONE_LABEL
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
