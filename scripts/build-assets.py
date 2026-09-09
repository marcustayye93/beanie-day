#!/usr/bin/env python3
"""Beanie Day asset bundling.

Concatenates the split sources into the single files index.html loads:
  js/app.part{0,1,2}.js  ->  js/app.js      (one IIFE scope; keep part order)
  css/{styles,polish,intro-touch,night-out,home-postal}.css -> css/app.css
  (same order as the old <link> tags, so the cascade is unchanged)

Workflow: edit the part/source files, run this script, then bump the ?v=
query in index.html (js/app.js and css/app.css) so clients fetch the new bundle.

The old runtime fetch+eval loader is gone on purpose: plain <script defer>
gives the browser real caching, parallel download and bytecode caching,
and removes a serial network round-trip from the boot path.
"""
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

JS_PARTS = ["js/app.part0.js", "js/app.part1.js", "js/app.part2.js"]
JS_OUT = "js/app.js"

CSS_PARTS = [
    "css/styles.css",
    "css/polish.css",
    "css/intro-touch.css",
    "css/night-out.css",
    "css/home-postal.css",
]
CSS_OUT = "css/app.css"


def bundle(parts, out):
    chunks = []
    for p in parts:
        with open(os.path.join(REPO, p), encoding="utf-8") as f:
            chunks.append(f.read())
    # NOTE: the JS parts are one file split arbitrarily (a single IIFE spans
    # all three), so join exactly like the old loader did: no separator.
    sep = "" if out.endswith(".js") else "\n"
    with open(os.path.join(REPO, out), "w", encoding="utf-8") as f:
        f.write(sep.join(chunks))
    size = os.path.getsize(os.path.join(REPO, out))
    print(f"wrote {out} ({size} bytes from {len(parts)} parts)")


def main():
    bundle(JS_PARTS, JS_OUT)
    bundle(CSS_PARTS, CSS_OUT)
    print("done — remember to bump ?v= for js/app.js and css/app.css in index.html")


if __name__ == "__main__":
    main()
