/* ============================================================
   GoldenHour — unit tests (pure logic, no DOM)
   Run:  node tests/test.js
   ============================================================ */

var assert = require("assert");
var app = require("../www/app.js");

var getBandFor = app.getBandFor;
var isOutOfRange = app.isOutOfRange;
var buildPayload = app.buildPayload;
var toNumberOrNull = app.toNumberOrNull;
var toTextOrNull = app.toTextOrNull;

var passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + e.message); }
}
function group(title) { console.log("\n" + title); }

/* ── Bands ─────────────────────────────────────────────────── */

function band(key, pairs) {
  Object.keys(pairs).forEach(function (value) {
    var expected = pairs[value];
    check(key + " " + value + " → " + expected, function () {
      assert.strictEqual(getBandFor(key, Number(value)), expected);
    });
  });
}

group("Systolic BP bands");
band("systolicBp", {
  40: "critical", 89: "critical", 90: "caution", 99: "caution",
  100: "good", 139: "good", 140: "caution", 179: "caution",
  180: "critical", 300: "critical"
});
check("systolicBp 301 is out of range → null", function () {
  assert.strictEqual(getBandFor("systolicBp", 301), null);
  assert.strictEqual(isOutOfRange("systolicBp", 301), true);
});
check("systolicBp 39 is out of range → null", function () {
  assert.strictEqual(getBandFor("systolicBp", 39), null);
});

group("Diastolic BP bands (now coloured — v2 left it colourless)");
band("diastolicBp", {
  49: "critical", 50: "caution", 59: "caution", 60: "good",
  89: "good", 90: "caution", 119: "caution", 120: "critical"
});

group("Heart rate bands");
band("heartRate", {
  49: "critical", 50: "caution", 59: "caution", 60: "good",
  100: "good", 101: "caution", 120: "caution", 121: "critical"
});

group("Respiratory rate bands (new in v3)");
band("respRate", {
  8: "critical", 9: "caution", 11: "caution", 12: "good",
  20: "good", 21: "caution", 29: "caution", 30: "critical"
});

group("SpO2 bands");
band("spo2", { 50: "critical", 89: "critical", 90: "caution", 94: "caution", 95: "good", 100: "good" });
check("spo2 101 is impossible → null, not caution", function () {
  assert.strictEqual(getBandFor("spo2", 101), null);
  assert.strictEqual(isOutOfRange("spo2", 101), true);
});

group("Glucose bands");
band("glucose", {
  59: "critical", 60: "caution", 69: "caution", 70: "good",
  140: "good", 141: "caution", 249: "caution", 250: "critical"
});

group("Band edge cases");
check("blank string → null", function () { assert.strictEqual(getBandFor("heartRate", ""), null); });
check("null → null", function () { assert.strictEqual(getBandFor("heartRate", null), null); });
check("undefined → null", function () { assert.strictEqual(getBandFor("heartRate", undefined), null); });
check("non-numeric → null", function () { assert.strictEqual(getBandFor("heartRate", "abc"), null); });
check("unknown band key → null", function () { assert.strictEqual(getBandFor("temperature", 37), null); });
check("string numbers work like numbers", function () { assert.strictEqual(getBandFor("heartRate", "130"), "critical"); });
check("blank is never out of range", function () { assert.strictEqual(isOutOfRange("heartRate", ""), false); });

/* ── Value coercion ────────────────────────────────────────── */

group("toNumberOrNull");
check("blank → null", function () { assert.strictEqual(toNumberOrNull(""), null); });
check("null → null", function () { assert.strictEqual(toNumberOrNull(null), null); });
check("undefined → null", function () { assert.strictEqual(toNumberOrNull(undefined), null); });
check("'abc' → null", function () { assert.strictEqual(toNumberOrNull("abc"), null); });
check("'0' → 0 (a real, dangerous reading — never null)", function () { assert.strictEqual(toNumberOrNull("0"), 0); });
check("0 → 0", function () { assert.strictEqual(toNumberOrNull(0), 0); });
check("'12.5' → 12.5", function () { assert.strictEqual(toNumberOrNull("12.5"), 12.5); });

group("toTextOrNull");
check("whitespace → null", function () { assert.strictEqual(toTextOrNull("   "), null); });
check("' A+ ' → 'A+'", function () { assert.strictEqual(toTextOrNull(" A+ "), "A+"); });
check("null → null", function () { assert.strictEqual(toTextOrNull(null), null); });

/* ── Payload ───────────────────────────────────────────────── */

group("Payload — full stroke case, exact shape");
var strokeForm = {
  caseTypeId: "12", category: "STROKE",
  age: "34", gender: "M", bloodGroup: "O+",
  systolicBp: "82", diastolicBp: "50", heartRate: "132",
  respRate: "26", spo2: "87", glucose: "",
  consciousness: "Semi-Conscious",
  lat: 12.9716, lng: 77.5946, accuracy: 18,
  radiusKm: 15,
  images: ["data:image/jpeg;base64,AAA"],
  eta: "12", notes: " entrapped 20 min ", ambulanceId: "KA01AB1234",
  face: false, arm: true, speech: true, onsetHours: "2.5"
};
var strokePayload = buildPayload(strokeForm);

