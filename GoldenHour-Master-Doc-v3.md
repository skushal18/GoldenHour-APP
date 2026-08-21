# GoldenHour — Ambulance App: Master Document

**Version:** 3.0 (geo-broadcast · photos · liquid-glass UI · shipped code)
**Status:** Working prototype for Smart India Hackathon 2026
**Last updated:** 2026-08-20
**Supersedes:** v2.0

---

## 0. What changed since v2.0 — and what v2.0 was missing

v2.0 was a specification. It described files that did not exist yet, and a
few of the things it described were wrong. This version ships the code and
fixes the spec. Here is the honest list.

### 0.1 Missing entirely

| Gap in v2.0 | Fixed in v3.0 |
|---|---|
| **No actual code.** The doc described `www/`, `android/` and `tests/` in detail, but nothing was delivered. | The whole project ships: web app, Capacitor Android project, 170 automated checks. |
| **No way to actually get an APK** unless you already had Android Studio and the SDK. | A GitHub Actions workflow builds `app-debug.apk` in the cloud. Push, click Run, download. |
| **No respiratory rate.** One of the five vitals every prehospital protocol records. | Added, with its own colour band. |
| **No note field.** No way to say "entrapped 20 min" or "allergic to penicillin". | 160-character note, trimmed onto the payload. |
| **No ambulance identity.** The ER got a case with no idea which vehicle was coming. | Optional unit ID, remembered on the phone between cases. |
| **No range validation.** A fat-fingered SpO₂ of `900` was accepted with no signal at all. | Implausible values now show a grey **Check value** chip instead of a colour band, and the plausible ranges are published in `API.md` so the backend can reject them. The broadcast is never *blocked* over a typo — in an ambulance that would be the worse failure. |
| **No backend contract the other team could work from alone.** | `API.md` — a standalone document for the backend team. |
| **No demo failure path.** No way to show the error handling to a judge. | `window.__GH_DEMO_FAIL = true` simulates a network failure on demand. |
| **No accessibility story** beyond colour-blind vital chips. | Labels/aria on every control, reduced-motion support, a dark theme, and a 44 px floor on every tappable control (asserted by a test). |
| **No connectivity indicator.** | Online / Offline / Demo pill in the header. |

### 0.2 Wrong in v2.0

| v2.0 said | Why it was wrong | v3.0 |
|---|---|---|
| §9 band table: SpO₂ "101+ flagged caution" | Blood oxygen saturation cannot exceed 100 %. A reading of 101 is a typo, not a caution. | > 100 is out of range → "Check value", no band. |
| §9: systolic row had five columns but only four bands, and no high-critical value | The table was unusable as a spec — you could not implement from it. | Full five-band table with explicit inclusive boundaries (§9). |
| §9: "Diastolic BP is captured but never coloured" | Presented as a design decision. It was a gap — a diastolic of 40 is critical and the crew saw nothing. | Diastolic is banded like every other vital. |
| §6.2: "`buildPayload()` (§14 exact shape)" | §14 is *Demo Mode vs Live Mode*. The payload is §7.2. Broken cross-reference. | Cross-references checked; payload is §7.2 here too. |
| §6.5: `jsdom` listed as a dependency | It is a test-only tool; shipping it as a runtime dependency bloats installs. | `devDependencies`. |
| §6.2: "`resetForm()` … re-requests nothing" | The ambulance has *moved* since the last case. Reusing a stale GPS fix broadcasts to the wrong ring of hospitals. | Reset re-requests a fresh fix. |
| §13 manifest permissions | Missing `ACCESS_NETWORK_STATE`; no portrait lock; no `adjustResize`, so the Android keyboard covered the field being typed into. | All three fixed (§13). |
| §5: "goldenhour-apk/ (also shipped as gh-cap/)" | Two names for one project invites confusion in a student team. | One name: `goldenhour-apk/`. |
| 11 case types | Too thin for real ER routing — no paediatric, no allergic, no neurological category. | 33 case types across 11 categories (§7.1). |

### 0.3 Kept exactly as v2.0 had it

