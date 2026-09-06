(function () {
  "use strict";
  const CHUNKS = 4;
  Promise.all(
    Array.from({ length: CHUNKS }, (_, i) =>
      fetch("./js/app.chunk" + i + ".b64?v=7", { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error("chunk " + i);
        return r.text();
      })
    )
  )
    .then((parts) => {
      const src = atob(parts.join("").replace(/\s+/g, ""));
      (0, eval)(src);
    })
    .catch((err) => {
      console.error(err);
      const el = document.getElementById("card-list");
      if (el) {
        el.innerHTML =
          '<div class="empty-state"><p class="empty-title">Couldn’t load app</p><p class="empty-copy">Hard-refresh and try again.</p></div>';
      }
    });
})();
