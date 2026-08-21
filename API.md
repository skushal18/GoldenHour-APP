# GoldenHour — backend contract (v3)

Two endpoints. That's the whole surface the ambulance app touches.

Base URL is whatever you put in `API_BASE` at the top of `www/app.js`.

---

## 1. `GET /case-types`

Returns the list the case dropdown is built from.

```json
[
  { "id": 1,  "category": "TRAUMA", "label": "Road accident — multiple injuries", "quick": true, "short": "Road accident" },
  { "id": 12, "category": "STROKE", "label": "Stroke / sudden weakness or slurred speech", "quick": true, "short": "Stroke" }
]
```

| field | required | meaning |
|---|---|---|
| `id` | yes | integer, sent back as `case_type_id` |
| `category` | yes | groups the dropdown. `STROKE` also reveals the FAST panel |
| `label` | yes | full text in the dropdown |
| `quick` | no | show as a one-tap chip at the top (app uses the first 6) |
| `short` | no | chip text; falls back to `label` |

Recognised categories: `TRAUMA`, `CARDIAC`, `STROKE`, `NEURO`, `RESP`,
`METABOLIC`, `OBSTETRIC`, `PAEDIATRIC`, `POISONING`, `ALLERGY`, `OTHER`.

An **unrecognised** category still works: it becomes its own dropdown group,
labelled with the raw string, sorted after all the known ones. A **missing or
empty** category is treated as `OTHER`. Only `STROKE` has behaviour attached
to it — it is what reveals the FAST panel.

If this call fails the app falls back to its built-in list and shows a red
retry banner, so a list outage never blocks a broadcast.

---

## 2. `POST /requests`

The exact body the app sends. Every key is always present except
`stroke_assessment`.

```json
{
  "case_type_id": 12,
  "age": 58,
  "gender": "M",
  "blood_group": "O+",
  "vitals": {
    "systolic_bp": 82,
    "diastolic_bp": 50,
    "heart_rate": 132,
    "resp_rate": 26,
    "spo2": 88,
    "glucose": null
  },
  "consciousness": "Semi-Conscious",
  "origin": { "lat": 12.9716, "lng": 77.5946, "accuracy_m": 18 },
  "broadcast_radius_km": 15,
  "images": ["data:image/jpeg;base64,…"],
  "eta_minutes": 12,
  "notes": "entrapped 20 min, one unit O− given",
  "ambulance_id": "KA01AB1234",
  "stroke_assessment": { "face": false, "arm": true, "speech": true, "onset_hours": 2 }
}
```

### Hard rules (enforced by the test suite)

- An untaken vital is `null` — **never `0`**, never omitted. `0` is a real and
  dangerous reading for some of these fields, so the two must stay distinct.
- `consciousness` is one of `"Conscious"`, `"Semi-Conscious"`, `"Unconscious"`,
  or `null`.
- `gender` is `"M"`, `"F"`, `"O"` or `"U"` (unknown, the default).
- `stroke_assessment` appears **only** when the chosen case type's category is
  `STROKE`. Otherwise the key is absent entirely.
- `priority` is **never** sent. The backend computes RED/AMBER/GREEN. The
  colours in the app are a bedside hint for the crew, not triage.
- `destination_hospital_ids` does not exist. The crew never picks a hospital —
  you resolve hospitals from `origin` + `broadcast_radius_km`.
- `images` is an array of 0–4 compressed JPEG data-URLs (≈900 px long edge,
  quality 0.6, typically 40–120 KB each).

### Value ranges — validate these server-side

The app shows a grey **Check value** chip when a number falls outside the
ranges below, but it deliberately **does not block the broadcast** over a
typo: in an ambulance, refusing to send is the worse failure. So an
implausible value can still reach you — treat these as sanity limits.

| field | plausible range |
|---|---|
| `age` | 0–120 |
| `vitals.systolic_bp` | 40–300 |
| `vitals.diastolic_bp` | 20–200 |
| `vitals.heart_rate` | 20–300 |
| `vitals.resp_rate` | 4–80 |
| `vitals.spo2` | 50–100 |
| `vitals.glucose` | 10–900 |
| `eta_minutes` | 1–180 |
| `broadcast_radius_km` | 2–40 |
| `stroke_assessment.onset_hours` | 0–72 |

### Expected response

```json
{ "id": 45, "hospitals_notified": 3, "status": "PENDING" }
```

`id` is required — the app polls it. `hospitals_notified` drives the
"Sent to N nearby hospitals" line.

### What the backend must do

1. Haversine-match every registered hospital within `broadcast_radius_km` of
   `origin`.
2. Create one broadcast with **one pending row per hospital**.
3. Notify all of them (the hospital dashboard is a separate project).
4. On the first accept: atomically mark that row `ACCEPTED` and **cancel every
   other row**. First accept wins; this must be a single transaction so two
   hospitals can never both win.
5. Expire the broadcast if nobody accepts within your chosen window.

---

## 3. `GET /requests/{id}`

Polled every 5 seconds until the status leaves `PENDING`.

```json
{
  "id": 45,
  "status": "ACCEPTED",
  "accepted_by": "Manipal Hospital, Old Airport Road",
  "hospitals_notified": 3,
  "accepted_hospital": {
    "name": "Manipal Hospital, Old Airport Road",
    "distance_km": 3.4,
    "eta_min": 9,
    "phone": "+918025023700",
    "lat": 12.9591,
    "lng": 77.6488
  }
}
```

| status | what the crew sees |
|---|---|
| `PENDING` | amber pulsing "Waiting for a hospital to accept…" |
| `ACCEPTED` | green "✓ Accepted by …" + hospital card, polling stops |
| `REJECTED` / `EXPIRED` / `CANCELLED` | red "No hospital accepted" |

`accepted_hospital` is optional. When `phone` is present the app shows a
tap-to-call button; when `lat`/`lng` are present it shows a Navigate button
that opens the phone's maps app.

A failed poll is not fatal — the app simply tries again on the next tick.
