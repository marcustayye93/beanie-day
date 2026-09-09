/** Beanie Day — same-origin bake loader (no raw.githubusercontent.com) */
(function () {
  "use strict";
  var parts = ["js/app.part0.js?v=24", "js/app.part1.js?v=24", "js/app.part2.js?v=24"];
  Promise.all(
    parts.map(function (u) {
      return fetch(u, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("missing " + u);
        return r.text();
      });
    })
  )
    .then(function (texts) {
      var s = document.createElement("script");
      s.text = texts.join("");
      document.head.appendChild(s);
    })
    .catch(function (err) {
      console.error("Beanie Day bake load failed", err);
      var list = document.getElementById("card-list");
      if (list && !list.querySelector(".card")) {
        list.innerHTML =
          '<div class="empty-state" style="padding:24px">' +
          '<p class="empty-title">Could not load app shell</p>' +
          '<p class="empty-copy">Hard-refresh and try again.</p></div>';
      }
    });
})();
