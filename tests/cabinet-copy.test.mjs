import test from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, ui } from "../src/cabinet-copy.js";

test("localizes visible labels without changing stored category keys", () => {
  assert.equal(categoryLabel("pl", "Groceries"), "Zakupy spożywcze");
  assert.equal(categoryLabel("uk", "Housing"), "Житло");
  assert.equal(categoryLabel("en", "Groceries"), "Groceries");
});

test("falls back to the source label when a translation is unavailable", () => {
  assert.equal(ui("pl", "Unknown future label"), "Unknown future label");
  assert.equal(ui("uk", "Add transaction"), "Додати транзакцію");
});

test("localizes settings and coach controls", () => {
  assert.equal(ui("pl", "Ask about your money pace."), "Zapytaj o tempo swoich finansów.");
  assert.equal(ui("uk", "Thinking…"), "Аналізую…");
  assert.equal(ui("pl", "COLOR THEME"), "MOTYW KOLORYSTYCZNY");
  assert.equal(ui("uk", "Analyze statement"), "Проаналізувати виписку");
  assert.equal(ui("pl", "Continue to payment"), "Przejdź do płatności");
  assert.equal(ui("pl", "QUICK REPEAT"), "SZYBKIE POWTÓRZENIE");
  assert.equal(ui("uk", "Open a prefilled transaction"), "Відкрити заповнену транзакцію");
});
