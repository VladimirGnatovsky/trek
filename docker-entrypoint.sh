#!/bin/sh
set -eu

# These are public browser configuration values. Do not put any secret key here.
cat > /srv/env.js <<EOF
window.__TREK_ENV__ = {
  VITE_SUPABASE_URL: "${VITE_SUPABASE_URL:-}",
  VITE_SUPABASE_PUBLISHABLE_KEY: "${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
};
EOF

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
