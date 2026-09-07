const LIMITS = { transactions: 10000, monthlyBudgets: 500, categoryBudgets: 500, goals: 500, recurring: 500, cryptoHoldings: 500 };

export function validateBackup(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("This is not a Trek backup file.");
  const result = {};
  for (const [key, limit] of Object.entries(LIMITS)) {
    const rows = value[key] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Backup field “${key}” is invalid.`);
    if (rows.length > limit) throw new Error(`Backup contains too many ${key} records.`);
    result[key] = rows;
  }
  result.settings = value.settings && typeof value.settings === "object" && !Array.isArray(value.settings) ? value.settings : {};
  if (!Object.keys(LIMITS).some((key) => result[key].length)) throw new Error("The backup does not contain any records.");
  return result;
}