These were right and are unchanged: geo-broadcast instead of hospital
selection, first-accept-wins, blank vital → `null` never `0`,
`stroke_assessment` only for stroke cases, `priority` never sent by the app,
on-device photo compression, plain HTML/CSS/JS with no framework.

---

## 1. The problem

In Bangalore, ambulances routinely arrive at emergency rooms **with no advance
notice**. The ER has no time to prepare — no bed, no ventilator, no
specialist, no blood arranged. For time-critical patients (the "golden hour"
after trauma, stroke or cardiac arrest) every lost minute lowers survival
odds.

**The idea:** the ambulance tells the hospitals *before* it arrives. A
paramedic fills a fast, structured form on a phone. The case is broadcast to
every registered hospital nearby. A **separate hospital dashboard** (built by
another team, not part of this project) shows it live and lets staff
**accept**. The ER gets a head start; the crew learns where they are actually
going.

**Who uses this app:** the **paramedic in the ambulance**. It runs on their
own phone, often in a moving vehicle on a weak signal. Speed and reliability
of *fill form → broadcast → confirm* matter more than anything else.

---

## 2. The concept in one paragraph

GoldenHour is a **plain web app** (HTML/CSS/JS, no framework) inside an
Android wrapper (Capacitor). The paramedic opens it, fills a short structured
form — case type, age, vitals, consciousness, optional photos — and taps
**Broadcast Request**. The app sends the device's GPS position plus a search
radius. The backend finds **every registered hospital inside that radius** and
alerts them all at once. **The first hospital to accept claims the case**;
every other alert is cancelled. The ambulance screen live-updates to
**"✓ Accepted by [hospital]"**, with tap-to-call and navigate buttons.

---

## 3. System architecture

```
┌───────────────────────────┐          ┌────────────────────────────┐
│   AMBULANCE APP (this)    │          │   BACKEND (other team)     │
│   www/ — HTML/CSS/JS      │  POST    │   • receives /requests     │
│   wrapped by Capacitor    │ ───────► │   • haversine-matches      │
│   into an Android APK     │          │     hospitals in radius    │
│                           │          │   • fans out the alert     │
│   • GPS origin            │  GET     │   • first accept wins      │
│   • photos (compressed)   │ ◄─────── │   • cancels the rest       │
│   • 5 s status polling    │          │                            │
└───────────────────────────┘          └─────────────┬──────────────┘
                                                     │ notify + accept
                                                     ▼
                                    ┌────────────────────────────────┐
                                    │  HOSPITAL DASHBOARD            │
                                    │  (other team — NOT this repo)  │
                                    │  shows cases live, accepts     │
                                    └────────────────────────────────┘
```

**In scope:** the ambulance-side web app and its Android wrapper.
**Out of scope:** the hospital dashboard, the backend, authentication,
offline queueing, live ambulance tracking, chat.

---

## 4. Tech stack and constraints

| Item | Choice | Why |
|---|---|---|
| Language | Plain HTML/CSS/JS (no TypeScript) | A student team has to read and change it |
| Framework | None | An app this size does not need React |
| HTTP | `fetch()` only | No axios or other HTTP libraries |
| Android wrapper | Capacitor 8.5 | Wraps `www/` into an APK |
| Camera | `@capacitor/camera` 8.2 | Native camera / gallery |
| Geolocation | `@capacitor/geolocation` 8.2 | Native GPS |
| Fonts | System stack only | No web font fetch — works offline in the APK |
| Build step | None for the web app | Opens straight from the filesystem |
| Layout | Mobile-first, 100dvh shell | Header and submit bar pinned; only the middle scrolls |
| Theme | Light + dark, automatic | Follows the phone's setting |
| Priority | **Never chosen by the user** | Backend computes RED/AMBER/GREEN (§10) |

---

## 5. File tree

```
goldenhour-apk/
├── www/                        ← THE web app (source of truth)
│   ├── index.html              ← every screen and control
│   ├── app.js                  ← all logic (~1,230 lines, commented)
│   └── style.css               ← liquid-glass design system
├── capacitor.config.json       ← app id, name, webDir
├── package.json                ← scripts + dependencies
├── API.md                      ← standalone backend contract
├── README.md                   ← quick start
├── android/                    ← generated Capacitor project
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml ← permissions (hand-edited, §13)
│   │   └── assets/public/      ← COPY of www/ — what the APK runs
│   ├── capacitor.settings.gradle
│   └── gradlew
├── tests/
│   ├── test.js                 ← 90 unit checks
│   └── functional.test.js      ← 80 jsdom checks
└── .github/workflows/
    └── build-apk.yml           ← CI that produces app-debug.apk
```

