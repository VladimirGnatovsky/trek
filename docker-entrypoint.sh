#!/bin/sh
set -eu

# These are public browser configuration values. Do not put any secret key here.
cat > /srv/env.js <<EOF
window.__TREK_ENV__ = {
  VITE_SUPABASE_URL: "${VITE_SUPABASE_URL:-}",
  VITE_SUPABASE_PUBLISHABLE_KEY: "${VITE_SUPABASE_PUBLISHABLE_KEY:-}",
  VITE_CHECKOUT_PLUS_URL: "${VITE_CHECKOUT_PLUS_URL:-}",
  VITE_CHECKOUT_LIFETIME_URL: "${VITE_CHECKOUT_LIFETIME_URL:-}",
  VITE_API_BASE_URL: "${VITE_API_BASE_URL:-${PUBLIC_APP_URL:-}}"
};
EOF

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
