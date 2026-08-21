/* ============================================================
   GoldenHour v3 — ambulance-side pre-arrival alert
   Plain JavaScript. No framework, no build step, no bundler.

   Flow:  fill form  →  Broadcast Request  →  every registered
          hospital inside the radius is alerted  →  first one to
          accept claims the case  →  this screen updates itself.
   ============================================================ */

/* ── 1. Configuration ──────────────────────────────────────── */

/* THE ONE LINE TO CHANGE BEFORE GOING LIVE.
   While it still contains REPLACE-WITH-YOUR-BACKEND the app runs
   in DEMO MODE: no network calls, fake hospitals, fake acceptance. */
var API_BASE = "https://REPLACE-WITH-YOUR-BACKEND/api";

/* Tests / demos may override these on window before app.js runs. */
if (typeof window !== "undefined" && window.__GH_API_BASE) API_BASE = window.__GH_API_BASE;

var DEMO = API_BASE.indexOf("REPLACE-WITH-YOUR-BACKEND") !== -1;
var POLL_MS = (typeof window !== "undefined" && window.__GH_POLL_MS) || 5000;
/* Simulated network latency in demo mode (tests shorten this). */
var DEMO_POST_MS = (typeof window !== "undefined" && window.__GH_DEMO_POST_MS) || 650;
var REQUEST_TIMEOUT_MS = 15000;
var MAX_IMAGES = 4;
var MAX_IMAGE_PX = 900;
var IMAGE_QUALITY = 0.6;
var DEFAULT_RADIUS_KM = 15;

/* ── 2. Reference data ─────────────────────────────────────── */

var CATEGORY_LABELS = {
  TRAUMA:     "Trauma & injury",
  CARDIAC:    "Cardiac",
  STROKE:     "Stroke",
  NEURO:      "Neurological",
  RESP:       "Breathing & airway",
  METABOLIC:  "Metabolic",
  OBSTETRIC:  "Obstetric & newborn",
  PAEDIATRIC: "Paediatric",
  POISONING:  "Poisoning & bites",
  ALLERGY:    "Allergic",
  OTHER:      "Other"
};

var CATEGORY_ORDER = ["TRAUMA","CARDIAC","STROKE","NEURO","RESP","METABOLIC",
                      "OBSTETRIC","PAEDIATRIC","POISONING","ALLERGY","OTHER"];

/* Used only in demo mode. In live mode this comes from GET /case-types. */
var DEMO_CASE_TYPES = [
  { id: 1,  category: "TRAUMA",     label: "Road accident — multiple injuries", quick: true,  short: "Road accident" },
  { id: 2,  category: "TRAUMA",     label: "Head injury",                       quick: true,  short: "Head injury" },
  { id: 3,  category: "TRAUMA",     label: "Fall from height" },
  { id: 4,  category: "TRAUMA",     label: "Stab / gunshot / penetrating wound" },
  { id: 5,  category: "TRAUMA",     label: "Major burns" },
  { id: 6,  category: "TRAUMA",     label: "Crush injury / amputation" },
  { id: 7,  category: "TRAUMA",     label: "Suspected spinal injury" },

  { id: 8,  category: "CARDIAC",    label: "Chest pain / suspected heart attack", quick: true, short: "Chest pain" },
  { id: 9,  category: "CARDIAC",    label: "Cardiac arrest — CPR in progress",    quick: true, short: "Cardiac arrest" },
  { id: 10, category: "CARDIAC",    label: "Irregular heartbeat / arrhythmia" },
  { id: 11, category: "CARDIAC",    label: "Heart failure / fluid in lungs" },

  { id: 12, category: "STROKE",     label: "Stroke / sudden weakness or slurred speech", quick: true, short: "Stroke" },
  { id: 13, category: "STROKE",     label: "Suspected TIA (symptoms already settled)" },

  { id: 14, category: "NEURO",      label: "Seizure / fits" },
  { id: 15, category: "NEURO",      label: "Unresponsive — cause unknown" },

  { id: 16, category: "RESP",       label: "Severe breathlessness / asthma attack", quick: true, short: "Breathless" },
  { id: 17, category: "RESP",       label: "COPD flare-up" },
  { id: 18, category: "RESP",       label: "Choking / blocked airway" },
  { id: 19, category: "RESP",       label: "Drowning" },

  { id: 20, category: "METABOLIC",  label: "Low blood sugar (hypoglycaemia)" },
  { id: 21, category: "METABOLIC",  label: "High blood sugar / DKA" },
  { id: 22, category: "METABOLIC",  label: "Heat stroke / severe dehydration" },

  { id: 23, category: "OBSTETRIC",  label: "Labour / delivery imminent" },
  { id: 24, category: "OBSTETRIC",  label: "Pregnancy emergency (bleeding, fits, high BP)" },
  { id: 25, category: "OBSTETRIC",  label: "Newborn in distress" },

  { id: 26, category: "PAEDIATRIC", label: "Sick child — high fever or fits" },
  { id: 27, category: "PAEDIATRIC", label: "Injured child" },

  { id: 28, category: "POISONING",  label: "Poisoning / overdose" },
  { id: 29, category: "POISONING",  label: "Snake bite / animal bite" },

  { id: 30, category: "ALLERGY",    label: "Severe allergic reaction (anaphylaxis)" },

  { id: 31, category: "OTHER",      label: "Heavy bleeding (not from injury)" },
  { id: 32, category: "OTHER",      label: "Psychiatric emergency" },
  { id: 33, category: "OTHER",      label: "Other emergency" }
];

