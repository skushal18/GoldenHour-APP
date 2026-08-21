# GoldenHour — ambulance app (v3.0)

A paramedic fills a short form, taps **Broadcast Request**, and every hospital
registered within the chosen radius is alerted at once. The first hospital to
accept claims the case; the ambulance screen updates itself to
**"✓ Accepted by …"**.

Plain HTML/CSS/JS. No framework, no build step, no bundler.
Wrapped by Capacitor into an Android APK.

---

## Try it in 5 seconds

Open `www/index.html` in any browser. It runs in **demo mode**: sample case
list, a fixed Bengaluru location, and a simulated hospital acceptance after a
couple of seconds.

## Run the tests

```bash
npm install
npm test          # 90 unit checks + 80 functional (jsdom) checks
```

## Build the APK

### Option A — GitHub Actions (no Android Studio needed)

1. Push this folder to a GitHub repo
2. **Actions** tab → **Build GoldenHour APK** → **Run workflow**
3. Download the `goldenhour-debug-apk` artifact when it goes green
4. Unzip, copy `app-debug.apk` to a phone, tap to install
   (allow "Install unknown apps" once)

The workflow lives in `.github/workflows/build-apk.yml`.

### Option B — locally

Needs JDK 21 and the Android SDK (platform 36).

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

## Go live

1. Edit one line in `www/app.js`:
   ```js
   var API_BASE = "https://your-backend.example.com/api";
   ```
2. Implement the two endpoints in `API.md`
3. Rebuild

While `API_BASE` still contains `REPLACE-WITH-YOUR-BACKEND`, the app stays in
demo mode and never touches the network.

---

## Layout

```
www/                 the web app — the source of truth
  index.html         every screen
  app.js             all logic
  style.css          liquid-glass design system
capacitor.config.json
android/             generated Capacitor project (manifest is hand-edited)
tests/               unit + functional suites
.github/workflows/   CI that builds the APK
API.md               backend contract
```

Edit `www/`, then run `npx cap sync android` to copy it into the APK project.
Never edit `android/app/src/main/assets/public/` — it is overwritten on sync.
