#!/usr/bin/env python3
"""Causeway jam-index collector (Bean There prototype).

Every 15 minutes (via cron):
  1. Fetch the 6 LTA checkpoint camera snapshots (keyless data.gov.sg feed).
  2. Compute a per-camera congestion score: edge density inside the queue ROI.
     More vehicles queuing => more edges => higher raw score. Normalized
     0-100 as (raw - empty) / span, where empty is the rolling p5 (an empty
     road reads ~0 even past static booths/barriers) and span the rolling
     p99 range, with per-camera bootstraps until ~30 samples exist.
  3. Append a compact sample to data/causeway-history.json (30-day retention).

With --push: push data/causeway-history.json to GitHub main via the
git-database REST API (single-path push; Contents scope is enough, and it
can't collide with unrelated local/remote drift).

Method notes:
  - PIL + numpy only (no cv2 dependency).
  - ROI fractions were picked from night snapshots on 2026-09-12; the
    percentile self-calibration absorbs ROI imprecision over a few days.
  - v2 (2026-09-12): LTA DataMall EstTravelTimes (needs the free API key,
    stored as custom.lta-datamall) adds real expressway approach times:
    BKE dir=1 segments to Woodlands Centre, AYE dir=1 segments to Tuas
    Checkpoint. TrafficSpeedBands v4 was evaluated but rejected: ~40k
    segments with no working $filter/$top, too heavy for a 15-min cron.

Usage:
  python3 scripts/causeway-collect.py        # collect + append only
  python3 scripts/causeway-collect.py --push  # also push history file
"""
import base64
import datetime as dt
import json
import os
import sys
import urllib.request

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

WORK = "/home/hatch/workspace/beanie-day"
HISTORY = os.path.join(WORK, "data", "causeway-history.json")
UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 "
      "Mobile/15E148 Safari/604.1")
API = "https://api.data.gov.sg/v1/transport/traffic-images"
REPO = "marcustayye93/beanie-day"
GH_API = f"https://api.github.com/repos/{REPO}"
GH_HOSTS = ("api.github.com",)
HIST_PATH = "data/causeway-history.json"
RETENTION_DAYS = 30

# camera_id: (roi x0,y0,x1,y1 as fractions, empty_bootstrap, span_floor, crossing)
# empty_bootstrap = edge ratio of an empty road, measured 2026-09-12 ~02:30 SGT.
# span_floor = guess at (jam - empty) dynamic range; the rolling p99 takes over
# once >=30 samples exist. Index = (raw - empty) / span * 100, so an empty
# road reads ~0 even on cameras full of static infrastructure (booths etc).
CAMERAS = {
    "2701": ((0.42, 0.22, 1.00, 1.00), 0.061, 0.25, "woodlands"),
    "2702": ((0.52, 0.28, 1.00, 1.00), 0.021, 0.10, "woodlands"),
    "2704": ((0.28, 0.12, 0.98, 0.92), 0.100, 0.30, "woodlands"),
    "4703": ((0.15, 0.08, 1.00, 0.78), 0.229, 0.20, "tuas"),
    "4712": ((0.03, 0.00, 0.58, 0.78), 0.080, 0.20, "tuas"),
    "4713": ((0.52, 0.12, 1.00, 0.78), 0.021, 0.10, "tuas"),
}
EDGE_THRESHOLD = 28.0  # gradient magnitude on 0-255 grayscale

# ---- v2: LTA DataMall EstTravelTimes approach times ----
LTA_API = "https://datamall2.mytransport.sg/ltaodataservice/"
LTA_HOSTS = ("datamall2.mytransport.sg",)

