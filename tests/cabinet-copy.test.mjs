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