check("exact deep-equal", function () {
  assert.deepStrictEqual(strokePayload, {
    case_type_id: 12,
    age: 34,
    gender: "M",
    blood_group: "O+",
    vitals: { systolic_bp: 82, diastolic_bp: 50, heart_rate: 132, resp_rate: 26, spo2: 87, glucose: null },
    consciousness: "Semi-Conscious",
    origin: { lat: 12.9716, lng: 77.5946, accuracy_m: 18 },
    broadcast_radius_km: 15,
    images: ["data:image/jpeg;base64,AAA"],
    eta_minutes: 12,
    notes: "entrapped 20 min",
    ambulance_id: "KA01AB1234",
    stroke_assessment: { face: false, arm: true, speech: true, onset_hours: 2.5 }
  });
});
check("blank glucose is null, never 0", function () {
  assert.strictEqual(strokePayload.vitals.glucose, null);
  assert.notStrictEqual(strokePayload.vitals.glucose, 0);
});
check("every vital key is always present", function () {
  ["systolic_bp","diastolic_bp","heart_rate","resp_rate","spo2","glucose"].forEach(function (k) {
    assert.ok(Object.prototype.hasOwnProperty.call(strokePayload.vitals, k), "missing " + k);
  });
});

group("Payload — invariants");
var traumaPayload = buildPayload({
  caseTypeId: "1", category: "TRAUMA", lat: 12.9, lng: 77.5, radiusKm: 25,
  face: true, arm: true, speech: true, onsetHours: "3"
});
check("stroke_assessment absent for a non-stroke case", function () {
  assert.strictEqual(Object.prototype.hasOwnProperty.call(traumaPayload, "stroke_assessment"), false);
});
check("FAST answers are ignored entirely when the case isn't STROKE", function () {
  assert.strictEqual(JSON.stringify(traumaPayload).indexOf("onset_hours"), -1);
});
check("'priority' never appears anywhere", function () {
  assert.strictEqual(JSON.stringify(strokePayload).indexOf("priority"), -1);
  assert.strictEqual(JSON.stringify(traumaPayload).indexOf("priority"), -1);
});
check("'destination_hospital_ids' never appears (no hospital picker in v3)", function () {
  assert.strictEqual(JSON.stringify(strokePayload).indexOf("destination_hospital"), -1);
  assert.strictEqual(JSON.stringify(traumaPayload).indexOf("hospital_ids"), -1);
});
check("origin + broadcast_radius_km are what the backend matches on", function () {
  assert.strictEqual(traumaPayload.origin.lat, 12.9);
  assert.strictEqual(traumaPayload.origin.lng, 77.5);
  assert.strictEqual(traumaPayload.broadcast_radius_km, 25);
});

group("Payload — defaults");
var bare = buildPayload({});
check("radius falls back to 15 km", function () { assert.strictEqual(bare.broadcast_radius_km, 15); });
check("gender falls back to 'U'", function () { assert.strictEqual(bare.gender, "U"); });
check("images defaults to an empty array", function () { assert.deepStrictEqual(bare.images, []); });
check("origin is present even with no fix", function () {
  assert.deepStrictEqual(bare.origin, { lat: null, lng: null, accuracy_m: null });
});
check("empty notes / unit id become null, not ''", function () {
  assert.strictEqual(bare.notes, null);
  assert.strictEqual(bare.ambulance_id, null);
});
check("buildPayload(undefined) does not throw", function () { assert.ok(buildPayload()); });

group("Payload — images");
check("images are capped at " + app.MAX_IMAGES, function () {
  var many = buildPayload({ images: ["a","b","c","d","e","f"] });
  assert.strictEqual(many.images.length, app.MAX_IMAGES);
});
check("images array is copied, not shared with the form", function () {
  var src = ["a"];
  var p = buildPayload({ images: src });
  src.push("b");
  assert.strictEqual(p.images.length, 1);
});
check("a non-array images value is ignored safely", function () {
  assert.deepStrictEqual(buildPayload({ images: "nope" }).images, []);
});

group("Reference data");
check("demo case list has 33 entries", function () {
  assert.strictEqual(app.DEMO_CASE_TYPES.length, 33);
});
check("every demo case type has id, category and label", function () {
  app.DEMO_CASE_TYPES.forEach(function (c) {
    assert.ok(typeof c.id === "number", "bad id");
    assert.ok(typeof c.category === "string" && c.category.length > 0, "bad category");
    assert.ok(typeof c.label === "string" && c.label.length > 0, "bad label");
  });
});
check("case-type ids are unique", function () {
  var seen = {};
  app.DEMO_CASE_TYPES.forEach(function (c) {
    assert.ok(!seen[c.id], "duplicate id " + c.id);
    seen[c.id] = true;
  });
});
check("exactly 6 quick-pick case types", function () {
  assert.strictEqual(app.DEMO_CASE_TYPES.filter(function (c) { return c.quick; }).length, 6);
});
check("at least one STROKE case type exists (drives the FAST panel)", function () {
  assert.ok(app.DEMO_CASE_TYPES.some(function (c) { return c.category === "STROKE"; }));
});

/* ── Result ────────────────────────────────────────────────── */

console.log("\n" + (failed === 0 ? "PASS" : "FAIL") + " — " + passed + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
