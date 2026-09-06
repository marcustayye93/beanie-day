/** Beanie Day — Friday zone-pass banner (post-bake hook) */
(function () {
  "use strict";
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function renderZonePass(data) {
    var wrap = document.getElementById("zone-pass");
    var chips = document.getElementById("zone-pass-chips");
    var copy = document.getElementById("zone-pass-copy");
    if (!wrap || !chips || !copy) return;
    var zp = data && data.meta && data.meta.zonePass;
    if (!zp || !zp.zones) {
      wrap.hidden = true;
      return;
    }
    var order = ["Central", "East", "West", "North", "South"];
    var allFilled = true;
    chips.innerHTML = order
      .map(function (z) {
        var info = zp.zones[z] || {};
        var status = info.status || "empty";
        var filled = status === "filled";
        if (!filled) allFilled = false;
        var mark = filled ? "✓" : status === "skipped" ? "·" : "—";
        var cls = filled ? "is-filled" : status === "skipped" ? "is-skipped" : "is-empty";
        return '<span class="zone-chip ' + cls + '" role="listitem">' + escapeHtml(z) + " " + mark + "</span>";
      })
      .join("");
    wrap.hidden = false;
    if (zp.summary) wrap.setAttribute("data-summary", zp.summary);
    copy.textContent = allFilled
      ? "Island-wide zone pass complete for this week."
      : "Some areas of Singapore still need this week’s scout — empty is honest.";
  }
  var origFetch = window.fetch;
  if (origFetch && !window.__beanieZonePassHook) {
    window.__beanieZonePassHook = true;
    window.fetch = function () {
      var args = arguments;
      return origFetch.apply(this, args).then(function (res) {
        try {
          var url = String(args[0] && args[0].url ? args[0].url : args[0] || "");
          if (url.indexOf("week.json") !== -1 && res && res.ok) {
            res
              .clone()
              .json()
              .then(function (data) {
                renderZonePass(data);
              })
              .catch(function () {});
          }
        } catch (_) {}
        return res;
      });
    };
  }
  setTimeout(function () {
    try {
      var cached = localStorage.getItem("beanie-day-week-cache-v3");
      if (cached) renderZonePass(JSON.parse(cached));
    } catch (_) {}
  }, 800);
})();