/* ── 3. Vital-sign bands ───────────────────────────────────── */
/* A band answers one question: what colour should this number be?
   It is a bedside hint for the crew — the hospital system computes
   the official RED/AMBER/GREEN priority, never this app. */

var LEVELS = { GOOD: "good", CAUTION: "caution", CRITICAL: "critical" };

/* Plausible-entry ranges. Outside these the value is treated as a
   typo: no colour band, and the field is flagged out-of-range. */
var RANGES = {
  systolicBp:  { min: 40, max: 300 },
  diastolicBp: { min: 20, max: 200 },
  heartRate:   { min: 20, max: 300 },
  respRate:    { min: 4,  max: 80  },
  spo2:        { min: 50, max: 100 },
  glucose:     { min: 10, max: 900 },
  age:         { min: 0,  max: 120 },
  eta:         { min: 1,  max: 180 },
  onsetHours:  { min: 0,  max: 72  },
  radiusKm:    { min: 2,  max: 40  }
};

/* Each band: low-critical / low-caution / good / high-caution / high-critical.
   Boundaries are inclusive of the value shown. */
var BANDS = {
  systolicBp:  { criticalLow: 89,  cautionLow: 99,  cautionHigh: 140, criticalHigh: 180 },
  diastolicBp: { criticalLow: 49,  cautionLow: 59,  cautionHigh: 90,  criticalHigh: 120 },
  heartRate:   { criticalLow: 49,  cautionLow: 59,  cautionHigh: 101, criticalHigh: 121 },
  respRate:    { criticalLow: 8,   cautionLow: 11,  cautionHigh: 21,  criticalHigh: 30  },
  spo2:        { criticalLow: 89,  cautionLow: 94,  cautionHigh: 101, criticalHigh: 101 },
  glucose:     { criticalLow: 59,  cautionLow: 69,  cautionHigh: 141, criticalHigh: 250 }
};

/**
 * Map a vital value to "good" | "caution" | "critical", or null when
 * the field is blank, not a number, or outside its plausible range.
 */
function getBandFor(bandKey, value) {
  var band = BANDS[bandKey];
  if (!band) return null;
  if (value === "" || value === null || value === undefined) return null;

  var n = Number(value);
  if (isNaN(n)) return null;

  var range = RANGES[bandKey];
  if (range && (n < range.min || n > range.max)) return null;

  if (n <= band.criticalLow)  return LEVELS.CRITICAL;
  if (n >= band.criticalHigh) return LEVELS.CRITICAL;
  if (n <= band.cautionLow)   return LEVELS.CAUTION;
  if (n >= band.cautionHigh)  return LEVELS.CAUTION;
  return LEVELS.GOOD;
}

/** True when a filled-in value is outside its plausible range. */
function isOutOfRange(key, value) {
  var range = RANGES[key];
  if (!range) return false;
  if (value === "" || value === null || value === undefined) return false;
  var n = Number(value);
  if (isNaN(n)) return false;
  return n < range.min || n > range.max;
}

var BAND_LABELS = { good: "Normal", caution: "Caution", critical: "Critical" };

/* ── 4. Payload helpers (pure — unit tested) ───────────────── */

/** Blank → null. Never 0, because 0 is a real and dangerous reading. */
function toNumberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  var n = Number(value);
  return isNaN(n) ? null : n;
}

function toTextOrNull(value) {
  if (value === null || value === undefined) return null;
  var s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Build the exact POST /requests body from a plain form object.
 * Hard rules (enforced by tests):
 *  - blank vital  → null, never 0, never omitted
 *  - stroke_assessment present ONLY when category === "STROKE"
 *  - "priority" NEVER appears — the backend computes it
 *  - "destination_hospital_ids" NEVER appears — the backend resolves
 *    hospitals from origin + broadcast_radius_km
 */
function buildPayload(form) {
  var f = form || {};

  var payload = {
    case_type_id: toNumberOrNull(f.caseTypeId),
    age: toNumberOrNull(f.age),
    gender: f.gender || "U",
    blood_group: toTextOrNull(f.bloodGroup),
    vitals: {
      systolic_bp:  toNumberOrNull(f.systolicBp),
      diastolic_bp: toNumberOrNull(f.diastolicBp),
      heart_rate:   toNumberOrNull(f.heartRate),
      resp_rate:    toNumberOrNull(f.respRate),
      spo2:         toNumberOrNull(f.spo2),
      glucose:      toNumberOrNull(f.glucose)
    },
    consciousness: toTextOrNull(f.consciousness),
    origin: {
      lat: toNumberOrNull(f.lat),
      lng: toNumberOrNull(f.lng),
      accuracy_m: toNumberOrNull(f.accuracy)
    },
    broadcast_radius_km: toNumberOrNull(f.radiusKm) === null ? DEFAULT_RADIUS_KM : toNumberOrNull(f.radiusKm),
    images: [],
    eta_minutes: toNumberOrNull(f.eta),
    notes: toTextOrNull(f.notes),
    ambulance_id: toTextOrNull(f.ambulanceId)
  };

  if (Object.prototype.toString.call(f.images) === "[object Array]") {
    payload.images = f.images.slice(0, MAX_IMAGES);
  }

  if (f.category === "STROKE") {
    payload.stroke_assessment = {
      face:   !!f.face,
      arm:    !!f.arm,
      speech: !!f.speech,
      onset_hours: toNumberOrNull(f.onsetHours)
    };
  }

  return payload;
}

/* ── 5. Runtime state ──────────────────────────────────────── */

var caseTypes = [];
var locationState = { status: "idle", lat: null, lng: null, accuracy: null, message: "Locating device…" };
var attachedImages = [];
var selected = { gender: "U", bloodGroup: null, consciousness: null, radiusKm: DEFAULT_RADIUS_KM };
var fastState = { face: false, arm: false, speech: false };
var submitting = false;
var pollTimer = null;
var demoPollCount = 0;
var lastPayload = null;
var currentRequestId = null;

/* ── 6. Tiny DOM helpers ───────────────────────────────────── */

function $(id) { return document.getElementById(id); }
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }
function setText(el, t) { if (el) el.textContent = t; }

