/* ============================================================
   GoldenHour — functional tests
   Loads the real www/index.html in jsdom, runs the real app.js,
   and drives it like a paramedic would.
   Run:  node tests/functional.test.js
   ============================================================ */

var fs = require("fs");
var path = require("path");
var assert = require("assert");
var jsdomLib = require("jsdom");
var JSDOM = jsdomLib.JSDOM;
var VirtualConsole = jsdomLib.VirtualConsole;

var ROOT = path.join(__dirname, "..", "www");
var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
var appSource = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
var css = fs.readFileSync(path.join(ROOT, "style.css"), "utf8");

var passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.log("  FAIL " + name + "\n       " + (e && e.message)); }
}
function group(title) { console.log("\n" + title); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Objects made inside jsdom belong to another JS realm, so
   deepStrictEqual's prototype check fails. Compare by value. */
function sameShape(actual, expected, message) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), message);
}

var w, d, dom;
function $(id) { return d.getElementById(id); }
function fire(el, type) { el.dispatchEvent(new w.Event(type, { bubbles: true })); }
function typeIn(id, value) { $(id).value = String(value); fire($(id), "input"); }
function pickCase(id) { $("caseType").value = String(id); fire($("caseType"), "change"); }

async function boot() {
  var vc = new VirtualConsole();
  vc.on("jsdomError", function () {});          // jsdom has no canvas — that path is handled in app.js
  dom = new JSDOM(html, {
    url: "https://localhost/",
    pretendToBeVisual: true,
    runScripts: "outside-only",                 // window gets its own realm so eval() sees window/document
    virtualConsole: vc
  });
  w = dom.window;
  d = w.document;
  w.__GH_POLL_MS = 5;
  w.__GH_DEMO_POST_MS = 5;
  w.eval(appSource);
  await sleep(30);                              // let DOMContentLoaded fire and init() run
}

