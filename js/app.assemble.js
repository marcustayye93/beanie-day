/** Beanie Day — assemble app from static parts */
(function () {
  "use strict";
  function dec(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof TextDecoder !== "undefined") return new TextDecoder("utf-8").decode(bytes);
    var s = "";
    for (var j = 0; j < bytes.length; j++) s += String.fromCharCode(bytes[j]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }
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
      code += dec(get(base + "app.parts/" + parts[i]).replace(/\s+/g, ""));
    }
    (0, eval)(code);
  } catch (e) {
    console.error("[beanie] assemble failed", e);
  }
})();
