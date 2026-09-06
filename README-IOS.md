# Trek for iPhone

The iOS build uses the same Supabase account, transactions, plans, budgets, goals,
recurring items, analytics, Stripe membership and Trek Coach as the web app.
It opens directly to sign-in/dashboard and includes receipt recognition in the
new-transaction sheet.

## Before building

Deploy the current repository to Railway first. Receipt recognition calls:

`https://trekapp.up.railway.app/api/receipt`

Railway must contain `GEMINI_API_KEY`, `GEMINI_MODEL`, the Supabase variables,
Stripe variables and `PUBLIC_APP_URL`. `VITE_API_BASE_URL` is optional and defaults
to `PUBLIC_APP_URL` on the hosted build.

## Preview the native layout

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/?native-preview=1` and enable a mobile viewport in the
browser developer tools. Receipt API calls require the Railway deployment.

## Copy the app into Xcode

```bash
npm run build
npx cap copy ios
npx cap open ios
```

In Xcode choose the App target, set your Team under Signing & Capabilities, select
an iPhone or simulator and press Run. Camera and photo-library descriptions are
already included in `ios/App/App/Info.plist`.

For an App Store upload, create an Archive with the Release configuration. This
update uses marketing version 1.1 and build number 2.
