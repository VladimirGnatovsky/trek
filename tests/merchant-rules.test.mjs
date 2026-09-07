import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMerchant, suggestedCategory } from "../lib/merchant-rules.mjs";

test("normalizes merchant names consistently", () => {
  assert.equal(normalizeMerchant("  Żabka #042 / Warszawa "), "żabka 042 warszawa");
});

test("prefers exact merchant category rules", () => {
  const rules = [{ merchant_key: "netflix", category: "Subscriptions" }, { merchant_key: "net", category: "Other" }];
  assert.equal(suggestedCategory("NETFLIX", rules), "Subscriptions");
});

test("uses the most specific partial rule", () => {
  const rules = [{ merchant_key: "coffee", category: "Other" }, { merchant_key: "coffee room", category: "Coffee" }];
  assert.equal(suggestedCategory("Coffee Room Warsaw", rules), "Coffee");
});
