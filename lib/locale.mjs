export const SUPPORTED_LOCALES = ["en", "pl", "uk"];

export function normalizeLocale(value) {
  const locale = String(value || "").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LOCALES.includes(locale) ? locale : "en";
}

export function preferredLocale(languages = []) {
  for (const language of languages) {
    const locale = normalizeLocale(language);
    if (locale !== "en" || String(language || "").toLowerCase().startsWith("en")) return locale;
  }
  return "en";
}
