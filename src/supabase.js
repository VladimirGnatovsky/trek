import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { mobilePublicConfig } from "./mobile-config.js";

const runtimeConfig = window.__TREK_ENV__ || {};
const nativeConfig = Capacitor.isNativePlatform() ? mobilePublicConfig : {};
const url = runtimeConfig.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || nativeConfig.supabaseUrl;
const publishableKey = runtimeConfig.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || nativeConfig.supabasePublishableKey;

export const supabase =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;
