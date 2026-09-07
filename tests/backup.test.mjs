import test from "node:test";
import assert from "node:assert/strict";
import { validateBackup } from "../lib/backup.mjs";

test("accepts current Trek backup shape", () => {
  const backup = validateBackup({ transactions: [{ id: "1" }], goals: [], recurring: [], cryptoHoldings: [], settings: { currency: "EUR" } });
  assert.equal(backup.transactions.length, 1);
  assert.deepEqual(backup.monthlyBudgets, []);
  assert.equal(backup.settings.currency, "EUR");
});

test("fills optional collections for older backups", () => {
  const backup = validateBackup({ transactions: [{ id: "1" }] });
  assert.deepEqual(backup.goals, []);
});

test("rejects empty or malformed backups", () => {
  assert.throws(() => validateBackup({ transactions: "wrong" }), /invalid/);
  assert.throws(() => validateBackup({ transactions: [] }), /does not contain/);
});