# (Name, StartPoint, EndPoint, Direction) of the final expressway approach to
# each checkpoint. Direction "1" = toward the checkpoint on both:
#   AYE dir=1 runs ... -> TUAS WEST DRIVE -> TUAS CHECKPOINT (westbound)
#   BKE dir=1 runs ... -> WOODLANDS AVE 3 -> WOODLANDS CENTRE (northbound)
# EstTime is in minutes. Free-flow baselines measured 2026-09-12 ~02:45 SGT:
# woodlands = 2 min, tuas = 5 min.
APPROACH_SEGS = {
    "woodlands": [
        ("BKE", "BKE/SLE INTERCHANGE", "WOODLANDS AVE 3", "1"),
        ("BKE", "WOODLANDS AVE 3", "WOODLANDS CENTRE", "1"),
    ],
    "tuas": [
        ("AYE", "AYE/PIE INTERCHANGE", "TUAS WEST RD", "1"),
        ("AYE", "TUAS WEST RD", "TUAS WEST DRIVE", "1"),
        ("AYE", "TUAS WEST DRIVE", "TUAS CHECKPOINT", "1"),
    ],
}
APPROACH_LABEL = {
    "woodlands": "BKE to Woodlands Centre",
    "tuas": "AYE to Tuas Checkpoint",
}


def fetch_approach():
    """Sum EstTravelTimes minutes over each crossing's approach segments.

    Returns {"woodlands": mins|None, "tuas": mins|None}. Never raises: a
    failed fetch yields None values so camera collection still proceeds.
    """
    try:
        req = urllib.request.Request(
            LTA_API + "EstTravelTimes", headers={"Accept": "application/json"})
        add_surrogate_to_request(req, "custom.lta-datamall", allowed_hosts=LTA_HOSTS)
        data = read_json_response(urllib.request.urlopen(req, timeout=30))
    except Exception as e:  # noqa: BLE001 - approach feed is best-effort
        print(f"EstTravelTimes failed: {e}", file=sys.stderr)
        return {"woodlands": None, "tuas": None}
    recs = {(r["Name"], r["StartPoint"], r["EndPoint"], str(r["Direction"])): r["EstTime"]
            for r in data.get("value", [])}
    out = {}
    for xing, segs in APPROACH_SEGS.items():
        total, ok = 0, True
        for key in segs:
            if key in recs:
                total += recs[key]
            else:
                ok = False
                print(f"approach segment missing for {xing}: {key}", file=sys.stderr)
        out[xing] = total if ok else None
    return out


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else json.loads(data)


def analyze(path, roi):
    """Return (edge_ratio, mean_luma) for the ROI of a grayscale image."""
    from PIL import Image
    import numpy as np

    img = Image.open(path).convert("L")
    w, h = img.size
    x0, y0, x1, y1 = roi
    crop = img.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    nw = 480
    nh = max(1, int(crop.size[1] * nw / crop.size[0]))
    a = np.asarray(crop.resize((nw, nh), Image.BILINEAR), dtype=np.float32)
    dx = np.abs(a[:, 1:] - a[:, :-1])[:-1, :]
    dy = np.abs(a[1:, :] - a[:-1, :])[:, :-1]
    edge_ratio = float(((dx + dy) > EDGE_THRESHOLD).mean())
    return edge_ratio, float(a.mean())


def load_history():
    if os.path.exists(HISTORY):
        with open(HISTORY) as f:
            return json.load(f)
    return {"version": 1, "samples": []}