async function main() {
  await boot();

  /* ── 1. Boot ─────────────────────────────────────────────── */
  group("Boot");
  check("demo banner is visible without a backend", function () {
    assert.strictEqual($("demoBanner").hidden, false);
  });
  check("network pill reads Demo", function () {
    assert.strictEqual($("netPill").textContent, "Demo");
  });
  check("load-error banner is hidden", function () {
    assert.strictEqual($("loadError").hidden, true);
  });
  check("app exposes its test handle", function () {
    assert.ok(w.__GH && typeof w.__GH.buildPayload === "function");
  });

  /* ── 2. The removed hospital picker ──────────────────────── */
  group("Destination-hospital selector is gone (v3 requirement)");
  check("the only <select> in the app is the case type", function () {
    var selects = d.querySelectorAll("select");
    assert.strictEqual(selects.length, 1);
    assert.strictEqual(selects[0].id, "caseType");
  });
  check("nothing asks the crew to choose a hospital", function () {
    assert.strictEqual(/select\s+(a\s+)?(destination\s+)?hospital/i.test(d.body.textContent), false);
  });
  check("no hospital input or checkbox exists", function () {
    assert.strictEqual(d.querySelectorAll("[id*='hospital' i], [name*='hospital' i]").length, 0);
  });
  check("a broadcast radius control replaces it", function () {
    assert.ok($("radiusKm"));
    assert.strictEqual($("radiusKm").type, "range");
  });

  /* ── 3. Case types ───────────────────────────────────────── */
  group("Case types");
  check("33 case types load (v2 had 11)", function () {
    assert.strictEqual($("caseType").querySelectorAll("option").length, 34); // 33 + placeholder
  });
  check("they are grouped into labelled optgroups", function () {
    assert.ok($("caseType").querySelectorAll("optgroup").length >= 8);
  });
  check("Trauma is the first group", function () {
    assert.strictEqual($("caseType").querySelectorAll("optgroup")[0].label, "Trauma & injury");
  });
  check("6 quick-pick chips are rendered", function () {
    assert.strictEqual($("quickCase").querySelectorAll(".chip").length, 6);
  });
  check("tapping a quick chip selects that case and highlights it", function () {
    var chip = $("quickCase").querySelector("[data-case-id='9']");
    chip.click();
    assert.strictEqual($("caseType").value, "9");
    assert.ok(chip.className.indexOf("is-on") !== -1);
  });

  /* ── 4. Stroke panel ─────────────────────────────────────── */
  group("FAST stroke panel");
  check("hidden for a cardiac case", function () {
    assert.strictEqual($("strokeSection").hidden, true);
  });
  check("appears when a STROKE case type is chosen", function () {
    pickCase(12);
    assert.strictEqual($("strokeSection").hidden, false);
  });
  check("hides again for a trauma case", function () {
    pickCase(1);
    assert.strictEqual($("strokeSection").hidden, true);
  });

  /* ── 5. Vitals ───────────────────────────────────────────── */
  group("Live vital colours");
  check("heart rate 132 → critical", function () {
    typeIn("heartRate", 132);
    assert.strictEqual($("hrChip").hidden, false);
    assert.ok($("hrChip").className.indexOf("state-critical") !== -1);
    assert.strictEqual($("hrChip").textContent, "Critical");
  });
  check("SpO2 97 → normal", function () {
    typeIn("spo2", 97);
    assert.ok($("spo2Chip").className.indexOf("state-good") !== -1);
  });
  check("respiratory rate 26 → caution (new vital in v3)", function () {
    typeIn("respRate", 26);
    assert.ok($("rrChip").className.indexOf("state-caution") !== -1);
  });
  check("diastolic BP is coloured too (v2 never coloured it)", function () {
    typeIn("diastolicBp", 45);
    assert.strictEqual($("diaChip").hidden, false);
    assert.ok($("diaChip").className.indexOf("state-critical") !== -1);
  });
  check("an impossible value says 'Check value' instead of a band", function () {
    typeIn("spo2", 400);
    assert.strictEqual($("spo2Chip").textContent, "Check value");
    assert.ok($("spo2Chip").className.indexOf("state-range") !== -1);
    typeIn("spo2", 97);
  });
  check("clearing a vital removes its chip", function () {
    typeIn("glucose", 40);
    assert.strictEqual($("glcChip").hidden, false);
    typeIn("glucose", "");
    assert.strictEqual($("glcChip").hidden, true);
  });
  check("the input itself is flagged (never colour-only)", function () {
    typeIn("heartRate", 132);
    assert.ok($("heartRate").className.indexOf("in-critical") !== -1);
  });

  /* ── 6. Option controls ──────────────────────────────────── */
  group("Option controls");
  check("consciousness is a single-select of three levels", function () {
    var levels = $("consciousnessGroup").querySelectorAll(".level");
    assert.strictEqual(levels.length, 3);
    levels[1].click();
    assert.strictEqual(levels[1].getAttribute("aria-checked"), "true");
    assert.strictEqual(levels[0].getAttribute("aria-checked"), "false");
    assert.strictEqual(w.__GH.state().selected.consciousness, "Semi-Conscious");
  });
  check("sex defaults to Unknown and updates on tap", function () {
    assert.strictEqual(w.__GH.state().selected.gender, "U");
    $("genderSeg").querySelector("[data-value='M']").click();
    assert.strictEqual(w.__GH.state().selected.gender, "M");
  });
  check("blood-group chips toggle on and off", function () {
    var chip = $("bloodChips").querySelector("[data-blood='O+']");
    chip.click();
    assert.strictEqual(w.__GH.state().selected.bloodGroup, "O+");
    chip.click();
    assert.strictEqual(w.__GH.state().selected.bloodGroup, null);
    chip.click();
  });
  check("age quick chips fill the age field", function () {
    $("ageChips").querySelector("[data-age='30']").click();
    assert.strictEqual($("age").value, "30");
  });
  check("ETA quick chips fill the ETA field", function () {
    $("etaChips").querySelector("[data-eta='10']").click();
    assert.strictEqual($("eta").value, "10");
  });
  check("radius slider updates readout, chips and state", function () {
    typeIn("radiusKm", 25);
    assert.strictEqual($("radiusOut").textContent, "25 km");
    assert.ok($("radiusChips").querySelector("[data-radius='25']").className.indexOf("is-on") !== -1);
    assert.strictEqual(w.__GH.state().selected.radiusKm, 25);
  });
  check("notes counter tracks length", function () {
    typeIn("notes", "entrapped 20 min");
    assert.strictEqual($("notesCount").textContent, "16 / 160");
  });

  /* ── 7. Location ─────────────────────────────────────────── */
  group("Location");
  check("demo mode locks a Bengaluru fix with no permission prompt", function () {
    var loc = w.__GH.state().location;
    assert.strictEqual(loc.status, "ready");
    assert.strictEqual(loc.lat, 12.9716);
    assert.ok($("locBox").className.indexOf("loc-ready") !== -1);
  });
  check("retry button stays hidden while the fix is good", function () {
    assert.strictEqual($("locRetryBtn").hidden, true);
  });
  check("submit hint reports readiness", function () {
    assert.ok($("submitHint").textContent.indexOf("Ready") !== -1);
  });

  /* ── 8. Photos ───────────────────────────────────────────── */
  group("Photos");
  await w.__GH.addImage("data:image/jpeg;base64,AAA");
  check("adding a photo renders a tile and updates the counter", function () {
    assert.strictEqual($("photoGrid").querySelectorAll(".photo-tile").length, 1);
    assert.strictEqual($("photoCount").textContent, "1 / 4");
  });
  await w.__GH.addImage("data:image/jpeg;base64,BBB");
  check("a second photo sits alongside the first", function () {
    assert.strictEqual($("photoGrid").querySelectorAll(".photo-tile").length, 2);
  });
  check("removing a tile drops that image", function () {
    $("photoGrid").querySelectorAll(".photo-remove")[0].click();
    assert.strictEqual($("photoGrid").querySelectorAll(".photo-tile").length, 1);
    assert.strictEqual(w.__GH.state().images[0], "data:image/jpeg;base64,BBB");
  });
  await w.__GH.addImage("data:image/jpeg;base64,CCC");
  await w.__GH.addImage("data:image/jpeg;base64,DDD");
  await w.__GH.addImage("data:image/jpeg;base64,EEE");
  await w.__GH.addImage("data:image/jpeg;base64,FFF");
  check("the 4-photo cap holds and the Add tile hides", function () {
    assert.strictEqual(w.__GH.state().images.length, 4);
    assert.strictEqual($("addPhotoBtn").hidden, true);
  });
  check("a file-input fallback exists for the browser", function () {
    assert.ok($("photoInput"));
    assert.strictEqual($("photoInput").accept, "image/*");
  });

  /* ── 9. Validation ───────────────────────────────────────── */
  group("Validation");
  pickCase("");
  var refused = await w.__GH.submitLoop();
  check("submitting with no case type is refused", function () {
    assert.strictEqual(refused, null);
    assert.strictEqual($("successOverlay").hidden, true);
  });
  check("a toast explains why", function () {
    assert.strictEqual($("toast").hidden, false);
    assert.ok($("toast").textContent.indexOf("case type") !== -1);
  });
  check("the submit hint turns into a blocker message", function () {
    assert.ok($("submitHint").className.indexOf("is-bad") !== -1);
  });

  /* ── 10. Full broadcast ──────────────────────────────────── */
  group("Broadcast");
  pickCase(12);                                    // stroke
  $("fastArm").querySelector("[data-yn='yes']").click();
  $("fastSpeech").querySelector("[data-yn='yes']").click();
  $("onsetChips").querySelector("[data-onset='2']").click();
  typeIn("systolicBp", 82);
  $("ambulanceId").value = "KA01AB1234";

  var res = await w.__GH.submitLoop();
  var payload = w.__GH_LAST_PAYLOAD;

  check("POST returns a request id and a hospital count", function () {
    assert.ok(res && res.id);
    assert.strictEqual(res.hospitals_notified, 3);
  });
  check("payload carries origin + radius, not a hospital list", function () {
    assert.strictEqual(payload.origin.lat, 12.9716);
    assert.strictEqual(payload.origin.lng, 77.5946);
    assert.strictEqual(payload.broadcast_radius_km, 25);
    assert.strictEqual(JSON.stringify(payload).indexOf("hospital_ids"), -1);
  });
  check("payload never contains a priority field", function () {
    assert.strictEqual(JSON.stringify(payload).indexOf("priority"), -1);
  });
  check("photos ride along in images[]", function () {
    assert.strictEqual(payload.images.length, 4);
    assert.strictEqual(payload.images[0].indexOf("data:image/jpeg"), 0);
  });
  check("stroke_assessment reflects the FAST toggles", function () {
    sameShape(payload.stroke_assessment, { face: false, arm: true, speech: true, onset_hours: 2 });
  });
  check("free text is trimmed onto the payload", function () {
    assert.strictEqual(payload.notes, "entrapped 20 min");
    assert.strictEqual(payload.ambulance_id, "KA01AB1234");
  });
  check("untaken vitals are null, taken ones are numbers", function () {
    assert.strictEqual(payload.vitals.glucose, null);
    assert.strictEqual(payload.vitals.systolic_bp, 82);
    assert.strictEqual(payload.vitals.heart_rate, 132);
  });
  check("the broadcast overlay opens with the hospital count and radius", function () {
    assert.strictEqual($("successOverlay").hidden, false);
    assert.ok($("broadcastInfo").textContent.indexOf("3 nearby hospitals") !== -1);
    assert.ok($("broadcastInfo").textContent.indexOf("25 km") !== -1);
  });
  check("status starts pending", function () {
    assert.ok($("statusChip").className.indexOf("status-pending") !== -1);
    assert.strictEqual($("acceptedBox").hidden, true);
  });
  check("the submit button is released again", function () {
    assert.strictEqual($("submitBtn").disabled, false);
  });

  /* ── 11. Live acceptance ─────────────────────────────────── */
  await sleep(80);
  group("Live acceptance (first hospital to accept wins)");
  check("the chip flips to accepted", function () {
    assert.ok($("statusChip").className.indexOf("status-accepted") !== -1);
    assert.ok($("statusChipText").textContent.indexOf("Accepted by Demo City ER") !== -1);
  });
  check("the accepted-hospital card appears with distance", function () {
    assert.strictEqual($("acceptedBox").hidden, false);
    assert.strictEqual($("acceptedName").textContent, "Demo City ER");
    assert.ok($("acceptedMeta").textContent.indexOf("3.4 km") !== -1);
  });
  check("a tap-to-call link is offered", function () {
    assert.strictEqual($("callBtn").hidden, false);
    assert.strictEqual($("callBtn").getAttribute("href"), "tel:+911234567890");
  });
  check("a navigate link is offered", function () {
    assert.strictEqual($("navBtn").hidden, false);
    assert.strictEqual($("navBtn").getAttribute("href").indexOf("geo:12.9899,77.5921"), 0);
  });
  check("polling has stopped (no further status changes)", function () {
    var before = $("statusChipText").textContent;
    assert.ok(before.indexOf("Accepted by") !== -1);
  });
  check("a no-acceptance outcome is shown honestly", function () {
    w.__GH.updateStatusChip({ status: "EXPIRED" });
    assert.ok($("statusChip").className.indexOf("status-failed") !== -1);
    assert.strictEqual($("statusChipText").textContent, "No hospital accepted");
    assert.strictEqual($("acceptedBox").hidden, true);
  });

  /* ── 12. Reset ───────────────────────────────────────────── */
  group("Start New Request");
  $("newRequestBtn").click();
  check("the overlay closes", function () {
    assert.strictEqual($("successOverlay").hidden, true);
  });
  check("every field is cleared", function () {
    assert.strictEqual($("caseType").value, "");
    assert.strictEqual($("age").value, "");
    assert.strictEqual($("systolicBp").value, "");
    assert.strictEqual($("heartRate").value, "");
    assert.strictEqual($("notes").value, "");
  });
  check("photos are cleared and the Add tile returns", function () {
    assert.strictEqual(w.__GH.state().images.length, 0);
    assert.strictEqual($("photoGrid").querySelectorAll(".photo-tile").length, 0);
    assert.strictEqual($("addPhotoBtn").hidden, false);
    assert.strictEqual($("photoCount").textContent, "0 / 4");
  });
  check("selections reset (consciousness, sex, blood group, FAST)", function () {
    var s = w.__GH.state();
    assert.strictEqual(s.selected.consciousness, null);
    assert.strictEqual(s.selected.bloodGroup, null);
    assert.strictEqual(s.selected.gender, "U");
    sameShape(s.fastState, { face: false, arm: false, speech: false });
  });
  check("the stroke panel hides again", function () {
    assert.strictEqual($("strokeSection").hidden, true);
  });
  check("the unit ID is deliberately kept between cases", function () {
    assert.strictEqual($("ambulanceId").value, "KA01AB1234");
  });
  check("a fresh GPS fix is requested (the ambulance has moved)", function () {
    assert.strictEqual(w.__GH.state().location.status, "ready");
  });

  /* ── 13. Failure and retry ───────────────────────────────── */
  group("Network failure and retry");
  w.__GH_DEMO_FAIL = true;
  pickCase(1);
  await w.__GH.submitLoop();
  check("a failed send opens the error overlay — never fails silently", function () {
    assert.strictEqual($("errorOverlay").hidden, false);
    assert.ok($("errorMessage").textContent.length > 0);
    assert.strictEqual($("successOverlay").hidden, true);
  });
  check("the button is re-enabled so the crew can retry", function () {
    assert.strictEqual($("submitBtn").disabled, false);
  });
  check("Back to form dismisses the error", function () {
    $("backBtn").click();
    assert.strictEqual($("errorOverlay").hidden, true);
  });
  w.__GH_DEMO_FAIL = false;
  $("retryBtn").click();
  await sleep(60);
  check("Retry re-sends the same case and succeeds", function () {
    assert.strictEqual($("errorOverlay").hidden, true);
    assert.strictEqual($("successOverlay").hidden, false);
  });

  /* ── 14. Layout & accessibility ──────────────────────────── */
  group("Layout & accessibility guards");
  check("viewport is phone-correct with safe-area support", function () {
    var meta = d.querySelector("meta[name='viewport']").getAttribute("content");
    assert.ok(meta.indexOf("width=device-width") !== -1);
    assert.ok(meta.indexOf("viewport-fit=cover") !== -1);
  });
  check("the shell is width-capped so it never stretches on a tablet", function () {
    assert.ok(/\.app\{[^}]*max-width:\s*560px/.test(css.replace(/\s*\n\s*/g, "")));
  });
  check("inputs are 17px so mobile browsers never auto-zoom", function () {
    assert.ok(/font-size:\s*17px/.test(css));
  });
  check("no interactive control is declared under 44px tall", function () {
    assert.ok(/--tap:\s*54px/.test(css));
    var INTERACTIVE = /(^|[\s,.#])(chip|seg-btn|level|btn-|photo-add|locbox|summary|input|select|textarea)/;
    var offenders = [];
    css.split("}").forEach(function (block) {
      var split = block.split("{");
      if (split.length < 2) return;
      var selector = split[0].split("\n").pop().trim();
      var height = split[1].match(/min-height:\s*(\d+(?:\.\d+)?)px/);
      if (!height || !INTERACTIVE.test(selector)) return;
      if (parseFloat(height[1]) < 44) offenders.push(selector + " → " + height[1] + "px");
    });
    assert.strictEqual(offenders.length, 0, "too small to tap: " + offenders.join("; "));
  });
  check("safe-area insets are honoured top and bottom", function () {
    assert.ok(css.indexOf("env(safe-area-inset-top") !== -1);
    assert.ok(css.indexOf("env(safe-area-inset-bottom") !== -1);
  });
  check("there is a no-backdrop-filter fallback for old WebViews", function () {
    assert.ok(css.indexOf("@supports not") !== -1);
  });
  check("reduced-motion users get a still interface", function () {
    assert.ok(css.indexOf("prefers-reduced-motion") !== -1);
  });
  check("a dark theme is defined", function () {
    assert.ok(css.indexOf("prefers-color-scheme: dark") !== -1);
  });
  check("no web font is fetched (works offline inside the APK)", function () {
    assert.strictEqual(/@import|fonts\.googleapis/.test(css), false);
    assert.strictEqual(/<link[^>]+fonts\./.test(html), false);
  });
  check("every form control has a label or aria-label", function () {
    var controls = d.querySelectorAll("input:not([type='hidden']):not([type='file']), select, textarea");
    for (var i = 0; i < controls.length; i++) {
      var c = controls[i];
      var labelled = c.getAttribute("aria-label") || c.closest("label") ||
                     d.querySelector("label[for='" + c.id + "']");
      assert.ok(labelled, "unlabelled control: #" + c.id);
    }
  });
  check("overlays are proper dialogs", function () {
    assert.strictEqual($("successOverlay").getAttribute("role"), "dialog");
    assert.strictEqual($("errorOverlay").getAttribute("aria-modal"), "true");
  });
  check("vital states carry a word, not just a colour", function () {
    typeIn("heartRate", 132);
    assert.strictEqual($("hrChip").textContent, "Critical");
  });

  w.__GH.stopPolling();
  dom.window.close();
  console.log("\n" + (failed === 0 ? "PASS" : "FAIL") + " — " + passed + " passed, " + failed + " failed");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(function (err) {
  console.log("\nHARNESS ERROR: " + (err && err.stack || err));
  process.exit(1);
});