var toastTimer = null;
function toast(message) {
  var el = $("toast");
  if (!el) return;
  setText(el, message);
  show(el);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { hide(el); }, 2600);
}

/* Safe storage — localStorage is unavailable or throws in some WebViews. */
function storeGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function storeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

/* ── 7. Environment detection ──────────────────────────────── */

function isNative() {
  return !!(typeof window !== "undefined" && window.Capacitor &&
            typeof window.Capacitor.isNativePlatform === "function" &&
            window.Capacitor.isNativePlatform());
}
function plugin(name) {
  return (typeof window !== "undefined" && window.Capacitor && window.Capacitor.Plugins)
    ? window.Capacitor.Plugins[name] : null;
}

/* ── 8. Geolocation ────────────────────────────────────────── */

function renderLocation() {
  var box = $("locBox");
  var text = $("locationStatus");
  var retry = $("locRetryBtn");
  if (!box || !text) return;

  box.className = "locbox loc-" + locationState.status;
  setText(text, locationState.message);
  if (locationState.status === "error") { show(retry); } else { hide(retry); }
  updateSubmitHint();
}

function readPosition() {
  var geo = plugin("Geolocation");
  if (isNative() && geo && typeof geo.getCurrentPosition === "function") {
    return geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
  }
  return new Promise(function (resolve, reject) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This device has no GPS available to the app."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 12000, maximumAge: 30000
    });
  });
}

function requestLocation() {
  if (DEMO) {
    locationState = {
      status: "ready", lat: 12.9716, lng: 77.5946, accuracy: 20,
      message: "Demo location · Bengaluru"
    };
    renderLocation();
    return Promise.resolve(locationState);
  }

  locationState = { status: "locating", lat: null, lng: null, accuracy: null, message: "Locating device…" };
  renderLocation();

  return readPosition().then(function (pos) {
    var c = pos && pos.coords ? pos.coords : {};
    locationState = {
      status: "ready",
      lat: c.latitude,
      lng: c.longitude,
      accuracy: c.accuracy === undefined ? null : Math.round(c.accuracy),
      message: "Location locked" + (c.accuracy ? " · accurate to ±" + Math.round(c.accuracy) + " m" : "")
    };
    renderLocation();
    return locationState;
  }).catch(function (err) {
    locationState = {
      status: "error", lat: null, lng: null, accuracy: null,
      message: (err && err.message) ? ("No location: " + err.message) : "Location unavailable. Tap Retry."
    };
    renderLocation();
    return locationState;
  });
}

/* ── 9. Photos ─────────────────────────────────────────────── */

function canvasAvailable() {
  try {
    var c = document.createElement("canvas");
    return !!(c.getContext && c.getContext("2d"));
  } catch (e) { return false; }
}

/** Shrink to maxPx on the long edge and re-encode as JPEG. */
function compressImage(dataUrl, maxPx) {
  if (!dataUrl) return Promise.resolve(null);
  if (!canvasAvailable()) return Promise.resolve(dataUrl);

  return new Promise(function (resolve) {
    var img = new Image();
    var done = false;
    var bail = setTimeout(function () { if (!done) { done = true; resolve(dataUrl); } }, 6000);

    img.onload = function () {
      if (done) return;
      done = true; clearTimeout(bail);
      try {
        var w = img.width, h = img.height;
        var scale = Math.min(1, maxPx / Math.max(w, h));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      } catch (e) { resolve(dataUrl); }
    };
    img.onerror = function () { if (!done) { done = true; clearTimeout(bail); resolve(dataUrl); } };
    img.src = dataUrl;
  });
}

function renderPhotoGrid() {
  var grid = $("photoGrid");
  var addBtn = $("addPhotoBtn");
  if (!grid || !addBtn) return;

  var tiles = grid.querySelectorAll(".photo-tile");
  for (var i = 0; i < tiles.length; i++) grid.removeChild(tiles[i]);

  for (var j = 0; j < attachedImages.length; j++) {
    (function (index) {
      var tile = document.createElement("div");
      tile.className = "photo-tile";

      var img = document.createElement("img");
      img.src = attachedImages[index];
      img.alt = "Attached photo " + (index + 1);
      tile.appendChild(img);

      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "photo-remove";
      rm.setAttribute("aria-label", "Remove photo " + (index + 1));
      rm.textContent = "×";
      rm.addEventListener("click", function () {
        attachedImages.splice(index, 1);
        renderPhotoGrid();
      });
      tile.appendChild(rm);

      grid.insertBefore(tile, addBtn);
    })(j);
  }

  setText($("photoCount"), attachedImages.length + " / " + MAX_IMAGES);
  if (attachedImages.length >= MAX_IMAGES) { hide(addBtn); } else { show(addBtn); }
}

