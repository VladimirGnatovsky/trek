# Deploy Trek on Railway

This archive is ready for a Railway deployment. Node builds the Vite app, then serves the SPA and the protected Trek Coach API from one Railway service. SPA refreshes fall back to `index.html`.

## Deploy from GitHub

1. Create a new GitHub repository and upload the contents of this folder.
2. In Railway, choose **New Project** → **Deploy from GitHub Repo**.
3. Select the repository and deploy. Railway automatically detects the root `Dockerfile`.
4. When the build succeeds, open the service **Settings** → **Networking** → **Generate Domain**.

## Deploy from your computer

1. Unzip the archive and open a terminal in the project folder.
2. Install the Railway CLI and log in: `npm i -g @railway/cli` then `railway login`.
3. Run `railway init`, then `railway up`.
4. In the Railway service, generate a public domain in **Settings** → **Networking**.

Railway provides `PORT` automatically.

## Enable Supabase authentication

In Railway, add these two variables in the service **Variables** tab, then redeploy:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Use the public publishable key from Supabase Project Settings → API. Never add a Supabase `secret` or `service_role` key to the front-end or to this repository. The Railway server exposes only these two public values to the browser at runtime. In Supabase Authentication → URL Configuration, add your Railway public URL as a Redirect URL.

## Persistent user data

Run the complete contents of `supabase/schema.sql` in **Supabase → SQL Editor → New query → Run**. The script is safe to run again after an update. It creates private tables for profiles, settings, transactions, month-specific budgets, category envelopes, goals, recurring items and memberships. Row Level Security means an authenticated user can read and change only their own records. Every new account receives its own settings and Start membership automatically.

## Secure paid plans

Create one EUR Payment Link for Plus (€6/month) and one for Lifetime (€149 once) in your payment provider (for example Stripe). In Railway → **Variables**, add their public hosted checkout URLs:

```
VITE_CHECKOUT_PLUS_URL=https://buy.stripe.com/...
VITE_CHECKOUT_LIFETIME_URL=https://buy.stripe.com/...
```

Trek redirects a client to the provider's hosted checkout and never receives card details. Do not put card numbers, payment secrets, webhook secrets, or a Supabase secret/service-role key in Railway variables exposed to the browser. The membership table intentionally has no browser write policy: a production payment webhook must update `public.subscriptions` after the provider confirms payment.

## Gemini-powered Trek Coach

The Coach endpoint runs on the Railway server and verifies the caller's Supabase session before calling Gemini. Add these **private** Railway variables, then deploy:

```
GEMINI_API_KEY=your-Google-AI-Studio-key
GEMINI_MODEL=gemini-3.5-flash
```

The same private Gemini connection extracts transaction tables from PDF bank
statements. CSV statements are parsed locally on the Railway server without AI.
Statement import is checked server-side and is available only to an active
Lifetime account. Currency conversion uses the official historical NBU rate for
each transaction date; there is no additional exchange-rate key to configure.

After deploying this update, run the latest `supabase/schema.sql` in the Supabase
SQL Editor. The migration adds conversion provenance and duplicate-import
protection to `transactions`.

## Complete Stripe billing

For automatic plan activation and the customer billing portal, add these server-only Railway variables:

```env
PUBLIC_APP_URL=https://trekapp.up.railway.app
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PLUS_PRICE_ID=price_...
STRIPE_LIFETIME_PRICE_ID=price_...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

In Stripe Workbench, register `https://trekapp.up.railway.app/api/stripe/webhook` and subscribe it to `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`. Use the endpoint signing secret as `STRIPE_WEBHOOK_SECRET`. These values stay on the Railway server and must never use the `VITE_` prefix.

Do not prefix the Gemini key with `VITE_` and never add it to client code, Git, or Supabase. The browser sends only aggregated totals (budget, spending pace, forecast, pulse score, goal progress, and category totals), never an email address or merchant names. The server limits each signed-in account to five coach requests per ten minutes.
