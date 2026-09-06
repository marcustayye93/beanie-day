(function () {
  "use strict";
  const parts = ["js/app.p0.js"];
  for (let i = 0; i < 4; i++) parts.push("js/app.p1." + i + ".js");
  for (let i = 0; i < 4; i++) parts.push("js/app.p2." + i + ".js");
  Promise.all(
    parts.map((url) =>
      fetch("./" + url + "?v=8", { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(url);
        return r.text();
      })
    )
  )
    .then((texts) => {
      (0, eval)(texts.join(""));
    })
    .catch((err) => console.error(err));
})();
