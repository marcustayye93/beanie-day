/* Causeway jam forecast — reads data/causeway-history.json produced by
 * scripts/causeway-collect.py (camera-derived jam index, 15-min samples) and
 * renders: live jam index per crossing, a usual-jam heatmap (day x hour),
 * and a leave-later optimizer with rough crossing-time estimates.
 * v2: samples also carry approach_min (LTA EstTravelTimes minutes on the
 * BKE/AYE approach to each checkpoint), shown per crossing card. */
(function () {
  "use strict";

  var HIST_URL = "data/causeway-history.json";
  var CROSSINGS = {
    woodlands: { name: "Woodlands Causeway", cams: ["2701", "2702", "2704"],
                 approachLabel: "BKE to Woodlands Centre" },
    tuas: { name: "Tuas Second Link", cams: ["4703", "4712", "4713"],
            approachLabel: "AYE to Tuas Checkpoint" },
  };
  var DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var active = "woodlands";

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Crossing index = worst camera on that crossing (the bottleneck defines it).
  function crossingIndex(sample, xing) {
    var cams = (sample && sample.cams) || {};
    var ids = CROSSINGS[xing].cams;
    var best = null;
    ids.forEach(function (id) {
      if (cams[id] && typeof cams[id].index === "number") {
        best = best === null ? cams[id].index : Math.max(best, cams[id].index);
      }
    });
    return best;
  }

  function statusFor(idx) {
    if (idx === null) return { word: "No data", cls: "fc-na" };
    if (idx < 25) return { word: "Clear", cls: "fc-0" };
    if (idx < 50) return { word: "Moderate", cls: "fc-1" };
    if (idx < 75) return { word: "Heavy", cls: "fc-2" };
    return { word: "Severe", cls: "fc-3" };
  }

  // Rough crossing-time estimate, calibrated loosely against publicly reported
  // ranges (good ~15-20 min, worst ~105-160 min). Labelled "rough est." in UI.
  function estMin(idx) {
    if (idx === null) return null;
    return Math.round(12 + idx * 1.35);
  }

  function avgFor(samples, xing, dow, hour, minN) {
    var sum = 0, n = 0;
    samples.forEach(function (s) {
      if ((dow === null || s.dow === dow) && (hour === null || s.hour === hour)) {
        var v = crossingIndex(s, xing);
        if (v !== null) { sum += v; n++; }
      }
    });
    return n >= (minN || 1) ? { avg: sum / n, n: n } : null;
  }

  function agoText(iso) {
    if (!iso) return "";
    var mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    var h = Math.floor(mins / 60);
    return h + "h " + (mins % 60) + "m ago";
  }

  function heatClass(idx) {
    if (idx === null) return "hm-na";
    if (idx < 20) return "hm-0";
    if (idx < 40) return "hm-1";
    if (idx < 60) return "hm-2";
    if (idx < 80) return "hm-3";
    return "hm-4";
  }

  function renderCards(samples, latest) {
    var host = $("cw-fc-cards");
    var html = Object.keys(CROSSINGS).map(function (key) {
      var idx = crossingIndex(latest, key);
      var st = statusFor(idx);
      var usual = avgFor(samples, key, latest.dow, latest.hour, 3);
      var cmp = "";
      if (idx !== null && usual) {
        var d = Math.round(idx - usual.avg);
        cmp = d >= 8 ? "busier than usual"
          : d <= -8 ? "quieter than usual"
          : "about usual";
        cmp = " · usual " + DOW[latest.dow] + " " + latest.hour + ":00 is " +
              Math.round(usual.avg) + " — " + cmp;
      }
      // v2: live expressway approach time from LTA EstTravelTimes.
      var appr = latest.approach_min && latest.approach_min[key];
      var apprLine = (typeof appr === "number")
        ? '<div class="fc-approach">🛣️ Expressway approach: ~' + appr +
          " min (" + esc(CROSSINGS[key].approachLabel) + ")</div>"
        : "";
      return (
        '<article class="fc-card">' +
          '<div class="fc-name">' + esc(CROSSINGS[key].name) + "</div>" +
          '<div class="fc-row">' +
            '<span class="fc-num">' + (idx === null ? "–" : idx) + "</span>" +
            '<span class="fc-chip ' + st.cls + '">' + esc(st.word) + "</span>" +
          "</div>" +
          '<div class="fc-sub">jam index · updated ' + esc(agoText(latest.t)) + esc(cmp) + "</div>" +
          apprLine +
        "</article>"
      );
    }).join("");
    host.innerHTML = html;

    // Best-crossing callout.
    var w = crossingIndex(latest, "woodlands");
    var t = crossingIndex(latest, "tuas");
    var best = $("cw-fc-best");
    if (w === null || t === null) { best.innerHTML = ""; return; }
    var diff = w - t;
    if (diff >= 8) {
      best.innerHTML = "🟢 <strong>Tuas Second Link</strong> is clearer right now — " +
        "rough est. <strong>" + (estMin(w) - estMin(t)) + " min</strong> quicker.";
    } else if (diff <= -8) {
      best.innerHTML = "🟢 <strong>Woodlands Causeway</strong> is clearer right now — " +
        "rough est. <strong>" + (estMin(t) - estMin(w)) + " min</strong> quicker.";
    } else {
      best.innerHTML = "Both crossings look similar right now.";
    }
  }

  function renderHeatmap(samples) {
    var host = $("cw-heatmap");
    var html = '<div class="hm-grid" role="img" aria-label="Usual jam index by day and hour">';
    html += '<div class="hm-corner"></div>';
    for (var h = 0; h < 24; h++) {
      html += '<div class="hm-h">' + (h % 3 === 0 ? h : "") + "</div>";
    }
    for (var d = 0; d < 7; d++) {
      html += '<div class="hm-d">' + DOW[d] + "</div>";
      for (h = 0; h < 24; h++) {
        var cell = avgFor(samples, active, d, h, 3);
        var v = cell ? Math.round(cell.avg) : null;
        html += '<div class="hm-cell ' + heatClass(v) + '"' +
          (v === null ? "" : ' title="' + DOW[d] + " " + h + ":00 — avg index " + v +
            " (" + cell.n + " samples)\"") + "></div>";
      }
    }
    html += "</div>";
    html += '<div class="hm-legend"><span class="hm-cell hm-0"></span> clear ' +
      '<span class="hm-cell hm-4"></span> severe ' +
      '<span class="hm-cell hm-na"></span> not enough data</div>';
    host.innerHTML = html;
  }

  function renderLeave(samples, latest) {
    var host = $("cw-leave");
    var html = "";
    [0, 1, 2, 3].forEach(function (plus) {
      var hour = (latest.hour + plus) % 24;
      var dow = plus === 0 ? latest.dow : (latest.dow + Math.floor((latest.hour + plus) / 24)) % 7;
      var cell = avgFor(samples, active, dow, hour, 3) ||
                 avgFor(samples, active, null, hour, 5) ||
                 avgFor(samples, active, null, null, 5);
      var idx = plus === 0 ? crossingIndex(latest, active) : (cell ? cell.avg : null);
      var mins = estMin(idx === null ? null : Math.round(idx));
      var label = plus === 0 ? "Now" : "+" + plus + "h";
      var sub = plus === 0 ? "live index" : DOW[dow] + " " + hour + ":00 usual";
      html +=
        '<div class="lv-card' + (plus === 0 ? " is-now" : "") + '">' +
          '<div class="lv-when">' + label + "</div>" +
          '<div class="lv-mins">' + (mins === null ? "–" : "~" + mins + "<small> min</small>") + "</div>" +
          '<div class="lv-sub">' + esc(sub) + "</div>" +
          '<div class="lv-bar"><i style="width:' +
            (idx === null ? 0 : Math.min(100, Math.round(idx))) + '%"></i></div>' +
        "</div>";
    });
    host.innerHTML = '<div class="lv-grid">' + html + "</div>" +
      '<p class="cw-note">Rough estimates from camera-observed jam patterns. ' +
      "Leaving later helps when the bar drops.</p>";
  }

  function renderTabs() {
    var host = $("cw-fc-tabs");
    host.innerHTML = Object.keys(CROSSINGS).map(function (key) {
      return '<button type="button" class="' + (key === active ? "is-on" : "") + '"' +
        ' data-xing="' + key + '">' + esc(CROSSINGS[key].name.split(" ")[0]) + "</button>";
    }).join("");
    host.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        active = btn.getAttribute("data-xing");
        renderTabs();
        if (window.__fcSamples) {
          renderHeatmap(window.__fcSamples);
          renderLeave(window.__fcSamples, window.__fcLatest);
        }
      });
    });
  }

  function renderAll(data) {
    var samples = (data && data.samples) || [];
    window.__fcSamples = samples;
    var status = $("cw-fc-status");
    if (!samples.length) {
      status.textContent = "Collecting camera observations — the forecast appears after the first day of data.";
      return;
    }
    var latest = samples[samples.length - 1];
    window.__fcLatest = latest;
    var calibrating = samples.length < 48;
    status.innerHTML = "Live jam index from checkpoint cameras · " +
      esc(samples.length) + " observations" +
      (calibrating ? ' · <span class="fc-cal">calibrating — accuracy improves over the first few days</span>' : "");
    renderCards(samples, latest);
    renderTabs();
    renderHeatmap(samples);
    renderLeave(samples, latest);
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!$("cw-fc")) return; // forecast section not on this page
    fetch(HIST_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(renderAll)
      .catch(function () {
        $("cw-fc-status").textContent =
          "Jam index unavailable right now — observations are still being collected.";
      });
  });
})();