Edit `www/`. Run `npx cap sync android` to copy it into the APK project.
Never edit `android/app/src/main/assets/public/` — sync overwrites it.

---

## 6. File-by-file walkthrough

### 6.1 `www/index.html`

Single page. One scrollable form plus two full-screen sheets.

**Shell:** a `100dvh` flex column — pinned header, scrolling middle, pinned
submit bar. The form never hides behind the button and the button is always
one thumb away.

**Header:** wordmark, tagline, and a status pill reading *Demo*, *Online* or
*Offline*.

**Form cards, in order:**

1. **Case** — six one-tap chips for the commonest emergencies (swipe for
   more), plus a grouped dropdown of all 33 types. Marked *Required*.
2. **Patient** — age (with Baby / Child / Adult / Elder quick chips), sex as a
   4-way segmented control defaulting to *Unknown*, blood group as an 8-chip
   grid that toggles off on a second tap.
3. **Consciousness** — three large stacked buttons with a colour dot and a
   plain-English subtitle: Conscious / Semi-conscious / Unconscious.
4. **Vitals** — BP (systolic / diastolic side by side), heart rate,
   respiratory rate, SpO₂, glucose. Each colours live as it is typed.
5. **FAST stroke check** (`strokeSection`) — hidden unless the chosen case
   type's category is `STROKE`. Face / Arm / Speech yes-no toggles plus time
   since onset, with quick chips.
6. **Photos** — up to 4 tiles, each removable, with a counter.
7. **Broadcast** — GPS status box with a retry button, a radius slider
   (2–40 km) with preset chips, and an optional ETA.
8. **Notes & unit ID** — collapsed by default. Free-text note (160 chars) and
   the ambulance's unit ID, remembered on the phone.

**Sheets:**

- `successOverlay` — "Request broadcast", the hospital count, a live status
  chip, and once accepted a hospital card with **Call ER** and **Navigate**.
- `errorOverlay` — "Couldn't send", with **Retry** (re-sends the identical
  case) and **Back to form**.

A toast strip handles short messages ("Pick a case type first").

### 6.2 `www/app.js`

Top to bottom:

- **`API_BASE`** — the one line to change before going live. While it contains
  `REPLACE-WITH-YOUR-BACKEND`, the app is in **demo mode**.
- **Reference data** — `CATEGORY_LABELS`, `CATEGORY_ORDER`, and
  `DEMO_CASE_TYPES` (33 entries). Used in demo mode, and also as the live-mode
  fallback if `GET /case-types` fails, so a list outage never blocks a
  broadcast.
- **`RANGES`** — plausible-entry limits per field. Outside them, a value is
  treated as a typo.
- **`BANDS` / `LEVELS`** — the vital colour bands (§9).
- **`getBandFor(key, value)`** → `"good" | "caution" | "critical" | null`.
- **`isOutOfRange(key, value)`** — drives the "Check value" chip.
- **`toNumberOrNull()` / `toTextOrNull()`** — blank → `null`, never `0`,
  never `""`.
- **`buildPayload(form)`** — pure function producing the exact §7.2 body.
- **Geolocation** — `isNative()`, `readPosition()` (Capacitor plugin, else
  `navigator.geolocation`), `requestLocation()` (demo mode uses a fixed
  Bengaluru fix and never prompts).
- **Photos** — `canvasAvailable()`, `compressImage()` (canvas resize to
  900 px, JPEG q0.6, with a 6-second bail-out), `renderPhotoGrid()`,
  `addImage()`, `addPhotoFromFile()`, `capturePhotos()` (Capacitor Camera
  prompt on Android, file picker in a browser).
- **Case types** — `populateCaseTypes()` (grouped optgroups in category
  order), `renderQuickCases()`, `loadLists()` (falls back to the built-in list
  and shows a retry banner on failure).
