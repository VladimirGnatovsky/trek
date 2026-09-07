import test from "node:test";
import assert from "node:assert/strict";
import { applyAutomationRules, buildFinancialTimeline, buildSmartInsights, buildWeeklyReport, calculateAccountBalances, calculateNoSpendStreak, detectRecurringCandidates } from "../lib/product-intelligence.mjs";

test("detects stable monthly merchant charges", () => {
  const candidates = detectRecurringCandidates([
    { merchant: "Netflix", type: "expense", category: "Subscriptions", amount: 9.99, date: "2026-07-04" },
    { merchant: "NETFLIX.COM", type: "expense", category: "Subscriptions", amount: 9.99, date: "2026-08-04" },
    { merchant: "Netflix", type: "expense", category: "Subscriptions", amount: 10.49, date: "2026-09-04" },
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].category, "Subscriptions");
  assert.equal(candidates[0].day, 4);
});

test("does not suggest an existing recurring item", () => {
  const rows = [{ merchant: "Spotify", type: "expense", amount: 6, date: "2026-07-10" }, { merchant: "Spotify", type: "expense", amount: 6, date: "2026-08-10" }];
  assert.equal(detectRecurringCandidates(rows, [{ merchant: "Spotify", type: "expense" }]).length, 0);
});

test("combines actual, upcoming and goal events in the calendar", () => {
  const events = buildFinancialTimeline({ month: "2026-09-01", transactions: [{ id: "t", merchant: "Salary", type: "income", amount: 3000, date: "2026-09-01" }], recurring: [{ id: "r", merchant: "Rent", type: "expense", amount: 900, day: 5, active: true }], goals: [{ id: "g", name: "Trip", target: 500, saved: 300, deadline: "2026-09-20", status: "active" }] });
  assert.deepEqual(events.map((item) => item.kind), ["transaction", "recurring", "goal"]);
});

test("builds local insights and retention metrics", () => {
  const metrics = { spending: 1200, forecast: 1400, byCategory: [{ category: "Shopping", amount: 450 }] };
  const insights = buildSmartInsights({ metrics, previousMetrics: { spending: 1000 }, budget: 2000, categoryBudgets: { Shopping: 500 }, today: new Date("2026-09-07T12:00:00"), recurring: [{ merchant: "Spotify", amount: 6, day: 9, active: true }] });
  assert.deepEqual(insights.map((item) => item.id), ["month-change", "upcoming", "category-limit", "surplus"]);
  assert.equal(calculateNoSpendStreak([{ type: "expense", date: "2026-09-05" }], new Date("2026-09-07T12:00:00")), 2);
  assert.equal(buildWeeklyReport([{ type: "expense", date: "2026-09-07", amount: 10 }], new Date("2026-09-07T12:00:00")).current, 10);
});

test("applies matching automation actions", () => {
  const result = applyAutomationRules({ merchant: "Lidl Warszawa", amount: 340, type: "expense", category: "Other", needsReview: false }, [
    { merchantContains: "Lidl", type: "expense", category: "Groceries", active: true, priority: 10 },
    { amountAbove: 300, type: "any", markReview: true, active: true, priority: 5 },
  ]);
  assert.equal(result.category, "Groceries");
  assert.equal(result.needsReview, true);
});

test("calculates balances from entries and transfers", () => {
  const balances = calculateAccountBalances([{ id: "cash", kind: "cash", openingBalance: 100 }, { id: "bank", kind: "bank", openingBalance: 500 }], [{ accountId: "cash", type: "expense", amount: 20 }, { accountId: "bank", type: "income", amount: 100 }], [{ fromAccountId: "bank", toAccountId: "cash", amount: 50, fee: 2 }]);
  assert.deepEqual(balances.map((account) => account.balance), [130, 548]);
});