function addImage(dataUrl) {
  if (!dataUrl) return Promise.resolve(false);
  if (attachedImages.length >= MAX_IMAGES) {
    toast("Maximum " + MAX_IMAGES + " photos");
    return Promise.resolve(false);
  }
  return compressImage(dataUrl, MAX_IMAGE_PX).then(function (small) {
    if (attachedImages.length >= MAX_IMAGES) return false;
    attachedImages.push(small);
    renderPhotoGrid();
    return true;
  });
}

function addPhotoFromFile(file) {
  if (!file) return Promise.resolve(false);
  return new Promise(function (resolve) {
    var reader = new FileReader();
    reader.onload = function () { addImage(String(reader.result)).then(resolve); };
    reader.onerror = function () { toast("Couldn't read that image"); resolve(false); };
    reader.readAsDataURL(file);
  });
}

function capturePhotos() {
  if (attachedImages.length >= MAX_IMAGES) { toast("Maximum " + MAX_IMAGES + " photos"); return; }

  var cam = plugin("Camera");
  if (isNative() && cam && typeof cam.getPhoto === "function") {
    cam.getPhoto({
      quality: 70,
      width: MAX_IMAGE_PX,
      allowEditing: false,
      resultType: "dataUrl",
      source: "PROMPT",
      promptLabelHeader: "Add photo",
      promptLabelPhoto: "Choose from gallery",
      promptLabelPicture: "Take a photo",
      saveToGallery: false
    }).then(function (photo) {
      var url = photo && (photo.dataUrl || photo.webPath);
      if (url) addImage(url);
    }).catch(function () { /* user cancelled — silent */ });
    return;
  }

  var input = $("photoInput");
  if (input) input.click();
}

/* ── 10. Case types ────────────────────────────────────────── */

function findCaseType(id) {
  var n = Number(id);
  for (var i = 0; i < caseTypes.length; i++) if (Number(caseTypes[i].id) === n) return caseTypes[i];
  return null;
}

function selectedCaseCategory() {
  var sel = $("caseType");
  if (!sel || !sel.value) return null;
  var ct = findCaseType(sel.value);
  return ct ? ct.category : null;
}

function populateCaseTypes(list) {
  caseTypes = Array.isArray(list) ? list : [];
  var sel = $("caseType");
  if (!sel) return;

  sel.innerHTML = "";
  var placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a case type…";
  sel.appendChild(placeholder);

  var seen = {};
  var order = [];
  for (var i = 0; i < caseTypes.length; i++) {
    var cat = caseTypes[i].category || "OTHER";
    if (!seen[cat]) { seen[cat] = []; order.push(cat); }
    seen[cat].push(caseTypes[i]);
  }
  order.sort(function (a, b) {
    var ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  for (var k = 0; k < order.length; k++) {
    var group = document.createElement("optgroup");
    group.label = CATEGORY_LABELS[order[k]] || order[k];
    var items = seen[order[k]];
    for (var m = 0; m < items.length; m++) {
      var opt = document.createElement("option");
      opt.value = String(items[m].id);
      opt.textContent = items[m].label;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }

  renderQuickCases();
  updateStrokeSection();
  updateSubmitHint();
}

function renderQuickCases() {
  var row = $("quickCase");
  if (!row) return;
  row.innerHTML = "";

  var quick = caseTypes.filter(function (c) { return c.quick === true; });
  if (quick.length === 0) quick = caseTypes.slice(0, 6);

  quick.slice(0, 6).forEach(function (ct) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("data-case-id", String(ct.id));
    b.textContent = ct.short || ct.label;
    b.addEventListener("click", function () {
      var sel = $("caseType");
      if (!sel) return;
      sel.value = String(ct.id);
      syncQuickCases();
      updateStrokeSection();
      updateSubmitHint();
    });
    row.appendChild(b);
  });
  syncQuickCases();
}

function syncQuickCases() {
  var sel = $("caseType");
  var row = $("quickCase");
  if (!row) return;
  var current = sel ? sel.value : "";
  var chips = row.querySelectorAll("[data-case-id]");
  for (var i = 0; i < chips.length; i++) {
    var on = chips[i].getAttribute("data-case-id") === current && current !== "";
    chips[i].className = on ? "chip is-on" : "chip";
  }
}

function showListError(visible) {
  var banner = $("loadError");
  if (!banner) return;
  if (visible) { show(banner); } else { hide(banner); }
}

function fetchJson(url, options) {
  var opts = options || {};
  if (typeof AbortController === "function") {
    var ctrl = new AbortController();
    opts.signal = ctrl.signal;
    setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);
  }
  return fetch(url, opts).then(function (res) {
    if (!res.ok) throw new Error("Server responded " + res.status);
    return res.json();
  });
}

function loadLists() {
  showListError(false);
  if (DEMO) { populateCaseTypes(DEMO_CASE_TYPES); return Promise.resolve(DEMO_CASE_TYPES); }

  return fetchJson(API_BASE + "/case-types")
    .then(function (data) { populateCaseTypes(data); return data; })
    .catch(function () { populateCaseTypes(DEMO_CASE_TYPES); showListError(true); return null; });
}

/* ── 11. Live vital colours ────────────────────────────────── */

function applyVitalColour(inputId, chipId, bandKey) {
  var input = $(inputId), chip = $(chipId);
  if (!input || !chip) return;

  var raw = input.value;
  input.className = input.className.replace(/\s*in-(good|caution|critical|range)/g, "");

  if (raw === "" || raw === null) { hide(chip); chip.className = "chip-state"; return; }

  if (isOutOfRange(bandKey, raw)) {
    chip.className = "chip-state state-range";
    setText(chip, "Check value");
    show(chip);
    input.className += " in-range";
    return;
  }

  var band = getBandFor(bandKey, raw);
  if (!band) { hide(chip); chip.className = "chip-state"; return; }

  chip.className = "chip-state state-" + band;
  setText(chip, BAND_LABELS[band]);
  show(chip);
  input.className += " in-" + band;
}

function refreshVitals() {
  applyVitalColour("systolicBp",  "sysChip",  "systolicBp");
  applyVitalColour("diastolicBp", "diaChip",  "diastolicBp");
  applyVitalColour("heartRate",   "hrChip",   "heartRate");
  applyVitalColour("respRate",    "rrChip",   "respRate");
  applyVitalColour("spo2",        "spo2Chip", "spo2");
  applyVitalColour("glucose",     "glcChip",  "glucose");
}

function wireVitals() {
  ["systolicBp","diastolicBp","heartRate","respRate","spo2","glucose"].forEach(function (id) {
    var el = $(id);
    on(el, "input", refreshVitals);
    on(el, "change", refreshVitals);
  });
}

/* ── 12. Option controls ───────────────────────────────────── */

function wireSegmented(containerId, onPick) {
  var box = $(containerId);
  if (!box) return;
  var buttons = box.querySelectorAll(".seg-btn");
  for (var i = 0; i < buttons.length; i++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        for (var j = 0; j < buttons.length; j++) {
          buttons[j].className = "seg-btn";
          buttons[j].setAttribute("aria-checked", "false");
        }
        btn.className = "seg-btn is-on";
        btn.setAttribute("aria-checked", "true");
        onPick(btn.getAttribute("data-value"));
      });
    })(buttons[i]);
  }
}