- **Live colours** — `applyVitalColour()`, `refreshVitals()`, `wireVitals()`.
- **Option wiring** — `wireSegmented()`, `wireBloodChips()`,
  `wireConsciousness()`, `wireFastToggles()`, `wireValueChips()`,
  `updateRadius()`, `updateStrokeSection()`.
- **Submit** — `gatherForm()`, `setBusy()`, `postRequest()`, `submitLoop()`
  (validates case type + GPS, blocks double-taps).
- **Live acceptance** — `showBroadcast()`, `startPolling()` / `stopPolling()`,
  `fetchStatus()`, `pollStatus()`, `updateStatusChip()`.
- **Errors** — `showError()`, `hideError()`, `retrySubmit()`.
- **`resetForm()`** — clears everything, keeps the unit ID, requests a fresh
  GPS fix.
- **`init()`** — wires every event, loads the list, gets a fix.
- **Exports** — `module.exports` for the unit tests; `window.__GH` for the
  functional tests.

### 6.3 `www/style.css` — the liquid-glass system

- **Tokens** for ink, brand, semantic colours, glass layers, radii, the 54 px
  tap target, spring easings, and safe-area insets — light and dark.
- **Ambient backdrop:** a fixed layered mesh gradient with three slow-drifting
  blurred blobs and a fine grain overlay.
- **Glass primitive:** `backdrop-filter: blur(30px) saturate(185%)` over a
  translucent gradient, a hairline light border, an inset top highlight, and a
  diagonal specular sheen via `::after`.
- **Old-WebView safety net:** `@supports not (backdrop-filter)` → solid cards,
  no blobs. Nothing becomes unreadable on an Android 7 device.
- **Vital states:** background colour **plus** a thicker border **plus** a word
  ("Critical") — never colour alone, so a colour-blind medic reads it fine.
- **Type:** system stack (SF Pro / Segoe Variable / Roboto), tightened
  tracking on headings, tabular rounded numerals for vitals. No web font is
  fetched, so it renders identically offline.
- **Touch:** 17 px inputs (below 16 px mobile browsers auto-zoom), 54 px
  primary controls, and a hard 44 px floor on every chip and secondary button
  — a functional test fails the build if any `min-height` drops below it.
- **Motion:** spring transitions on every tap; all of it disabled under
  `prefers-reduced-motion`.

### 6.4 `capacitor.config.json`

```json
{
  "appId": "com.goldenhour.app",
  "appName": "GoldenHour",
  "webDir": "www",
  "android": { "allowMixedContent": true, "backgroundColor": "#eef4fb" },
  "server": { "androidScheme": "https" },
  "plugins": { "Camera": { "androidxMaterialVersion": "1.12.0" } }
}
```

### 6.5 `package.json`

Dependencies: `@capacitor/core`, `@capacitor/android`, `@capacitor/camera`,
`@capacitor/geolocation`.
Dev dependencies: `@capacitor/cli`, `jsdom`.
Scripts: `test`, `test:unit`, `test:functional`, `cap:add`, `cap:sync`,
`cap:copy`, `cap:open`, `apk`.

### 6.6 `android/`

Generated by `npx cap add android`, with the manifest hand-edited (§13).
`capacitor.plugins.json` registers `CameraPlugin` and `GeolocationPlugin`;
`capacitor.settings.gradle` includes `:capacitor-android`,
`:capacitor-camera`, `:capacitor-geolocation`. Build with
`./gradlew assembleDebug`.

### 6.7 `tests/`

- `tests/test.js` — **90 unit checks**: every band boundary for all six
  vitals, out-of-range handling, blank → `null`, the exact payload shape,
  stroke-only `stroke_assessment`, no `priority`, no `destination_hospital_ids`,
  image capping, and reference-data sanity.
- `tests/functional.test.js` — **80 checks** driving the real `index.html` in
  jsdom: list rendering, quick chips, the FAST panel appearing and hiding,
  live colours, every option control, photo add/remove/cap, validation, a full
  submit, the live acceptance flip, reset, the failure-and-retry path, and
  layout/accessibility guards.

---

## 7. Data models and API contract

Full detail — including what the backend must do — is in **`API.md`**.
Summary here.

