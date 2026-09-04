# Deploy Trek on Railway

This archive is ready for a Railway deployment. It uses a Dockerfile: Node builds the Vite app and Caddy serves the resulting static files. SPA refreshes work because unknown paths fall back to `index.html`.

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

Railway provides `PORT` automatically and the Caddy configuration reads it at runtime.

## Enable Supabase authentication

In Railway, add these two variables in the service **Variables** tab, then redeploy:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Use the public publishable key from Supabase Project Settings → API. Never add a Supabase `secret` or `service_role` key to the front-end or to this repository. The Docker startup script exposes only these two public values at runtime, so a Railway rebuild cache cannot leave the sign-in screen without configuration. In Supabase Authentication → URL Configuration, add your Railway public URL as a Redirect URL.

## Persistent user data

Run the complete contents of `supabase/schema.sql` once in **Supabase → SQL Editor → New query → Run**. It creates private tables for profiles, settings, transactions and memberships. Row Level Security means an authenticated user can read and change only their own records. Every new account receives its own settings and Start membership automatically.

## Secure paid plans

Create one EUR Payment Link for Plus (€6/month) and one for Lifetime (€149 once) in your payment provider (for example Stripe). In Railway → **Variables**, add their public hosted checkout URLs:

```
VITE_CHECKOUT_PLUS_URL=https://buy.stripe.com/...
VITE_CHECKOUT_LIFETIME_URL=https://buy.stripe.com/...
```

Trek redirects a client to the provider's hosted checkout and never receives card details. Do not put card numbers, payment secrets, webhook secrets, or a Supabase secret/service-role key in Railway variables exposed to the browser. The membership table intentionally has no browser write policy: a production payment webhook must update `public.subscriptions` after the provider confirms payment.