def percentile(sorted_vals, pct):
    if not sorted_vals:
        return 0.0
    k = (len(sorted_vals) - 1) * pct / 100.0
    lo, hi = int(k), min(int(k) + 1, len(sorted_vals) - 1)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def collect():
    feed = fetch(API)
    cams = {c["camera_id"]: c for c in feed["items"][0]["cameras"]}
    # 2701 may drop out of the feed (maintenance); use any available camera's
    # timestamp for the sample rather than failing the whole run.
    ref = cams.get("2701") or next(iter(cams.values()))
    ts = dt.datetime.fromisoformat(ref["timestamp"])

    results = {}
    for cid, (roi, _empty, _span, _xing) in CAMERAS.items():
        if cid not in cams:
            continue
        tmp = f"/tmp/causeway-{cid}.jpg"
        try:
            data = fetch(cams[cid]["image"], binary=True)
            with open(tmp, "wb") as f:
                f.write(data)
            raw, luma = analyze(tmp, roi)
        except Exception as e:  # noqa: BLE001 - one bad camera skips
            print(f"camera {cid} failed: {e}", file=sys.stderr)
            continue
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        results[cid] = {"raw": round(raw, 4), "luma": round(luma, 1)}

    if not results:
        print("no camera results; nothing appended", file=sys.stderr)
        sys.exit(1)

    hist = load_history()
    samples = hist.get("samples", [])

    # Per-camera calibration: empty = p5 of retained raws (bootstrap until
    # >=30 samples), span = max(p99 - empty, span_floor).
    cal = {}
    for cid, (_roi, empty_boot, span_floor, _xing) in CAMERAS.items():
        raws = sorted(s["cams"][cid]["raw"] for s in samples if cid in s.get("cams", {}))
        if len(raws) >= 30:
            empty = percentile(raws, 5)
            span = max(percentile(raws, 99) - empty, span_floor)
        else:
            empty, span = empty_boot, span_floor
        cal[cid] = (empty, span)

    cams_out = {}
    for cid, r in results.items():
        empty, span = cal[cid]
        idx = round((r["raw"] - empty) / span * 100) if span > 0 else 0
        idx = max(0, min(100, idx))
        cams_out[cid] = {"raw": r["raw"], "index": idx, "luma": r["luma"]}

    sample = {
        "t": ts.isoformat(),
        "dow": ts.weekday(),  # Monday=0
        "hour": ts.hour,
        "cams": cams_out,
        "approach_min": fetch_approach(),  # v2: LTA EstTravelTimes, best-effort
    }
    samples.append(sample)

    cutoff = (ts - dt.timedelta(days=RETENTION_DAYS)).isoformat()
    samples = [s for s in samples if s["t"] >= cutoff]
    hist["samples"] = samples
    hist["updated"] = ts.isoformat()

    os.makedirs(os.path.dirname(HISTORY), exist_ok=True)
    with open(HISTORY, "w") as f:
        json.dump(hist, f, separators=(",", ":"))
    print(f"appended {ts.isoformat()} ({len(results)} cams, {len(samples)} retained)")


# ---- single-file GitHub push (Contents scope is enough) ----

def gh(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(GH_API + path, data=data, method=method,
                                 headers={"Accept": "application/vnd.github+json"})
    add_surrogate_to_request(req, "custom.github", allowed_hosts=GH_HOSTS)
    return read_json_response(urllib.request.urlopen(req, timeout=60))


def push_history():
    with open(HISTORY, "rb") as f:
        content = f.read()

    for attempt in range(2):
        ref = gh("GET", "/git/refs/heads/main")
        sha = ref["object"]["sha"]
        commit = gh("GET", f"/git/commits/{sha}")
        tree_sha = commit["tree"]["sha"]
        tree = gh("GET", f"/git/trees/{tree_sha}?recursive=1")
        remote = {t["path"]: t["sha"] for t in tree["tree"] if t["type"] == "blob"}

        blob = gh("POST", "/git/blobs",
                  {"content": base64.b64encode(content).decode(), "encoding": "base64"})
        if remote.get(HIST_PATH) == blob["sha"]:
            print("history unchanged on remote; nothing to push")
            return

        new_tree = gh("POST", "/git/trees", {
            "base_tree": tree_sha,
            "tree": [{"path": HIST_PATH, "mode": "100644",
                      "type": "blob", "sha": blob["sha"]}],
        })
        new_commit = gh("POST", "/git/commits", {
            "message": "causeway: jam-index samples",
            "tree": new_tree["sha"],
            "parents": [sha],
        })
        try:
            gh("PATCH", "/git/refs/heads/main", {"sha": new_commit["sha"]})
        except Exception as e:  # noqa: BLE001 - ref moved; retry once
            print(f"ref update failed (attempt {attempt + 1}): {e}", file=sys.stderr)
            continue
        print(f"pushed {HIST_PATH} as {new_commit['sha'][:7]}")
        return
    print("push failed after retry", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    if "--push" in sys.argv[1:]:
        if not os.path.exists(HISTORY):
            print("no local history file; run without --push first", file=sys.stderr)
            sys.exit(1)
        push_history()
    else:
        collect()