### 7.1 Case type — `GET /case-types`

```json
{ "id": 12, "category": "STROKE", "label": "Stroke / sudden weakness or slurred speech",
  "quick": true, "short": "Stroke" }
```

`quick` promotes a type to a one-tap chip; `short` is the chip's text.
Categories: `TRAUMA`, `CARDIAC`, `STROKE`, `NEURO`, `RESP`, `METABOLIC`,
`OBSTETRIC`, `PAEDIATRIC`, `POISONING`, `ALLERGY`, `OTHER`.

### 7.2 Outgoing payload — `POST /requests`

```json
{
  "case_type_id": 12,
  "age": 58,
  "gender": "M",
  "blood_group": "O+",
  "vitals": {
    "systolic_bp": 82, "diastolic_bp": 50, "heart_rate": 132,
    "resp_rate": 26, "spo2": 88, "glucose": null
  },
  "consciousness": "Semi-Conscious",
  "origin": { "lat": 12.9716, "lng": 77.5946, "accuracy_m": 18 },
  "broadcast_radius_km": 15,
  "images": ["data:image/jpeg;base64,…"],
  "eta_minutes": 12,
  "notes": "entrapped 20 min",
  "ambulance_id": "KA01AB1234",
  "stroke_assessment": { "face": false, "arm": true, "speech": true, "onset_hours": 2 }
}
```

**Hard rules, enforced by tests:**

- Blank vital → `null`. **Never `0`** — zero is a real, dangerous reading.
  Never omitted.
- `stroke_assessment` present **only** when the category is `STROKE`.
- `priority` **never** appears — the backend computes it.
- `destination_hospital_ids` does not exist — the backend resolves hospitals
  from `origin` + `broadcast_radius_km`.
- `images` is 0–4 compressed JPEG data-URLs (`[]` when there are none).

### 7.3 Status polling — `GET /requests/{id}`

```json
{ "id": 45, "status": "ACCEPTED", "accepted_by": "Manipal Hospital, Old Airport Road",
  "hospitals_notified": 3,
  "accepted_hospital": { "name": "…", "distance_km": 3.4, "eta_min": 9,
                         "phone": "+918025023700", "lat": 12.9591, "lng": 77.6488 } }
```

Statuses: `PENDING` (keep polling), `ACCEPTED` (stop, show the hospital),
`REJECTED` / `EXPIRED` / `CANCELLED` (stop, "No hospital accepted").
`phone` enables tap-to-call; `lat`/`lng` enable Navigate.

### 7.4 Backend responsibilities

1. Serve `GET /case-types`.
2. Accept `POST /requests` with the §7.2 body.
3. Haversine-match every registered hospital within `broadcast_radius_km` of
   `origin`.
4. Create one broadcast with **one pending row per hospital** and notify all
   of them.
5. On the first accept, **atomically** mark that row `ACCEPTED` and cancel
   every other row — in one transaction, so two hospitals can never both win.
6. Serve `GET /requests/{id}` with `status`, `accepted_by`,
   `hospitals_notified` and optionally `accepted_hospital`.

---

## 8. Screen-by-screen flow

1. **On load** — the app fetches case types (demo mode: built-in list),
   requests a GPS fix, and shows "Locating device…".
2. **Fill the form** — case type (required), then whatever the crew has time
   for. Every other field is optional and blank is a valid answer.
3. **Tap Broadcast Request** — validation: a case type must be chosen **and**
   the GPS fix must be ready. The button locks and reads "Broadcasting…" so a
   bump in the road cannot double-send.
4. **Success sheet** — "Sent to N nearby hospitals within R km", amber pulsing
   status chip.
5. **Live tracking** — the app polls every 5 s. On `ACCEPTED` the chip turns
   green, the hospital card slides in with distance and ETA, Call and Navigate
   appear, and polling stops. On rejection or expiry it says so plainly.
6. **Start New Request** — clears the form, keeps the unit ID, takes a fresh
   GPS fix.
7. **Failure** — the error sheet appears with **Retry** (identical payload) and
   **Back to form**. Nothing ever fails silently.

---

## 9. Vital-sign colour bands