function wireBloodChips() {
  var box = $("bloodChips");
  if (!box) return;
  var chips = box.querySelectorAll("[data-blood]");
  for (var i = 0; i < chips.length; i++) {
    (function (chip) {
      chip.addEventListener("click", function () {
        var value = chip.getAttribute("data-blood");
        var turningOff = selected.bloodGroup === value;
        for (var j = 0; j < chips.length; j++) chips[j].className = "chip";
        if (turningOff) { selected.bloodGroup = null; return; }
        chip.className = "chip is-on";
        selected.bloodGroup = value;
      });
    })(chips[i]);
  }
}

function wireConsciousness() {
  var box = $("consciousnessGroup");
  if (!box) return;
  var buttons = box.querySelectorAll(".level");
  for (var i = 0; i < buttons.length; i++) {
    (function (btn) {
      btn.addEventListener("click", function () {
        for (var j = 0; j < buttons.length; j++) {
          buttons[j].className = "level";
          buttons[j].setAttribute("aria-checked", "false");
        }
        btn.className = "level is-on";
        btn.setAttribute("aria-checked", "true");
        selected.consciousness = btn.getAttribute("data-value");
      });
    })(buttons[i]);
  }
}

function wireFastToggles() {
  var groups = document.querySelectorAll("[data-fast]");
  for (var i = 0; i < groups.length; i++) {
    (function (group) {
      var key = group.getAttribute("data-fast");
      var buttons = group.querySelectorAll(".seg-btn");
      for (var j = 0; j < buttons.length; j++) {
        (function (btn) {
          btn.addEventListener("click", function () {
            for (var k = 0; k < buttons.length; k++) {
              buttons[k].className = "seg-btn";
              buttons[k].setAttribute("aria-checked", "false");
            }
            btn.className = "seg-btn is-on";
            btn.setAttribute("aria-checked", "true");
            fastState[key] = btn.getAttribute("data-yn") === "yes";
          });
        })(buttons[j]);
      }
    })(groups[i]);
  }
}

