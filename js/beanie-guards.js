/**
 * Bean There — defensive guards (blocklist, freshness, schema normalize)
 * Loaded before app.js
 */
(function (global) {
  "use strict";

  const BLOCKLIST = [
    "vivocity",
    "vivo city",
    "holland village",
    "holland v",
    "amk hub",
    "ang mo kio hub",
    "northpoint",
    "north point",
    "causeway point",
    "new bahru",
  ];

  function isBlocklisted(activity) {
    if (!activity || typeof activity !== "object") return true;
    const blob = [
      activity.id,
      activity.title,
      activity.venue,
      activity.name,
      activity.description,
      activity.why,
      activity.travel && activity.travel.region,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return BLOCKLIST.some((bad) => blob.includes(bad));
  }

  function isFresh(activity) {
    if (!activity || typeof activity !== "object") return false;
    if (typeof activity.fresh === "boolean") return activity.fresh;
    if (typeof activity.isNew === "boolean") return activity.isNew;
    if (typeof activity.isFresh === "boolean") return activity.isFresh;
    return Boolean(activity.highlight);
  }

  function venueName(activity) {
    if (!activity || typeof activity !== "object") return "";
    const v = activity.venue || activity.name || activity.place || "";
    return String(v).trim();
  }

  function normalizeWeekData(raw) {
    if (!raw || typeof raw !== "object") return null;
    const tabs = Array.isArray(raw.tabs)
      ? raw.tabs.filter((t) => t && typeof t === "object" && t.id && t.label)
      : [];
    if (!tabs.length) return null;

    const activities = Array.isArray(raw.activities) ? raw.activities : [];
    const cleaned = [];
    for (const a of activities) {
      if (!a || typeof a !== "object") continue;
      if (!a.id || !a.title) continue;
      if (!Array.isArray(a.tabs) || !a.tabs.length) continue;
      if (isBlocklisted(a)) continue;
      cleaned.push({
        ...a,
        title: String(a.title),
        description: a.description != null ? String(a.description) : "",
        tags: Array.isArray(a.tags) ? a.tags : [],
        days: Array.isArray(a.days) ? a.days : [],
        tabs: a.tabs.filter(Boolean),
        fresh: isFresh(a),
        venue: venueName(a),
        travel:
          a.travel && typeof a.travel === "object"
            ? a.travel
            : { zone: "Singapore", fromWoodlands: "", region: "" },
      });
    }

    const meta =
      raw.meta && typeof raw.meta === "object"
        ? raw.meta
        : {
            weekLabel: "This week",
            weekEnd: "",
            sourcesNote: "",
            note: "",
          };

    return { meta, tabs, activities: cleaned };
  }

  function mergeSchemaFlags(week, flagMap) {
    if (!week || !flagMap || typeof flagMap !== "object") return week;
    const byId = flagMap.byId || flagMap;
    const activities = (week.activities || []).map((a) => {
      const f = byId[a.id];
      if (!f) return a;
      const next = { ...a };
      if (typeof f.fresh === "boolean") next.fresh = f.fresh;
      if (f.venue) next.venue = String(f.venue);
      return next;
    });
    return { ...week, activities };
  }

  global.BeanieGuards = {
    BLOCKLIST,
    isBlocklisted,
    isFresh,
    venueName,
    normalizeWeekData,
    mergeSchemaFlags,
  };
})(typeof window !== "undefined" ? window : globalThis);