Boundaries are inclusive. Outside the "valid range" column the value is
treated as a typo: no colour, and a grey **Check value** chip.

| Vital | Critical low | Caution low | Normal | Caution high | Critical high | Valid range |
|---|---|---|---|---|---|---|
| Systolic BP (mmHg) | ≤ 89 | 90–99 | 100–139 | 140–179 | ≥ 180 | 40–300 |
| Diastolic BP (mmHg) | ≤ 49 | 50–59 | 60–89 | 90–119 | ≥ 120 | 20–200 |
| Heart rate (bpm) | ≤ 49 | 50–59 | 60–100 | 101–120 | ≥ 121 | 20–300 |
| Respiratory rate (/min) | ≤ 8 | 9–11 | 12–20 | 21–29 | ≥ 30 | 4–80 |
| SpO₂ (%) | ≤ 89 | 90–94 | 95–100 | — | — | 50–100 |
| Glucose (mg/dL) | ≤ 59 | 60–69 | 70–140 | 141–249 | ≥ 250 | 10–900 |

Blank input → no colour, no chip. Every boundary in this table is asserted by
a unit test, so the table and the code cannot drift apart.

---

## 10. Priority (RED / AMBER / GREEN)

There is **no priority selector** in the form, by design. Priority is computed
**by the backend** from the vitals and the case type. The app never sends a
`priority` key, and a unit test fails the build if one ever appears. The
colours on screen are a bedside hint for the crew, not official triage.

---

## 11. Geo-broadcast and acceptance state machine

```
[GPS fix ready] → [POST /requests with origin + radius]
        │
        ▼
[Backend alerts every hospital inside the radius]
        │
        ├── Hospital A accepts ───► status = ACCEPTED, all others CANCELLED
        │                            App: "✓ Accepted by A" + Call + Navigate
        ├── All decline / timeout ─► status = REJECTED / EXPIRED
        │                            App: "No hospital accepted"
        └── Still waiting ─────────► status = PENDING (app polls again in 5 s)
```

A failed poll does not end the loop — the app simply tries again on the next
tick, which matters on a patchy mobile signal.

---

## 12. Photo handling

- Up to **4** photos per case.
- On Android: a Capacitor Camera prompt (take a photo or pick from the
  gallery). In a browser: the file picker, multi-select supported.
- Every photo is **compressed on the device** — canvas resize to 900 px on the
  long edge, JPEG quality 0.6 — before it is attached. This is the difference
  between a 4 MB upload and a ~80 KB one on a weak signal in a moving vehicle.
- If canvas is unavailable the original data-URL is used rather than failing.
- Sent as base64 data-URLs in `images[]`. A production backend should move to
  multipart upload (§18).

---

## 13. Android permissions

| Permission | Why |
|---|---|
| `INTERNET` | Send the case |
| `ACCESS_NETWORK_STATE` | Online / offline pill |
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | GPS origin for the broadcast |
| `CAMERA` | Photograph the injury or ECG strip |
| `READ_MEDIA_IMAGES` | Pick an existing photo (Android 13+) |
| `READ_EXTERNAL_STORAGE` (maxSdk 32) | Same, on Android 12 and below |
| `WRITE_EXTERNAL_STORAGE` (maxSdk 29) | Legacy camera capture paths |

Camera and GPS hardware are declared `required="false"` so the app installs
widely. The activity is locked to **portrait** and uses
`windowSoftInputMode="adjustResize"` so the keyboard pushes the form up
instead of covering it.

Package `com.goldenhour.app` · minSdk 24 · targetSdk 36.

---

## 14. Demo mode vs live mode

| | Demo mode | Live mode |
|---|---|---|
| Trigger | `API_BASE` still contains `REPLACE-WITH-YOUR-BACKEND` | `API_BASE` points at the real backend |
| Case types | 33 built-in samples | `GET /case-types`, falling back to the built-in list if that call fails |
| Location | Fixed Bengaluru fix, no permission prompt | Real GPS |
| Submit | Simulated, ~650 ms | `POST /requests` |
| Acceptance | "Demo City ER" on the second poll | Real `GET /requests/{id}` |
| Header pill | "Demo" | "Online" / "Offline" |