/** Chip rows that just fill a number field (age, ETA, onset, radius). */
function wireValueChips(rowId, attr, targetId, afterPick) {
  var row = $(rowId);
  if (!row) return;
  var chips = row.querySelectorAll("[" + attr + "]");
  for (var i = 0; i < chips.length; i++) {
    (function (chip) {
      chip.addEventListener("click", function () {
        for (var j = 0; j < chips.length; j++) chips[j].className = chips[j].className.replace(" is-on", "");
        chip.className += " is-on";
        var value = chip.getAttribute(attr);
        var target = $(targetId);
        if (target) {
          target.value = value;
          if (typeof Event === "function") target.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (afterPick) afterPick(value);
      });
    })(chips[i]);
  }
}

function updateStrokeSection() {
  var section = $("strokeSection");
  if (!section) return;
  if (selectedCaseCategory() === "STROKE") { show(section); } else { hide(section); }
}

function updateRadius(value) {
  var n = Number(value);
  if (isNaN(n)) n = DEFAULT_RADIUS_KM;
  selected.radiusKm = n;
  setText($("radiusOut"), n + " km");
  var slider = $("radiusKm");
  if (slider) {
    var min = Number(slider.min || 2), max = Number(slider.max || 40);
    var pct = ((n - min) / (max - min)) * 100;
    if (slider.style && slider.style.setProperty) slider.style.setProperty("--fill", pct + "%");
  }
  var row = $("radiusChips");
  if (row) {
    var chips = row.querySelectorAll("[data-radius]");
    for (var i = 0; i < chips.length; i++) {
      chips[i].className = (Number(chips[i].getAttribute("data-radius")) === n) ? "chip chip-xs is-on" : "chip chip-xs";
    }
  }
  storeSet("gh_radius", String(n));
}

/* ── 13. Readiness hint ────────────────────────────────────── */

function updateSubmitHint() {
  var hint = $("submitHint");
  var btn = $("submitBtn");
  if (!hint) return;

  var sel = $("caseType");
  var hasCase = !!(sel && sel.value);
  var hasLocation = locationState.status === "ready";

  if (submitting) { setText(hint, "Sending…"); hint.className = "submit-hint"; return; }

  if (!hasCase && !hasLocation)      { setText(hint, "Pick a case type · waiting for GPS"); hint.className = "submit-hint is-bad"; }
  else if (!hasCase)                 { setText(hint, "Pick a case type to broadcast");      hint.className = "submit-hint is-bad"; }
  else if (locationState.status === "locating") { setText(hint, "Waiting for GPS…");        hint.className = "submit-hint"; }
  else if (!hasLocation)             { setText(hint, "Location needed — tap Retry above");  hint.className = "submit-hint is-bad"; }
  else                               { setText(hint, "Ready · " + selected.radiusKm + " km radius"); hint.className = "submit-hint is-ok"; }

  if (btn) btn.disabled = false;
}

function updateNetPill() {
  var pill = $("netPill");
  if (!pill) return;
  var online = (typeof navigator === "undefined") ? true : navigator.onLine !== false;
  if (DEMO) { pill.className = "pill pill-warn"; setText(pill, "Demo"); return; }
  pill.className = online ? "pill pill-ok" : "pill pill-bad";
  setText(pill, online ? "Online" : "Offline");
}

/* ── 14. Gather + submit ───────────────────────────────────── */

function gatherForm() {
  var sel = $("caseType");
  var category = selectedCaseCategory();
  return {
    caseTypeId: sel ? sel.value : "",
    category: category,
    age: $("age") ? $("age").value : "",
    gender: selected.gender,
    bloodGroup: selected.bloodGroup,
    systolicBp:  $("systolicBp")  ? $("systolicBp").value  : "",
    diastolicBp: $("diastolicBp") ? $("diastolicBp").value : "",
    heartRate:   $("heartRate")   ? $("heartRate").value   : "",
    respRate:    $("respRate")    ? $("respRate").value    : "",
    spo2:        $("spo2")        ? $("spo2").value        : "",
    glucose:     $("glucose")     ? $("glucose").value     : "",
    consciousness: selected.consciousness,
    lat: locationState.lat,
    lng: locationState.lng,
    accuracy: locationState.accuracy,
    radiusKm: selected.radiusKm,
    images: attachedImages.slice(),
    eta: $("eta") ? $("eta").value : "",
    notes: $("notes") ? $("notes").value : "",
    ambulanceId: $("ambulanceId") ? $("ambulanceId").value : "",
    face: fastState.face,
    arm: fastState.arm,
    speech: fastState.speech,
    onsetHours: $("onsetHours") ? $("onsetHours").value : ""
  };
}

function setBusy(busy) {
  submitting = busy;
  var btn = $("submitBtn");
  if (!btn) return;
  btn.disabled = busy;
  btn.className = busy ? "btn-primary is-busy" : "btn-primary";
  var label = btn.querySelector(".btn-label");
  if (label) label.textContent = busy ? "Broadcasting…" : "Broadcast Request";
}

function postRequest(payload) {
  if (DEMO) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (typeof window !== "undefined" && window.__GH_DEMO_FAIL) {
          reject(new Error("Simulated network failure (demo)"));
        } else {
          resolve({ id: "demo-1", hospitals_notified: 3, status: "PENDING" });
        }
      }, DEMO_POST_MS);
    });
  }
  return fetchJson(API_BASE + "/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function submitLoop() {
  if (submitting) return Promise.resolve(null);

  var sel = $("caseType");
  if (!sel || !sel.value) {
    toast("Pick a case type first");
    var card = $("caseCard");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
    return Promise.resolve(null);
  }
  if (locationState.status !== "ready") {
    toast("Waiting for GPS — the broadcast needs your location");
    if (locationState.status === "error") requestLocation();
    return Promise.resolve(null);
  }

  lastPayload = buildPayload(gatherForm());
  if (typeof window !== "undefined") window.__GH_LAST_PAYLOAD = lastPayload;

  setBusy(true);
  updateSubmitHint();

  return postRequest(lastPayload).then(function (res) {
    setBusy(false);
    showBroadcast(res || {});
    return res;
  }).catch(function (err) {
    setBusy(false);
    updateSubmitHint();
    showError(err && err.message ? err.message : "Network error.");
    return null;
  });
}

/* ── 15. Broadcast overlay + live acceptance ───────────────── */

function showBroadcast(res) {
  currentRequestId = res.id === undefined ? null : res.id;
  demoPollCount = 0;

  var n = res.hospitals_notified;
  setText($("broadcastInfo"),
    (n === undefined || n === null)
      ? "Alert sent to nearby hospitals"
      : ("Sent to " + n + " nearby hospital" + (n === 1 ? "" : "s") + " within " + selected.radiusKm + " km"));

  hide($("acceptedBox"));
  hide($("callBtn"));
  hide($("navBtn"));
  updateStatusChip({ status: res.status || "PENDING" });
  show($("successOverlay"));

  startPolling();
}

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

