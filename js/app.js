(function () {
"use strict";
const DATA_URL = "data/week.json";
const STORAGE_KEY = "beanie-day-week-cache-v4";
const TAB_KEY = "beanie-day-active-tab";
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
"newbahru",
];
const TAB_THEME = {
"this-week": { emoji: "✨", color: "#8b5cf6", grad: "linear-gradient(135deg,#a78bfa,#7c3aed)" },
brands: { emoji: "🛍️", color: "#ec4899", grad: "linear-gradient(135deg,#f472b6,#db2777)" },
flavours: { emoji: "🍜", color: "#f97316", grad: "linear-gradient(135deg,#fb923c,#ea580c)" },
"happy-hour": { emoji: "🍺", color: "#f59e0b", grad: "linear-gradient(135deg,#fbbf24,#d97706)" },
events: { emoji: "🎪", color: "#ef4444", grad: "linear-gradient(135deg,#f87171,#dc2626)" },
"near-home": { emoji: "🏡", color: "#3b82f6", grad: "linear-gradient(135deg,#60a5fa,#2563eb)" },
outdoor: { emoji: "🌳", color: "#22c55e", grad: "linear-gradient(135deg,#4ade80,#16a34a)" },
};
let VISUALS = {};
async function loadVisuals() {
try {
const res = await fetch("data/visuals.json", { cache: "no-cache" });
if (res.ok) VISUALS = await res.json();
} catch (_) {}
}
const INTRO_TABS = {
flavours: true,
"happy-hour": true,
"this-week": true,
};
const state = {
data: null,
activeTab: "this-week",
query: "",
filters: new Set(),
deferredInstall: null,
openCardId: null,
inIntro: true,
};
const els = {
intro: document.getElementById("intro"),
appShell: document.getElementById("app-shell"),
homeBtn: document.getElementById("home-btn"),
tabNav: document.getElementById("tab-nav"),
catScroll: document.getElementById("cat-scroll"),
cardList: document.getElementById("card-list"),
emptyState: document.getElementById("empty-state"),
panelTitle: document.getElementById("panel-title"),
panelBlurb: document.getElementById("panel-blurb"),
sectionCount: document.getElementById("section-count"),
sectionIcon: document.getElementById("section-icon"),
weekLabel: document.getElementById("week-label"),
weekRefresh: document.getElementById("week-refresh"),
weekNote: document.getElementById("week-note"),
staleBanner: document.getElementById("stale-banner"),
footerSources: document.getElementById("footer-sources"),
offlineStatus: document.getElementById("offline-status"),
searchToggle: document.getElementById("search-toggle"),
searchSheet: document.getElementById("search-sheet"),
searchInput: document.getElementById("search-input"),
searchClear: document.getElementById("search-clear"),
filterChips: document.getElementById("filter-chips"),
installBtn: document.getElementById("install-btn"),
toast: document.getElementById("toast"),
iosDialog: document.getElementById("ios-install-dialog"),
navBar: document.getElementById("nav-bar"),
statPicks: document.getElementById("stat-picks"),
statHh: document.getElementById("stat-hh"),
statNear: document.getElementById("stat-near"),
};
async function init() {
try {
bindUI();
registerServiceWorker();
watchInstallPrompt();
watchOnlineStatus();
watchScroll();
const hashTab = (location.hash || "").replace("#", "");
if (hashTab && hashTab !== "intro") {
state.activeTab = hashTab;
state.inIntro = false;
document.body.classList.remove("intro-active");
} else {
state.inIntro = true;
document.body.classList.add("intro-active");
}
await loadVisuals();
await loadData();
renderAll();
if (window.__beanieBoot) clearTimeout(window.__beanieBoot);
} catch (err) {
console.error(err);
document.body.classList.remove("intro-active");
state.inIntro = false;
showFatal(
"Couldn’t load this week’s finds. Check your connection, then hard-refresh (or use Reload clean)."
);
}
}
function enterApp(tabId) {
const tab = INTRO_TABS[tabId] ? tabId : "this-week";
state.inIntro = false;
state.openCardId = null;
if (els.intro) {
els.intro.classList.add("is-leaving");
}
const finish = () => {
document.body.classList.remove("intro-active");
els.intro?.classList.remove("is-leaving");
setTab(tab, true);
window.scrollTo({ top: 0, behavior: "auto" });
};
setTimeout(finish, 280);
}
function showIntro() {
state.inIntro = true;
state.openCardId = null;
document.body.classList.add("intro-active");
history.replaceState(null, "", "#intro");
window.scrollTo({ top: 0, behavior: "auto" });
}
function fetchWithTimeout(url, ms) {
const ctrl = new AbortController();
const t = setTimeout(() => ctrl.abort(), ms);
return fetch(url, { cache: "no-cache", signal: ctrl.signal }).finally(() =>
clearTimeout(t)
);
}
function activityBlockBlob(a) {
return [
a?.id,
a?.title,
a?.description,
a?.why,
a?.travel?.region,
]
.filter(Boolean)
.join(" ")
.toLowerCase();
}
function isBlockedActivity(a) {
const blob = activityBlockBlob(a);
return BLOCKLIST.some((bad) => blob.includes(bad));
}
function applyBlocklist(json) {
const raw = Array.isArray(json?.activities) ? json.activities : [];
const kept = raw.filter((a) => !isBlockedActivity(a));
const dropped = raw.length - kept.length;
if (dropped > 0) {
toast(`Hid ${dropped} blocked familiar spot${dropped === 1 ? "" : "s"}`);
}
return { ...json, activities: kept };
}
async function loadData() {
try {
const res = await fetchWithTimeout(DATA_URL, 6000);
if (!res.ok) throw new Error("Network response not ok");
const json = await res.json();
if (!json || !Array.isArray(json.tabs)) {
throw new Error("Invalid week data shape");
}
if (!Array.isArray(json.activities)) json.activities = [];
if (Array.isArray(json.activityPacks) && json.activityPacks.length) {
const packs = await Promise.all(
json.activityPacks.map(async (url) => {
try {
const pr = await fetchWithTimeout(url, 6000);
if (!pr.ok) return [];
const arr = await pr.json();
return Array.isArray(arr) ? arr : [];
} catch {
return [];
}
})
);
json.activities = packs.flat();
}
if (!Array.isArray(json.activities)) {
throw new Error("Invalid week data shape");
}
state.data = applyBlocklist(json);
try {
localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
localStorage.removeItem("beanie-day-week-cache-v1");
localStorage.removeItem("beanie-day-week-cache-v2");
localStorage.removeItem("beanie-day-week-cache-v3");
} catch (_) {}
return;
} catch (networkErr) {
const cached = localStorage.getItem(STORAGE_KEY);
if (cached) {
try {
const json = JSON.parse(cached);
if (json && Array.isArray(json.activities) && Array.isArray(json.tabs)) {
state.data = applyBlocklist(json);
els.offlineStatus.hidden = false;
toast("Offline — showing saved week");
return;
}
} catch (_) {}
}
throw networkErr;
}
}
function visualFor(id, tabs) {
if (VISUALS[id]) return VISUALS[id];
const primary = (tabs && tabs[0]) || "this-week";
const theme = TAB_THEME[primary] || TAB_THEME["this-week"];
return { emoji: theme.emoji, grad: theme.grad, image: "" };
}
function shortDesc(text, max = 100) {
if (!text) return "";
const t = text.trim();
if (t.length <= max) return t;
return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}
function renderAll() {
renderWeekMeta();
renderHeroStats();
renderTabs();
renderCatScroll();
renderPanel();
}
function renderWeekMeta() {