Demo hooks for a live presentation, set on `window` before `app.js` loads:
`__GH_DEMO_FAIL` (force a network failure), `__GH_POLL_MS`,
`__GH_DEMO_POST_MS`, `__GH_API_BASE`.

---

## 15. Build and run

### Browser (fastest)

Open `www/index.html`. Everything works in demo mode.

### APK via GitHub Actions — no Android Studio needed

1. Push this folder to a GitHub repository
2. **Actions** → **Build GoldenHour APK** → **Run workflow**
3. Download the `goldenhour-debug-apk` artifact
4. Unzip, move `app-debug.apk` to a phone, tap it, allow "Install unknown
   apps", open **GoldenHour**

### APK locally

Requires JDK 21 and the Android SDK (platform 36).

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

### Going live

1. Set `API_BASE` at the top of `www/app.js`
2. Implement the contract in `API.md`
3. `npx cap sync android` and rebuild

---

## 16. Testing

```bash
npm test        # 90 unit + 80 functional = 170 checks
```

**Unit (`tests/test.js`, 90):** every boundary of all six bands; out-of-range
detection; `toNumberOrNull` and `toTextOrNull`; the exact payload deep-equal;
`stroke_assessment` only for `STROKE`; no `priority`; no
`destination_hospital_ids`; image capping and array copying; defaults; demo
case-list integrity (unique ids, exactly six quick picks, a stroke type
exists).

**Functional (`tests/functional.test.js`, 80):** the real `index.html` in
jsdom — 33 grouped case types, quick chips, the vanished hospital selector
(asserted three ways), FAST show/hide, all six live vital colours including
diastolic and the out-of-range chip, consciousness/sex/blood/age/ETA/radius
controls, the notes counter, the demo GPS fix, photo add/remove/4-cap,
refusal to submit without a case type, a full stroke submit with payload
assertions, the pending → accepted flip with Call and Navigate, expiry, full
reset, network failure and retry, plus layout and accessibility guards
(viewport, 560 px shell cap, 17 px inputs, a 44 px floor on tap targets, safe-area insets,
`@supports` fallback, reduced motion, dark theme, no web fonts, every control
labelled, dialog roles).

CI runs both suites before it builds the APK, so a broken build never ships.

---

## 17. Glossary

- **Golden hour** — the critical first ~60 minutes after major trauma, stroke
  or cardiac arrest, when prompt care most improves the outcome.
- **Ambulance-side tool** — this app. Used by the paramedic, not the hospital.
- **Hospital dashboard** — the other team's screen where staff accept cases.
- **Broadcast** — one case sent to many hospitals at once; first accept wins.
- **FAST** — Face, Arm, Speech, Time. A 30-second stroke screen.
- **Vitals** — BP, heart rate, respiratory rate, SpO₂, glucose.
- **SpO₂** — blood oxygen saturation, as a percentage.
- **Haversine** — the formula for distance between two GPS points.
- **Data URL** — an image encoded as a base64 text string.
- **Capacitor** — the tool that wraps a web app into a native app.
- **Gradle** — the Android build system.
- **APK** — the Android package file you install.
- **jsdom** — a browser simulator for Node, used by the functional tests.
- **dvh** — dynamic viewport height; the CSS unit that accounts for mobile
  browser chrome.

---

## 18. Known limitations and next steps

- **Debug-signed APK.** Fine for testing and demos. Production needs a release
  keystore and `assembleRelease`.
- **Images as base64.** Fine for a prototype; a production backend should take
  multipart uploads so photos stream instead of inflating the JSON body by
  ~33 %.
- **No offline queue.** If the signal drops mid-send the request fails with a
  visible error and a Retry. A background queue that drains when signal
  returns is the highest-value next feature.
- **No authentication.** Any phone with the APK can broadcast. Production
  needs paramedic or vehicle identity — the optional unit ID is a placeholder,
  not a credential.
- **Polling, not push.** 5-second polling is simple and survives flaky
  networks. WebSocket or SSE would be snappier once the backend is stable.
- **Single GPS fix per case.** Taken when the form opens and refreshed on
  reset. Continuous tracking would let hospitals see the ambulance approach.
- **Backend and hospital dashboard** are the other teams' work, per `API.md`.
