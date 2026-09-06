/** Beanie Day — apply small patches onto main app.js at runtime */
(function () {
  "use strict";
  function dec(b64) {
    try {
      return decodeURIComponent(
        Array.prototype.map
          .call(atob(b64), function (c) {
            return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
          })
          .join("")
      );
    } catch (e) {
      return atob(b64);
    }
  }
  var BASE =
    "https://raw.githubusercontent.com/marcustayye93/beanie-day/main/js/app.js";
  fetch("js/patches/manifest.json", { cache: "no-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("manifest failed");
      return r.json();
    })
    .then(function (files) {
      return Promise.all([
        fetch(BASE, { cache: "no-cache" }).then(function (r) {
          if (!r.ok) throw new Error("base app fetch failed");
          return r.text();
        }),
        Promise.all(
          files.map(function (u) {
            return fetch(u, { cache: "no-cache" }).then(function (r) {
              if (!r.ok) throw new Error("patch failed " + u);
              return r.json();
            });
          })
        ),
      ]);
    })
    .then(function (pair) {
      var code = pair[0];
      var patches = pair[1] || [];
      for (var i = 0; i < patches.length; i++) {
        var p = patches[i];
        if (!p) continue;
        var oldS = p.old_b64 ? dec(p.old_b64) : p.old;
        var newS = p.new_b64 ? dec(p.new_b64) : p.new;
        if (!oldS) continue;
        if (code.indexOf(oldS) === -1) {
          console.warn("Beanie patch miss:", p.name || i);
          continue;
        }
        code = code.replace(oldS, newS);
      }
      var s = document.createElement("script");
      s.text = code;
      document.head.appendChild(s);
    })
    .catch(function (err) {
      console.error("Beanie Day patch boot failed", err);
    });
})();
