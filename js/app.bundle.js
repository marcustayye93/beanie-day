/** Assemble Beanie Day app from part files (static GH Pages) */
(function () {
  "use strict";
  var parts = ["js/app.part1.js.txt", "js/app.part2.js.txt", "js/app.part3.js.txt"];
  Promise.all(
    parts.map(function (u) {
      return fetch(u, { cache: "no-cache" }).then(function (r) {
        if (!r.ok) throw new Error("missing " + u);
        return r.text();
      });
    })
  )
    .then(function (texts) {
      var code = texts.join("");
      var s = document.createElement("script");
      s.text = code;
      document.head.appendChild(s);
    })
    .catch(function (err) {
      console.error("Beanie Day assemble failed", err);
    });
})();
