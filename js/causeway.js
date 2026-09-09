/* Causeway traffic — live LTA checkpoint cameras via the keyless data.gov.sg feed.
 * Camera directions were verified against the actual snapshots (2026-09-09):
 * every view faces the departure queue towards Johor; 4712 also shows the
 * arrival carriageway back towards the city. */
(function () {
  "use strict";

  var API = "https://api.data.gov.sg/v1/transport/traffic-images";
  var REFRESH_MS = 3 * 60 * 1000;

  // id, crossing group, human label, direction chip
  var CAMERAS = [
    { id: "2701", at: "woodlands", label: "Causeway — towards Johor", dir: "→ Johor", both: false },
    { id: "2702", at: "woodlands", label: "Causeway viaduct — towards Johor", dir: "→ Johor", both: false },
    { id: "2704", at: "woodlands", label: "BKE — towards Woodlands Checkpoint", dir: "→ Johor", both: false },
    { id: "4703", at: "tuas", label: "Second Link bridge — towards Johor", dir: "→ Johor", both: false },
    { id: "4712", at: "tuas", label: "AYE — Tuas Checkpoint", dir: "⇄ Both ways", both: true },
    { id: "4713", at: "tuas", label: "Checkpoint approach — towards Johor", dir: "→ Johor", both: false },
  ];

  var els = {};
  var timer = null;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function agoText(ts) {
    if (!ts) return "";
    var mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    return mins + " min ago";
  }

  function setStatus(ok, text) {
    var st = els.status;
    st.className = "cw-status" + (ok ? "" : " is-error");
    st.innerHTML = '<span class="dot" aria-hidden="true"></span>' + esc(text);
  }

  function cardHtml(cam, snap) {
    var img = snap
      ? '<img src="' + esc(snap.image) + '" alt="' + esc(cam.label) + '" loading="lazy" decoding="async" ' +
        'onload="this.closest(\'.cw-card\').classList.add(\'is-fresh\')" ' +
        'onerror="this.closest(\'.cw-card\').classList.remove(\'is-fresh\')" />'
      : "";
    return (
      '<article class="cw-card" data-cam="' + esc(cam.id) + '">' +
        img +
        '<div class="cw-meta">' +
          '<span class="cw-dir' + (cam.both ? " both" : "") + '">' + esc(cam.dir) + "</span>" +
          '<span class="label">' + esc(cam.label) + "</span>" +
          '<span class="ago">' + esc(agoText(snap && snap.timestamp)) + "</span>" +
        "</div>" +
      "</article>"
    );
  }

  function render(snaps) {
    ["woodlands", "tuas"].forEach(function (at) {
      var host = els[at];
      host.innerHTML = CAMERAS.filter(function (c) { return c.at === at; })
        .map(function (c) { return cardHtml(c, snaps[c.id]); })
        .join("");
    });
  }

  function renderError(msg) {
    var html =
      '<div class="cw-error"><p>' + esc(msg) + "</p>" +
      '<button type="button" id="cw-retry">Try again</button></div>';
    els.woodlands.innerHTML = html;
    els.tuas.innerHTML = "";
    var btn = $("cw-retry");
    if (btn) btn.addEventListener("click", refresh);
  }

  function refresh() {
    setStatus(true, "Updating…");
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 15000);
    fetch(API, { signal: ctrl.signal })
      .then(function (res) {
        clearTimeout(to);
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var cams = ((data.items || [])[0] || {}).cameras || [];
        var snaps = {};
        cams.forEach(function (c) { snaps[c.camera_id] = c; });
        render(snaps);
        var newest = cams
          .map(function (c) { return new Date(c.timestamp).getTime(); })
          .filter(isFinite);
        var when = newest.length
          ? new Date(Math.max.apply(null, newest)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "";
        setStatus(true, "Live · snapshots " + when + " · auto-refreshes every 3 min");
      })
      .catch(function (err) {
        clearTimeout(to);
        renderError(
          err && err.name === "AbortError"
            ? "The traffic feed timed out. Check your connection and try again."
            : "Couldn’t reach the traffic feed right now."
        );
        setStatus(false, "Feed unavailable — tap ↻ to retry");
      });
  }

  function schedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
  }

  document.addEventListener("DOMContentLoaded", function () {
    els.status = $("cw-status");
    els.woodlands = $("cw-woodlands");
    els.tuas = $("cw-tuas");
    $("cw-refresh").addEventListener("click", refresh);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });
    refresh();
    schedule();
  });
})();
