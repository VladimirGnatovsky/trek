import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLocale, preferredLocale } from "../lib/locale.mjs";

test("normalizes supported regional language tags", () => {
  assert.equal(normalizeLocale("pl-PL"), "pl");
  assert.equal(normalizeLocale("uk-UA"), "uk");
  assert.equal(normalizeLocale("de-DE"), "en");
});

test("chooses the first supported browser language", () => {
  assert.equal(preferredLocale(["de-DE", "pl-PL", "en-US"]), "pl");
  assert.equal(preferredLocale(["de-DE", "fr-FR"]), "en");
});