function startPolling() {
  stopPolling();
  if (currentRequestId === null || currentRequestId === undefined) return;
  pollTimer = setTimeout(pollStatus, POLL_MS);
}

function fetchStatus() {
  if (DEMO) {
    demoPollCount++;
    if (demoPollCount < 2) return Promise.resolve({ id: currentRequestId, status: "PENDING", hospitals_notified: 3 });
    return Promise.resolve({
      id: currentRequestId,
      status: "ACCEPTED",
      accepted_by: "Demo City ER",
      hospitals_notified: 3,
      accepted_hospital: { name: "Demo City ER", distance_km: 3.4, phone: "+911234567890", lat: 12.9899, lng: 77.5921 }
    });
  }
  return fetchJson(API_BASE + "/requests/" + encodeURIComponent(currentRequestId));
}

function pollStatus() {
  fetchStatus().then(function (data) {
    updateStatusChip(data || {});
    var status = String((data && data.status) || "PENDING").toUpperCase();
    if (status === "PENDING") { startPolling(); }
    else { stopPolling(); }
  }).catch(function () {
    /* A dropped poll is not fatal — keep trying. */
    startPolling();
  });
}

function updateStatusChip(data) {
  var chip = $("statusChip");
  var text = $("statusChipText");
  var note = $("sheetNote");
  if (!chip || !text) return;

  var status = String(data.status || "PENDING").toUpperCase();
  var hospital = data.accepted_hospital || null;
  var name = data.accepted_by || (hospital && hospital.name) || "a hospital";

  if (status === "ACCEPTED") {
    chip.className = "status-chip status-accepted";
    setText(text, "✓ Accepted by " + name);
    setText(note, "Head there now. The ER is preparing for this patient.");

    setText($("acceptedName"), name);
    var bits = [];
    if (hospital && hospital.distance_km !== undefined && hospital.distance_km !== null) bits.push(hospital.distance_km + " km away");
    if (hospital && hospital.eta_min) bits.push("~" + hospital.eta_min + " min");
    if (data.hospitals_notified) bits.push("first of " + data.hospitals_notified + " to accept");
    setText($("acceptedMeta"), bits.join(" · "));

    var call = $("callBtn");
    if (call && hospital && hospital.phone) { call.href = "tel:" + hospital.phone; show(call); } else { hide(call); }

    var nav = $("navBtn");
    if (nav && hospital && hospital.lat !== undefined && hospital.lat !== null) {
      nav.href = "geo:" + hospital.lat + "," + hospital.lng + "?q=" + encodeURIComponent(name);
      show(nav);
    } else { hide(nav); }

    show($("acceptedBox"));

  } else if (status === "REJECTED" || status === "EXPIRED" || status === "CANCELLED") {
    chip.className = "status-chip status-failed";
    setText(text, "No hospital accepted");
    setText(note, "Call the nearest ER directly, or start a new request with a wider radius.");
    hide($("acceptedBox"));

  } else {
    chip.className = "status-chip status-pending";
    setText(text, "Waiting for a hospital to accept…");
    setText(note, "Keep this screen open — it updates by itself.");
    hide($("acceptedBox"));
  }
}

/* ── 16. Error overlay ─────────────────────────────────────── */

function showError(message) {
  setText($("errorMessage"), message || "Network error.");
  show($("errorOverlay"));
}
function hideError() { hide($("errorOverlay")); }

function retrySubmit() {
  hideError();
  if (!lastPayload) { submitLoop(); return; }
  setBusy(true);
  postRequest(lastPayload).then(function (res) {
    setBusy(false);
    showBroadcast(res || {});
  }).catch(function (err) {
    setBusy(false);
    showError(err && err.message ? err.message : "Network error.");
  });
}

/* ── 17. Reset ─────────────────────────────────────────────── */

function resetForm() {
  stopPolling();
  currentRequestId = null;
  lastPayload = null;
  demoPollCount = 0;

  var sel = $("caseType");
  if (sel) sel.value = "";
  syncQuickCases();

  ["age","systolicBp","diastolicBp","heartRate","respRate","spo2","glucose","eta","onsetHours","notes"]
    .forEach(function (id) { var el = $(id); if (el) el.value = ""; });

  selected.bloodGroup = null;
  selected.consciousness = null;
  selected.gender = "U";
  fastState = { face: false, arm: false, speech: false };
  attachedImages = [];

  var bloodChips = document.querySelectorAll("[data-blood]");
  for (var i = 0; i < bloodChips.length; i++) bloodChips[i].className = "chip";

  var levels = document.querySelectorAll(".level");
  for (var j = 0; j < levels.length; j++) { levels[j].className = "level"; levels[j].setAttribute("aria-checked","false"); }

  var genderButtons = $("genderSeg") ? $("genderSeg").querySelectorAll(".seg-btn") : [];
  for (var k = 0; k < genderButtons.length; k++) {
    var isDefault = genderButtons[k].getAttribute("data-value") === "U";
    genderButtons[k].className = isDefault ? "seg-btn is-on" : "seg-btn";
    genderButtons[k].setAttribute("aria-checked", isDefault ? "true" : "false");
  }

  var fastGroups = document.querySelectorAll("[data-fast]");
  for (var m = 0; m < fastGroups.length; m++) {
    var yn = fastGroups[m].querySelectorAll(".seg-btn");
    for (var p = 0; p < yn.length; p++) {
      var isNo = yn[p].getAttribute("data-yn") === "no";
      yn[p].className = isNo ? "seg-btn is-on" : "seg-btn";
      yn[p].setAttribute("aria-checked", isNo ? "true" : "false");
    }
  }

  ["ageChips","etaChips","onsetChips"].forEach(function (rowId) {
    var row = $(rowId);
    if (!row) return;
    var chips = row.querySelectorAll(".chip");
    for (var q = 0; q < chips.length; q++) chips[q].className = "chip chip-xs";
  });

  setText($("notesCount"), "0 / 160");
  renderPhotoGrid();
  refreshVitals();
  updateStrokeSection();
  hide($("successOverlay"));
  hideError();
  setBusy(false);

  /* The ambulance has moved since the last case — get a fresh fix. */
  requestLocation();
  updateSubmitHint();
}

