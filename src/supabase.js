import { createClient } from "@supabase/supabase-js";

const runtimeConfig = window.__TREK_ENV__ || {};
const url = runtimeConfig.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const publishableKey = runtimeConfig.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;
