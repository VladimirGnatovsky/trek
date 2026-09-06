import assert from "node:assert/strict";
import test from "node:test";
import { parseCsvStatement, parseStatementDate, statementCategory } from "../server.mjs";

test("parses Monobank CSV signs, dates and UAH currency", () => {
  const csv = `"Date and time",Description,MCC,"Card currency amount, (UAH)","Operation amount","Operation currency"\n"30.08.2026 14:09:51","Transfer",4829,-3000.0,-3000.0,UAH\n"19.08.2026 10:38:03","Card top-up",4829,9000.0,9000.0,UAH`;
  assert.deepEqual(parseCsvStatement(csv), [
    { date: "2026-08-30", merchant: "Transfer", amount: 3000, type: "expense", currency: "UAH", category: "Other" },
    { date: "2026-08-19", merchant: "Card top-up", amount: 9000, type: "income", currency: "UAH", category: "Other" },
  ]);
});

test("parses semicolon CSV with decimal commas", () => {
  const csv = `Date;Description;Amount;Currency\n06.09.2026;Lidl Warszawa;-123,45;PLN`;
  assert.deepEqual(parseCsvStatement(csv)[0], { date: "2026-09-06", merchant: "Lidl Warszawa", amount: 123.45, type: "expense", currency: "PLN", category: "Groceries" });
});

test("normalizes supported date formats and categories", () => {
  assert.equal(parseStatementDate("2026/09/06 12:00"), "2026-09-06");
  assert.equal(statementCategory("Netflix.com"), "Subscriptions");
});
