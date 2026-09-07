const DAY_MS = 86_400_000;
const dateAtNoon = (value) => new Date(`${value}T12:00:00`);
const iso = (date) => date.toISOString().slice(0, 10);
const merchantKey = (value) => String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter((token) => !["com", "payment", "payments", "card", "pos"].includes(token)).join(" ");
const average = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

export function detectRecurringCandidates(transactions, recurring = []) {
  const existing = new Set(recurring.map((item) => `${merchantKey(item.merchant)}:${item.type || "expense"}`));
  const groups = new Map();
  transactions.forEach((item) => {
    const key = `${merchantKey(item.merchant)}:${item.type || "expense"}`;
    if (!item.merchant || existing.has(key)) return;
    groups.set(key, [...(groups.get(key) || []), item]);
  });

  return [...groups.entries()].flatMap(([key, rows]) => {
    if (rows.length < 2) return [];
    const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const intervals = ordered.slice(1).map((row, index) => Math.round((dateAtNoon(row.date) - dateAtNoon(ordered[index].date)) / DAY_MS));
    const monthlyIntervals = intervals.filter((days) => days >= 20 && days <= 40);
    const amounts = ordered.map((row) => Number(row.amount) || 0);
    const meanAmount = average(amounts);
    const maxDrift = Math.max(...amounts.map((amount) => Math.abs(amount - meanAmount) / Math.max(meanAmount, 1)));
    if (monthlyIntervals.length !== intervals.length || maxDrift > 0.2) return [];
    const latest = ordered[ordered.length - 1];
    return [{
      key,
      merchant: latest.merchant,
      category: latest.category,
      type: latest.type || "expense",
      amount: Math.round(meanAmount * 100) / 100,
      day: Math.min(31, Math.round(average(ordered.map((row) => dateAtNoon(row.date).getDate())))),
      occurrences: ordered.length,
      confidence: Math.min(99, Math.round(62 + ordered.length * 9 - maxDrift * 40)),
    }];
  }).sort((a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences);
}

export function buildFinancialTimeline({ month, transactions = [], recurring = [], goals = [] }) {
  const [year, monthNumber] = month.slice(0, 7).split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const events = transactions.map((item) => ({ ...item, kind: "transaction", title: item.merchant }));
  recurring.filter((item) => item.active !== false).forEach((item) => {
    const day = Math.min(daysInMonth, Number(item.day) || 1);
    const date = `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
    const alreadyPosted = transactions.some((transaction) => merchantKey(transaction.merchant) === merchantKey(item.merchant) && transaction.date === date && transaction.type === item.type);
    if (!alreadyPosted) events.push({ ...item, recurringId: item.id, id: `recurring-${item.id}-${date}`, date, kind: "recurring", title: item.merchant });
  });
  goals.filter((goal) => goal.status === "active" && goal.deadline?.slice(0, 7) === month.slice(0, 7)).forEach((goal) => {
    events.push({ id: `goal-${goal.id}`, date: goal.deadline, kind: "goal", title: goal.name, amount: Math.max(0, Number(goal.target) - Number(goal.saved)) });
  });
  return events.sort((a, b) => a.date.localeCompare(b.date) || String(a.title).localeCompare(String(b.title)));
}

export function calculateNoSpendStreak(transactions, today = new Date()) {
  const expenseDates = new Set(transactions.filter((item) => item.type !== "income").map((item) => item.date));
  let streak = 0;
  for (let offset = 0; offset < 366; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset, 12);
    if (expenseDates.has(iso(date))) break;
    streak += 1;
  }
  return streak;
}

export function buildWeeklyReport(transactions, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const start = new Date(end); start.setDate(start.getDate() - 6);
  const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - 7);
  const totalBetween = (from, to) => transactions.filter((item) => item.type !== "income" && dateAtNoon(item.date) >= from && dateAtNoon(item.date) <= to).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const current = totalBetween(start, end);
  const previousEnd = new Date(start); previousEnd.setDate(previousEnd.getDate() - 1);
  const previous = totalBetween(previousStart, previousEnd);
  const change = previous > 0 ? (current - previous) / previous * 100 : current > 0 ? 100 : 0;
  return { current, previous, change, from: iso(start), to: iso(end) };
}

export function buildSmartInsights({ metrics, previousMetrics, budget, categoryBudgets = {}, recurring = [], goals = [], today = new Date() }) {
  const insights = [];
  if (previousMetrics?.spending > 0) {
    const change = (metrics.spending - previousMetrics.spending) / previousMetrics.spending * 100;
    if (Math.abs(change) >= 10) insights.push({ id: "month-change", tone: change > 0 ? "warning" : "positive", value: Math.round(Math.abs(change)), direction: change > 0 ? "up" : "down" });
  }
  const todayDay = today.getDate();
  const upcoming = recurring.filter((item) => item.active !== false && Number(item.day) >= todayDay && Number(item.day) <= todayDay + 3).sort((a, b) => a.day - b.day)[0];
  if (upcoming) insights.push({ id: "upcoming", tone: "neutral", merchant: upcoming.merchant, days: Number(upcoming.day) - todayDay, amount: Number(upcoming.amount) });
  const nearLimit = metrics.byCategory?.find((row) => Number(categoryBudgets[row.category] || 0) > 0 && row.amount / Number(categoryBudgets[row.category]) >= 0.8);
  if (nearLimit) insights.push({ id: "category-limit", tone: nearLimit.amount > Number(categoryBudgets[nearLimit.category]) ? "warning" : "neutral", category: nearLimit.category, percent: Math.round(nearLimit.amount / Number(categoryBudgets[nearLimit.category]) * 100) });
  const surplus = Number(budget) - Number(metrics.forecast);
  if (surplus > 0) insights.push({ id: "surplus", tone: "positive", amount: surplus });
  const urgentGoal = goals.filter((goal) => goal.status === "active" && goal.deadline).map((goal) => ({ ...goal, days: Math.ceil((dateAtNoon(goal.deadline) - today) / DAY_MS) })).filter((goal) => goal.days >= 0 && goal.days <= 30 && goal.saved < goal.target).sort((a, b) => a.days - b.days)[0];
  if (urgentGoal) insights.push({ id: "goal", tone: "neutral", name: urgentGoal.name, days: urgentGoal.days, amount: urgentGoal.target - urgentGoal.saved });
  return insights.slice(0, 4);
}

export function applyAutomationRules(form, rules = []) {
  return [...rules].filter((rule) => rule.active !== false).sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0)).reduce((result, rule) => {
    const merchantMatches = !rule.merchantContains || merchantKey(result.merchant).includes(merchantKey(rule.merchantContains));
    const amountMatches = !Number(rule.amountAbove) || Number(result.amount) > Number(rule.amountAbove);
    const typeMatches = !rule.type || rule.type === "any" || rule.type === result.type;
    if (!merchantMatches || !amountMatches || !typeMatches) return result;
    return { ...result, ...(rule.category && result.type !== "income" ? { category: rule.category } : {}), needsReview: Boolean(result.needsReview || rule.markReview) };
  }, { ...form });
}

export function calculateAccountBalances(accounts = [], transactions = [], transfers = [], cryptoValue = 0) {
  return accounts.map((account) => {
    if (account.kind === "crypto") return { ...account, balance: Number(cryptoValue) || Number(account.openingBalance) || 0 };
    const activity = transactions.filter((item) => item.accountId === account.id).reduce((sum, item) => sum + (item.type === "income" ? Number(item.amount) : -Number(item.amount)), 0);
    const movement = transfers.reduce((sum, transfer) => sum + (transfer.toAccountId === account.id ? Number(transfer.amount) : 0) - (transfer.fromAccountId === account.id ? Number(transfer.amount) + Number(transfer.fee || 0) : 0), 0);
    return { ...account, balance: Number(account.openingBalance || 0) + activity + movement };
  });
}
