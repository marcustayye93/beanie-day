/** Beanie Day — assemble app from static text parts */
(function () {
  "use strict";
  function get(url) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 300) return xhr.responseText;
    throw new Error("load fail " + url + " " + xhr.status);
  }
  try {
    var base = (document.currentScript && document.currentScript.src)
      ? document.currentScript.src.replace(/[^/]+$/, "")
      : "js/";
    var parts = JSON.parse(get(base + "app.parts/manifest.json"));
    var code = "";
    for (var i = 0; i < parts.length; i++) {
      code += get(base + "app.parts/" + parts[i]);
    }
    (0, eval)(code);
  } catch (e) {
    console.error("[beanie] assemble failed", e);
  }
})();