/* ── 18. Init ──────────────────────────────────────────────── */

function init() {
  if (DEMO) show($("demoBanner"));
  updateNetPill();

  wireVitals();
  wireConsciousness();
  wireBloodChips();
  wireFastToggles();
  wireSegmented("genderSeg", function (value) { selected.gender = value || "U"; });

  wireValueChips("ageChips", "data-age", "age");
  wireValueChips("etaChips", "data-eta", "eta");
  wireValueChips("onsetChips", "data-onset", "onsetHours");

  var radiusRow = $("radiusChips");
  if (radiusRow) {
    var rChips = radiusRow.querySelectorAll("[data-radius]");
    for (var i = 0; i < rChips.length; i++) {
      (function (chip) {
        chip.addEventListener("click", function () {
          var v = Number(chip.getAttribute("data-radius"));
          var slider = $("radiusKm");
          if (slider) slider.value = String(v);
          updateRadius(v);
        });
      })(rChips[i]);
    }
  }

  var slider = $("radiusKm");
  on(slider, "input", function () { updateRadius(slider.value); });

  on($("caseType"), "change", function () {
    syncQuickCases();
    updateStrokeSection();
    updateSubmitHint();
  });

  on($("addPhotoBtn"), "click", capturePhotos);
  on($("photoInput"), "change", function (e) {
    var files = e.target.files ? Array.prototype.slice.call(e.target.files) : [];
    var chain = Promise.resolve();
    files.forEach(function (file) { chain = chain.then(function () { return addPhotoFromFile(file); }); });
    chain.then(function () { e.target.value = ""; });
  });

  on($("notes"), "input", function () {
    var el = $("notes");
    setText($("notesCount"), el.value.length + " / 160");
  });

  var unit = $("ambulanceId");
  if (unit) {
    var saved = storeGet("gh_unit");
    if (saved) unit.value = saved;
    on(unit, "change", function () { storeSet("gh_unit", unit.value.trim()); });
  }

  var savedRadius = Number(storeGet("gh_radius"));
  var startRadius = (savedRadius >= 2 && savedRadius <= 40) ? savedRadius : DEFAULT_RADIUS_KM;
  if (slider) slider.value = String(startRadius);
  updateRadius(startRadius);

  on($("submitBtn"), "click", submitLoop);
  on($("newRequestBtn"), "click", resetForm);
  on($("retryBtn"), "click", retrySubmit);
  on($("backBtn"), "click", hideError);
  on($("locRetryBtn"), "click", requestLocation);
  on($("retryListsBtn"), "click", loadLists);

  ["age","eta","onsetHours"].forEach(function (id) {
    on($(id), "input", function () {
      var rows = { age: "ageChips", eta: "etaChips", onsetHours: "onsetChips" };
      var row = $(rows[id]);
      if (!row) return;
      var chips = row.querySelectorAll(".chip");
      var value = $(id).value;
      for (var c = 0; c < chips.length; c++) {
        var attr = chips[c].getAttribute("data-age") || chips[c].getAttribute("data-eta") || chips[c].getAttribute("data-onset");
        chips[c].className = (attr === value) ? "chip chip-xs is-on" : "chip chip-xs";
      }
    });
  });

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("online", updateNetPill);
    window.addEventListener("offline", updateNetPill);
  }

  renderPhotoGrid();
  refreshVitals();
  loadLists();
  requestLocation();
  updateSubmitHint();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}

/* ── 19. Exports ───────────────────────────────────────────── */

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getBandFor: getBandFor,
    isOutOfRange: isOutOfRange,
    buildPayload: buildPayload,
    toNumberOrNull: toNumberOrNull,
    toTextOrNull: toTextOrNull,
    BANDS: BANDS,
    LEVELS: LEVELS,
    RANGES: RANGES,
    DEMO_CASE_TYPES: DEMO_CASE_TYPES,
    MAX_IMAGES: MAX_IMAGES
  };
}

if (typeof window !== "undefined") {
  window.__GH = {
    getBandFor: getBandFor,
    buildPayload: buildPayload,
    gatherForm: gatherForm,
    submitLoop: submitLoop,
    resetForm: resetForm,
    requestLocation: requestLocation,
    addImage: addImage,
    updateRadius: updateRadius,
    updateStatusChip: updateStatusChip,
    pollStatus: pollStatus,
    showBroadcast: showBroadcast,
    stopPolling: stopPolling,
    state: function () {
      return {
        selected: selected, fastState: fastState, images: attachedImages,
        location: locationState, caseTypes: caseTypes, demo: DEMO,
        requestId: currentRequestId, lastPayload: lastPayload
      };
    }
  };
}
