# Trek — iOS test build (Vite + Capacitor)

Run Trek as a real installed app on your own iPhone using a **free Apple ID**.
The web UI is reused as-is inside a native shell (Capacitor / WKWebView).

## What works where
- **Manual entry, budget, 6-month analytics, receipt history** → work fully, offline, no server needed.
- **Receipt scan + voice/quick parse** → need an AI endpoint. Point the app at **your own HTTPS proxy** (`api/messages.js`) that holds the provider key. Until you do, those two buttons are off; everything else works.
- **Voice input** relies on Safari's Speech API, which may be unavailable inside the wrapped app (WKWebView). The typed "Quick add" box always works; swap to a native speech plugin later if you need dictation.

## Prerequisites
- macOS with **Xcode 15+** (open it once to install components).
- **Node 18+**.
- A free **Apple ID** added in Xcode → Settings → Accounts.

---

## 1. Install
```bash
cd trek
npm install
```

Optional sanity check in the browser (uses localStorage; AI off unless configured):
```bash
npm run dev
```

## 2. Build web + add the iOS platform
```bash
npm run build
npx cap add ios
npx cap copy
```

## 3. Generate app icons (optional but nice)
The 1024×1024 icon is at `resources/icon.png`.
```bash
npx capacitor-assets generate --ios --iconBackgroundColor '#15171B' --iconBackgroundColorDark '#15171B'
```

## 4. Open in Xcode and run on your iPhone
```bash
npx cap open ios
```
In Xcode:
1. Select the **App** target → **Signing & Capabilities** → check *Automatically manage signing* → **Team** = your Apple ID (Personal Team). If the bundle id `com.vova.trek` is taken, change it to something unique like `com.yourname.trek`.
2. Plug in your iPhone with a cable, unlock it, tap **Trust** when prompted.
3. Pick your iPhone in the device dropdown (top bar) and press **▶ Run**.
4. First launch on the phone: **Settings → General → VPN & Device Management → [your Apple ID] → Trust**. Then reopen the app.

That's it — Trek is installed with its own icon.

> **Free Apple ID limit:** the signing certificate expires after **7 days**. When the app stops opening, just press **▶ Run** from Xcode again to reinstall. A paid Apple Developer account ($99/yr) removes this and unlocks TestFlight.

## 5. Camera + mic permissions
Add to `ios/App/App/Info.plist` (inside the top `<dict>`), so the receipt photo picker and dictation can prompt:
```xml
<key>NSCameraUsageDescription</key>
<string>Trek uses the camera to scan receipts.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Trek uses the microphone for voice entry.</string>
```
Then `npx cap copy` and Run again.

---

## 6. Turn on receipt scan + quick add
Open the app → **Settings → Receipt scanning** and paste the URL of your deployed
proxy endpoint (`api/messages.js` deployed with `ANTHROPIC_API_KEY`). Do not put an
AI key into the app: browser storage can be copied from a lost or compromised device.

> Each scan is one API call on your account. A public build must use an authenticated proxy with rate limiting; never ship a provider key in the app.

## Notes
- Data lives in the app's localStorage (via `src/storage-shim.js`). It survives launches but is device-local. For lots of scanned receipt images, move storage to IndexedDB.
- To change the app name/id later, edit `capacitor.config.json` and re-run `npx cap copy`.
