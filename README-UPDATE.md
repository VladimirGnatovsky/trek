# Trek — update notes (v2)

This build is a full redesign: bottom tab bar (Home · Stats · List · Settings),
a floating **+** button, category icons, a category **donut**, a **6-month** bar
chart and a **daily** breakdown, plus a **Settings** tab.

## Apply the update to your existing project (`~/Downloads/trek`)
Replace these files with the ones in this package, then rebuild:

```
src/ledger.jsx      ← the whole app (rewritten)
index.html          ← simplified (AI config now lives in-app Settings)
assets/logo.png     ← 1024 app icon (compass)
```

Then:
```bash
cd ~/Downloads/trek
npm run build
npx cap copy
# regenerate the app icon from assets/logo.png:
npx @capacitor/assets generate --ios
npx cap open ios          # Run on your iPhone
```

## What each reported issue → is now
- **Scan crashed the app** → image processing rewritten to a single small pass (max 1280 px, one canvas). No more memory spikes.
- **Pick from gallery / HEIC** → the photo button no longer forces the camera. iOS now shows *Photo Library / Take Photo / Choose File*, and HEIC is decoded and converted to JPEG automatically.
- **Voice `not-allowed`** → the web mic doesn't work inside a WKWebView, so the in-app mic button is removed. Use the **iOS keyboard's mic key** to dictate straight into the “Quick add” field — that's native and always works.
- **“Load failed” on Quick add / Scan** → these call an AI model. Open **Settings → AI** and paste your **Anthropic API key**. Then scan + quick-add work on the phone. (Key is stored only on this device. Don't ship a public build with your key embedded.)
- **Everything should save** → transactions, budget, currency and settings persist via the storage shim (localStorage). Receipt images are stored per-transaction.
- **Icon wasn't ours** → run `npx @capacitor/assets generate --ios` (above). It builds the full iOS icon set from `assets/logo.png`.

## Settings → AI
- **API key**: your `sk-ant-…`. Enables scan + quick add.
- **Model**: optional. Defaults to `claude-sonnet-5` when a key is set — change it to any vision model your key can use.
- **Proxy endpoint**: optional; if set, it's used instead of the key (for a server-side proxy that holds the key). See `api/messages.js`.

## Notes / next
- Camera & mic Info.plist keys (still needed for the photo picker prompt): add `NSCameraUsageDescription` (and `NSPhotoLibraryUsageDescription`) in `ios/App/App/Info.plist`, then `npx cap copy`.
- Net Worth / accounts / debts tabs from the reference aren't built yet (you said not a priority). Easy to add as extra tabs later.
- localStorage is ~5 MB; heavy receipt-image use should move to IndexedDB.

## Free scanning (no paid API) — v3
- **Quick add is now fully offline.** Typing "coffee 4.50" is parsed on-device (amount, category by keyword, today/yesterday). No key, no network, no cost.
- **Receipt photo scanning via Gemini free tier.** In **Settings → Receipt scanning** choose **Gemini · free**, then get a free key at **aistudio.google.com/app/apikey** (Google account, no card) and paste it. Scanning then works for free within Google's free limits.
  - Default Gemini model is `gemini-2.0-flash` (multimodal). You can change it in Settings → Model.
  - Anthropic remains available as the other provider if you ever add credits or a proxy.
