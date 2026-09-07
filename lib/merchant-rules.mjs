export const normalizeMerchant = (value = "") => String(value)
  .normalize("NFKC")
  .toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .replace(/\s+/g, " ")
  .slice(0, 120);

export const suggestedCategory = (merchant, rules = []) => {
  const key = normalizeMerchant(merchant);
  if (!key) return null;
  const exact = rules.find((rule) => rule.merchant_key === key);
  if (exact) return exact.category;
  const candidates = rules
    .filter((rule) => rule.merchant_key.length >= 4 && (key.includes(rule.merchant_key) || rule.merchant_key.includes(key)))
    .sort((a, b) => b.merchant_key.length - a.merchant_key.length);
  return candidates[0]?.category || null;
};
