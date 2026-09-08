import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number(process.env.PORT || 8080);
const limits = new Map();
const receiptLimits = new Map();
const statementLimits = new Map();
const fxCache = new Map();
const cryptoCache = new Map();
let modelCache = { name: "", expiresAt: 0 };
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webm": "video/webm",
  ".ico": "image/x-icon",
};
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; font-src 'self' data:; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const sendJson = (res, status, body) => {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  });
  res.end(JSON.stringify(body));
};

const getBody = async (req, maxBytes) => {
  const body = await getRawBody(req, maxBytes);
  return JSON.parse(body || "{}");
};

const getRawBody = async (req, maxBytes = 1_000_000) => {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > maxBytes) throw new Error("Request is too large.");
  }
  return body;
};

const getUser = async (authorization) => {
  if (!authorization?.startsWith("Bearer ")) return null;
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization },
  });
  return response.ok ? response.json() : null;
};

const publicAppUrl = () => String(process.env.PUBLIC_APP_URL || "https://trekapp.up.railway.app").replace(/\/$/, "");
const adminEmails = () => new Set(String(process.env.ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
const authenticatedAdmin = async (authorization) => {
  const user = await getUser(authorization);
  return user && adminEmails().has(String(user.email || "").toLowerCase()) ? user : null;
};

const stripeRequest = async (endpoint, fields) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw Object.assign(new Error("Stripe server billing is not configured."), { status: 501 });
  }
  const body = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") body.set(key, String(value));
  });
  const response = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("Stripe request failed", endpoint, response.status, data?.error?.type || "unknown");
    throw Object.assign(new Error(data?.error?.message || "Stripe rejected the request."), { status: response.status });
  }
  return data;
};

const supabaseAdmin = async (resource, { method = "GET", body, prefer } = {}) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw Object.assign(new Error("Supabase server access is not configured."), { status: 503 });
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Supabase billing update failed", response.status);
    throw Object.assign(new Error("Could not update the Trek membership."), { status: response.status });
  }
  return data;
};

const checkout = async (req, res) => {
  try {
    const user = await getUser(req.headers.authorization);
    if (!user) return sendJson(res, 401, { error: "Please sign in before choosing a plan." });
    const { plan } = await getBody(req);
    if (!['Plus', 'Lifetime'].includes(plan)) return sendJson(res, 400, { error: "Unknown membership plan." });
    const price = plan === "Plus" ? process.env.STRIPE_PLUS_PRICE_ID : process.env.STRIPE_LIFETIME_PRICE_ID;
    if (!price) return sendJson(res, 501, { error: "Server checkout is not configured yet." });
    const mode = plan === "Plus" ? "subscription" : "payment";
    const fields = {
      mode,
      "line_items[0][price]": price,
      "line_items[0][quantity]": 1,
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: `${publicAppUrl()}/?checkout=success#dashboard`,
      cancel_url: `${publicAppUrl()}/#dashboard`,
      allow_promotion_codes: true,
      "metadata[user_id]": user.id,
      "metadata[plan]": plan,
      ...(mode === "subscription" ? {
        "subscription_data[metadata][user_id]": user.id,
        "subscription_data[metadata][plan]": plan,
      } : { customer_creation: "always" }),
    };
    const session = await stripeRequest("checkout/sessions", fields);
    return sendJson(res, 200, { url: session.url });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || "Checkout is unavailable." });
  }
};

const billingPortal = async (req, res) => {
  try {
    const user = await getUser(req.headers.authorization);
    if (!user) return sendJson(res, 401, { error: "Please sign in to manage billing." });
    const rows = await supabaseAdmin(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=provider_customer_id`);
    const customer = rows?.[0]?.provider_customer_id;
    if (!customer) return sendJson(res, 404, { error: "No Stripe customer is connected to this account yet." });
    const session = await stripeRequest("billing_portal/sessions", { customer, return_url: `${publicAppUrl()}/#dashboard` });
    return sendJson(res, 200, { url: session.url });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.message || "Billing portal is unavailable." });
  }
};

const adminUsers = async (req, res, url) => {
  try {
    const admin = await authenticatedAdmin(req.headers.authorization);
    if (!admin) return sendJson(res, 403, { error: "Administrator access is required." });
    if (req.method === "GET") {
      const email = String(url.searchParams.get("email") || "").trim().toLowerCase().slice(0, 160);
      if (!/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: "Enter a complete account email." });
      const profiles = await supabaseAdmin(`profiles?email=ilike.${encodeURIComponent(email)}&select=id,email,full_name&limit=1`);
      const profile = profiles?.[0];
      if (!profile) return sendJson(res, 404, { error: "No Trek account uses this email." });
      const subscriptions = await supabaseAdmin(`subscriptions?user_id=eq.${encodeURIComponent(profile.id)}&select=plan,status,updated_at&limit=1`);
      return sendJson(res, 200, { user: { ...profile, plan: subscriptions?.[0]?.plan || "Start", status: subscriptions?.[0]?.status || "active", updatedAt: subscriptions?.[0]?.updated_at || null } });
    }
    if (req.method === "POST") {
      const { email: suppliedEmail, plan } = await getBody(req);
      const email = String(suppliedEmail || "").trim().toLowerCase().slice(0, 160);
      if (!/^\S+@\S+\.\S+$/.test(email)) return sendJson(res, 400, { error: "Enter a complete account email." });
      if (!["Start", "Plus", "Lifetime"].includes(plan)) return sendJson(res, 400, { error: "Choose Start, Plus or Lifetime." });
      const profiles = await supabaseAdmin(`profiles?email=ilike.${encodeURIComponent(email)}&select=id,email,full_name&limit=1`);
      const profile = profiles?.[0];
      if (!profile) return sendJson(res, 404, { error: "No Trek account uses this email." });
      const rows = await supabaseAdmin("subscriptions?on_conflict=user_id", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: { user_id: profile.id, plan, status: "active", updated_at: new Date().toISOString() } });
      console.info("Membership changed by admin", admin.email, profile.email, plan);
      return sendJson(res, 200, { user: { ...profile, plan: rows?.[0]?.plan || plan, status: "active", updatedAt: rows?.[0]?.updated_at || new Date().toISOString() } });
    }
    return sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Admin membership endpoint failed", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "Membership could not be updated." });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const user = await getUser(req.headers.authorization);
    if (!user) return sendJson(res, 401, { error: "Please sign in before deleting your account." });
    const { confirmation } = await getBody(req);
    if (confirmation !== "DELETE") return sendJson(res, 400, { error: "Type DELETE to confirm account removal." });
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return sendJson(res, 503, { error: "Account deletion is not configured." });
    const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw Object.assign(new Error("Supabase could not delete this account."), { status: response.status });
    console.info("Account deleted by its owner", user.id);
    return sendJson(res, 200, { deleted: true });
  } catch (error) {
    console.error("Account deletion failed", error.message);
    return sendJson(res, error.status || 500, { error: error.message || "Account could not be deleted." });
  }
};

const verifyStripeEvent = (payload, signature) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const fields = signature.split(",").map((part) => part.split("=", 2));
  const timestamp = Number(fields.find(([key]) => key === "t")?.[1]);
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !signatures.length) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((signatureValue) => {
    const actualBuffer = Buffer.from(signatureValue, "hex");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  });
};

const stripeWebhook = async (req, res) => {
  try {
    const payload = await getRawBody(req);
    if (!verifyStripeEvent(payload, req.headers["stripe-signature"])) {
      return sendJson(res, 400, { error: "Invalid Stripe signature." });
    }
    const event = JSON.parse(payload);
    const object = event.data?.object || {};
    if (event.type === "checkout.session.completed" && ["paid", "no_payment_required"].includes(object.payment_status)) {
      const userId = object.metadata?.user_id || object.client_reference_id;
      const plan = object.metadata?.plan || (object.mode === "subscription" ? "Plus" : "Lifetime");
      if (userId && ["Plus", "Lifetime"].includes(plan)) {
        await supabaseAdmin(`subscriptions?user_id=eq.${encodeURIComponent(userId)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: {
            plan,
            status: "active",
            provider_customer_id: object.customer || null,
            provider_subscription_id: object.subscription || null,
            updated_at: new Date().toISOString(),
          },
        });
      }
    }
    if (["customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const userId = object.metadata?.user_id;
      const subscriptionStatus = event.type === "customer.subscription.deleted" ? "canceled" :
        ["active", "trialing"].includes(object.status) ? "active" : object.status === "past_due" ? "past_due" : "canceled";
      const filter = userId
        ? `user_id=eq.${encodeURIComponent(userId)}`
        : `provider_subscription_id=eq.${encodeURIComponent(object.id || "missing")}`;
      await supabaseAdmin(`subscriptions?${filter}`, {
        method: "PATCH",
        prefer: "return=minimal",
        body: { status: subscriptionStatus, provider_customer_id: object.customer || null, provider_subscription_id: object.id, updated_at: new Date().toISOString() },
      });
    }
    return sendJson(res, 200, { received: true });
  } catch (error) {
    console.error("Stripe webhook failed", error.message);
    return sendJson(res, 500, { error: "Webhook processing failed." });
  }
};

const allowCoachRequest = (userId) => {
  const now = Date.now();
  const recent = (limits.get(userId) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 5) return false;
  recent.push(now);
  limits.set(userId, recent);
  return true;
};

const geminiHeaders = () => ({
  "Content-Type": "application/json",
  "x-goog-api-key": process.env.GEMINI_API_KEY,
});

const resolveGeminiModel = async () => {
  if (modelCache.name && modelCache.expiresAt > Date.now()) return modelCache.name;

  const configured = String(process.env.GEMINI_MODEL || "gemini-3.5-flash")
    .trim()
    .replace(/^models\//, "");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
    headers: geminiHeaders(),
  });

  if (!response.ok) {
    const providerError = await response.json().catch(() => ({}));
    console.error("Gemini model discovery failed", response.status, providerError?.error?.status || "unknown");
    throw Object.assign(new Error("Gemini could not validate this API key."), { providerStatus: response.status });
  }

  const data = await response.json();
  const available = new Set(
    (data.models || [])
      .filter((model) => (model.supportedGenerationMethods || []).includes("generateContent"))
      .map((model) => String(model.name || "").replace(/^models\//, ""))
  );
  const preferred = [
    configured,
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.7-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
  ];
  const selected = preferred.find((name) => available.has(name));
  if (!selected) {
    throw Object.assign(new Error("No compatible Gemini text model is available for this API key."), {
      providerStatus: 404,
    });
  }

  if (selected !== configured) {
    console.warn(`Gemini model ${configured} is unavailable; using ${selected}.`);
  }
  modelCache = { name: selected, expiresAt: Date.now() + 10 * 60 * 1000 };
  return selected;
};

const coach = async (req, res) => {
  try {
    const user = await getUser(req.headers.authorization);
    if (!user) return sendJson(res, 401, { error: "Please sign in before asking the coach." });
    if (!allowCoachRequest(user.id)) {
      return sendJson(res, 429, { error: "Coach limit reached. Try again in a few minutes." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return sendJson(res, 503, { error: "The coach is not configured yet." });
    }
    const { question = "", summary = {}, locale = "en" } = await getBody(req);
    const safeQuestion = String(question).slice(0, 600);
    const safeSummary = JSON.stringify(summary).slice(0, 4_000);
    const language = { pl: "Polish", uk: "Ukrainian", en: "English" }[locale] || "English";
    const sectionNames = { pl: "Wniosek, Następne kroki, Pytanie do refleksji", uk: "Висновок, Наступні кроки, Питання для роздумів", en: "Insight, Next steps, Reflection question" }[locale] || "Insight, Next steps, Reflection question";
    const fallbackQuestion = { pl: "Jaki jest jeden przydatny następny krok w tym miesiącu?", uk: "Який корисний наступний крок варто зробити цього місяця?", en: "What is one useful next step for me this month?" }[locale] || "What is one useful next step for me this month?";
    const prompt = `You are Trek Coach, a calm personal budgeting coach. Use only the provided aggregated data. Answer directly in ${language} without introducing yourself, even when category names or stored data are in another language. Return a complete, concise response with exactly these plain-text sections in this language: ${sectionNames}. The middle section must contain 2-3 numbered actions. Do not use Markdown symbols. Do not give investment, credit, tax, legal, or medical advice. Do not shame the user, do not invent facts, and say when the data is insufficient.\n\nAggregated money summary: ${safeSummary}\n\nUser question: ${safeQuestion || fallbackQuestion}`;
    const model = await resolveGeminiModel();
    const thinkingConfig = model.startsWith("gemini-3")
      ? { thinkingLevel: "minimal" }
      : { thinkingBudget: 0 };
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: geminiHeaders(),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1_200, thinkingConfig },
        }),
      }
    );
    if (!response.ok) {
      const providerError = await response.json().catch(() => ({}));
      console.error("Gemini request failed", response.status, providerError?.error?.status || "unknown");
      const message = response.status === 429
        ? "The coach has reached its Gemini quota. Please try again later."
        : response.status === 401 || response.status === 403
          ? "Gemini could not authenticate the server key. Replace GEMINI_API_KEY in Railway."
          : `Gemini could not use the selected model (HTTP ${response.status}).`;
      return sendJson(res, 502, { error: message });
    }
    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      console.warn("Gemini response reached the output limit", model, data.usageMetadata || {});
    }
    if (!answer) return sendJson(res, 502, { error: "Coach could not create a response. Please try again." });
    return sendJson(res, 200, { answer });
  } catch (error) {
    console.error("Coach endpoint error", error.message);
    if (error.providerStatus === 401 || error.providerStatus === 403) {
      return sendJson(res, 502, { error: "Gemini could not authenticate the server key. Replace GEMINI_API_KEY in Railway." });
    }
    if (error.providerStatus === 404) {
      return sendJson(res, 502, { error: "No compatible Gemini text model is available for this API key." });
    }
    return sendJson(res, 400, { error: "Coach could not process that request." });
  }
};

const receiptScan = async (req, res) => {
  try {
    const user = await getUser(req.headers.authorization);
    if (!user) return sendJson(res, 401, { error: "Please sign in before scanning a receipt." });
    if (!process.env.GEMINI_API_KEY) return sendJson(res, 503, { error: "Receipt scanning is not configured yet." });
    const now = Date.now();
    const recent = (receiptLimits.get(user.id) || []).filter((time) => now - time < 10 * 60 * 1000);
    if (recent.length >= 10) return sendJson(res, 429, { error: "Receipt scan limit reached. Try again in a few minutes." });
    recent.push(now);
    receiptLimits.set(user.id, recent);

    const { image = {}, targetCurrency = "EUR" } = await getBody(req, 6_000_000);
    const mimeType = String(image.mimeType || "");
    const data = String(image.data || "");
    if (!/^image\/(jpeg|png|webp)$/.test(mimeType) || !data || data.length > 5_500_000) {
      return sendJson(res, 400, { error: "Choose a JPG, PNG or WebP receipt under 4 MB." });
    }
    if (!["EUR", "USD", "PLN", "UAH"].includes(targetCurrency)) {
      return sendJson(res, 400, { error: "Unsupported display currency." });
    }
    const prompt = `Read this receipt and return only one JSON object with these fields: merchant (short string), amount (final total as a positive number), currency (EUR, USD, PLN or UAH), date (YYYY-MM-DD), category (exactly one of Groceries, Transport, Subscriptions, Coffee, Shopping, Housing, Health, Fun, Other), note (short useful summary, optionally including item count), confidence (high or low). Do not include Markdown. Today is ${new Date().toISOString().slice(0, 10)}. Use null for values that cannot be read.`;
    const model = await resolveGeminiModel();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: geminiHeaders(),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data } }] }],
        generationConfig: { maxOutputTokens: 900 },
      }),
    });
    if (!response.ok) {
      const providerError = await response.json().catch(() => ({}));
      console.error("Gemini receipt scan failed", response.status, providerError?.error?.status || "unknown");
      return sendJson(res, 502, { error: response.status === 429 ? "Receipt scanning quota is temporarily exhausted." : "Gemini could not read this receipt." });
    }
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
    const allowedCategories = new Set(["Groceries", "Transport", "Subscriptions", "Coffee", "Shopping", "Housing", "Health", "Fun", "Other"]);
    const amount = Number(parsed.amount);
    const parsedCurrency = String(parsed.currency || "").toUpperCase();
    const originalCurrency = ["EUR", "USD", "PLN", "UAH"].includes(parsedCurrency) ? parsedCurrency : null;
    const receiptDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.date || "") ? parsed.date : new Date().toISOString().slice(0, 10);
    let convertedAmount = Number.isFinite(amount) && amount > 0 ? amount : null;
    let exchangeRate = 1;
    let exchangeRateDate = receiptDate;
    if (convertedAmount && originalCurrency && originalCurrency !== targetCurrency) {
      const source = await nbuRateToUah(originalCurrency, receiptDate);
      const target = await nbuRateToUah(targetCurrency, receiptDate);
      exchangeRate = source.rate / target.rate;
      exchangeRateDate = source.date < target.date ? source.date : target.date;
      convertedAmount = Math.round(convertedAmount * exchangeRate * 100) / 100;
    }
    return sendJson(res, 200, { receipt: {
      merchant: String(parsed.merchant || "").slice(0, 120),
      amount: convertedAmount,
      currency: targetCurrency,
      originalAmount: Number.isFinite(amount) && amount > 0 ? amount : null,
      originalCurrency,
      exchangeRate,
      exchangeRateDate,
      date: receiptDate,
      category: allowedCategories.has(parsed.category) ? parsed.category : "Other",
      note: String(parsed.note || "Scanned receipt").slice(0, 240),
      confidence: parsed.confidence === "high" ? "high" : "low",
    } });
  } catch (error) {
    console.error("Receipt endpoint error", error.message);
    return sendJson(res, 400, { error: error instanceof SyntaxError ? "The receipt response could not be parsed. Try a clearer photo." : "The receipt could not be processed." });
  }
};

const STATEMENT_CATEGORIES = new Set(["Groceries", "Transport", "Subscriptions", "Coffee", "Shopping", "Housing", "Health", "Fun", "Other"]);

const statementCategory = (value = "", supplied = "") => {
  if (STATEMENT_CATEGORIES.has(supplied)) return supplied;
  const text = String(value).toLowerCase();
  const rules = [
    ["Groceries", /silpo|сільпо|атб|novus|varus|metro|auchan|ашан|billa|lidl|biedronka|zabka|żabka|carrefour|grocery|supermarket|market/],
    ["Transport", /uber|uklon|bolt|taxi|таксі|uber|wog|okko|shell|orlen|fuel|палив|parking|паркінг|metro|tram|bus|train|railway|uz booking/],
    ["Subscriptions", /netflix|spotify|youtube|apple\.com\/bill|google|icloud|subscription|підписк|подписк/],
    ["Coffee", /coffee|cafe|café|кав|starbucks|кофе/],
    ["Housing", /rent|оренд|аренд|utility|utilities|комунал|electric|water|gas|internet|czynsz/],
    ["Health", /pharmacy|аптек|medic|doctor|clinic|health|лікар|zdrow/],
    ["Fun", /cinema|кіно|театр|game|steam|concert|restaurant|ресторан|bar\b/],
    ["Shopping", /amazon|allegro|rozetka|магазин|shop|store|mall|zara|h&m|ikea/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || "Other";
};

const parseCsvRows = (text) => {
  const firstLine = String(text).replace(/^\ufeff/, "").split(/\r?\n/, 1)[0] || "";
  const delimiter = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
};

const normalizeHeader = (value) => String(value || "").toLowerCase().replace(/[^a-zа-яіїє0-9]+/giu, " ").trim();
const parseStatementNumber = (value) => {
  let text = String(value ?? "").replace(/[\s\u00a0₴€$zł]/gi, "").replace(/[−–—]/g, "-");
  if (text.includes(",") && text.includes(".")) text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  else if (text.includes(",")) text = text.replace(",", ".");
  const number = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : NaN;
};
const parseStatementDate = (value) => {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return null;
};
const headerIndex = (headers, exact, contains = []) => {
  const direct = exact.map((name) => headers.indexOf(name)).find((index) => index >= 0);
  if (direct !== undefined) return direct;
  return headers.findIndex((header) => contains.some((part) => header.includes(part)));
};

const parseCsvStatement = (text) => {
  const rows = parseCsvRows(String(text).replace(/^\ufeff/, ""));
  if (rows.length < 2) throw new Error("This CSV file has no transaction rows.");
  const headers = rows[0].map(normalizeHeader);
  const dateAt = headerIndex(headers, ["date", "occurred on", "transaction date", "date and time"], ["date and time", "дата"]);
  const merchantAt = headerIndex(headers, ["merchant", "description", "name", "details"], ["description", "merchant", "опис"]);
  const operationAmountAt = headerIndex(headers, ["operation amount", "amount", "value"], ["operation amount", "сума операції"]);
  const cardAmountAt = headers.findIndex((header) => header.includes("card currency amount"));
  const amountAt = operationAmountAt >= 0 ? operationAmountAt : cardAmountAt;
  const currencyAt = headerIndex(headers, ["operation currency", "currency"], ["operation currency", "валюта операції"]);
  const typeAt = headerIndex(headers, ["type", "entry type", "direction"]);
  const categoryAt = headerIndex(headers, ["category"]);
  const mccAt = headerIndex(headers, ["mcc"]);
  if ([dateAt, merchantAt, amountAt].some((index) => index < 0)) throw new Error("CSV needs date, description and amount columns.");
  const headerCurrency = (rows[0][amountAt]?.match(/\(([A-Z]{3})\)/)?.[1] || "").toUpperCase();
  return rows.slice(1).map((row) => {
    const rawAmount = parseStatementNumber(row[amountAt]);
    const date = parseStatementDate(row[dateAt]);
    const merchant = String(row[merchantAt] || "Imported transaction").trim().slice(0, 120);
    const statedType = String(typeAt >= 0 ? row[typeAt] : "").toLowerCase();
    const type = /income|credit|deposit|top.?up|дохід|поповнен/.test(statedType) ? "income" : /expense|debit|витрат/.test(statedType) ? "expense" : rawAmount >= 0 ? "income" : "expense";
    const currency = String(currencyAt >= 0 ? row[currencyAt] : headerCurrency || "").trim().toUpperCase();
    return { date, merchant, amount: Math.abs(rawAmount), type, currency, category: type === "income" ? "Other" : statementCategory(`${merchant} ${mccAt >= 0 ? row[mccAt] : ""}`, categoryAt >= 0 ? row[categoryAt] : "") };
  }).filter((row) => row.date && Number.isFinite(row.amount) && row.amount > 0 && /^[A-Z]{3}$/.test(row.currency));
};

const parsePdfStatement = async (data) => {
  if (!process.env.GEMINI_API_KEY) throw Object.assign(new Error("PDF statement import is not configured yet."), { status: 503 });
  const model = await resolveGeminiModel();
  const prompt = `Extract only transaction rows from this bank statement. Ignore account holder identity, address, card number, IBAN, tax IDs, signatures and summary totals. Return JSON with one field named transactions. Each transaction must contain: date (YYYY-MM-DD), merchant (short description), amount (positive number), type (expense or income), currency (ISO 4217 code), category (exactly one of Groceries, Transport, Subscriptions, Coffee, Shopping, Housing, Health, Fun, Other). Preserve every transaction exactly once. Negative/debit rows are expenses; positive/credit/top-up rows are income. Do not invent transactions or exchange rates.`;
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: geminiHeaders(), body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "application/pdf", data } }] }],
      generationConfig: { maxOutputTokens: 8_000, responseMimeType: "application/json" },
    }),
  });
  if (!response.ok) {
    const providerError = await response.json().catch(() => ({}));
    console.error("Gemini statement import failed", response.status, providerError?.error?.status || "unknown");
    throw Object.assign(new Error(response.status === 429 ? "Statement analysis quota is temporarily exhausted." : "Gemini could not read this PDF statement."), { status: 502 });
  }
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
  const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim());
  return (Array.isArray(parsed.transactions) ? parsed.transactions : []).map((row) => ({
    date: parseStatementDate(row.date), merchant: String(row.merchant || "Imported transaction").trim().slice(0, 120),
    amount: Math.abs(Number(row.amount)), type: row.type === "income" ? "income" : "expense",
    currency: String(row.currency || "").toUpperCase(), category: row.type === "income" ? "Other" : statementCategory(row.merchant, row.category),
  })).filter((row) => row.date && row.amount > 0 && /^[A-Z]{3}$/.test(row.currency));
};

const nbuRateToUah = async (currency, date) => {
  if (currency === "UAH") return { rate: 1, date };
  const cacheKey = `${currency}:${date}`;
  if (fxCache.has(cacheKey)) return fxCache.get(cacheKey);
  for (let offset = 0; offset < 8; offset += 1) {
    const requested = new Date(`${date}T12:00:00Z`); requested.setUTCDate(requested.getUTCDate() - offset);
    const key = requested.toISOString().slice(0, 10).replace(/-/g, "");
    const response = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangenew?json&valcode=${encodeURIComponent(currency)}&date=${key}`);
    if (!response.ok) continue;
    const rows = await response.json().catch(() => []);
    const row = rows.find((item) => item.cc === currency && Number(item.rate) > 0);
    if (row) {
      const result = { rate: Number(row.rate), date: requested.toISOString().slice(0, 10) };
      fxCache.set(cacheKey, result); return result;
    }
  }
  throw new Error(`Official NBU rate for ${currency} on ${date} is unavailable.`);
};

const statementImport = async (req, res) => {
  try {
    const user = await getUser(req.headers.authorization);
    if (!user) return sendJson(res, 401, { error: "Please sign in before importing a statement." });
    const subscription = await supabaseAdmin(`subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=plan,status`);
    if (subscription?.[0]?.plan !== "Lifetime" || subscription?.[0]?.status !== "active") return sendJson(res, 403, { error: "Bank statement import is included with Lifetime." });
    const now = Date.now(); const recent = (statementLimits.get(user.id) || []).filter((time) => now - time < 10 * 60 * 1000);
    if (recent.length >= 8) return sendJson(res, 429, { error: "Statement import limit reached. Try again in a few minutes." });
    recent.push(now); statementLimits.set(user.id, recent);
    const { file = {}, targetCurrency = "EUR" } = await getBody(req, 12_000_000);
    const name = String(file.name || "statement").slice(0, 160);
    const mimeType = String(file.mimeType || "").toLowerCase(); const data = String(file.data || "");
    if (!data || data.length > 11_000_000 || !["text/csv", "application/csv", "application/vnd.ms-excel", "application/pdf"].includes(mimeType)) return sendJson(res, 400, { error: "Choose a CSV or PDF statement under 8 MB." });
    if (!["EUR", "USD", "PLN", "UAH"].includes(targetCurrency)) return sendJson(res, 400, { error: "Unsupported display currency." });
    const decoded = Buffer.from(data, "base64");
    const parsedRows = mimeType === "application/pdf" ? await parsePdfStatement(data) : parseCsvStatement(decoded.toString("utf8"));
    if (!parsedRows.length) return sendJson(res, 400, { error: "No transaction rows were found in this statement." });
    if (parsedRows.length > 500) return sendJson(res, 400, { error: "Import at most 500 transactions at a time." });
    const fileHash = createHash("sha256").update(decoded).digest("hex");
    const converted = [];
    for (let index = 0; index < parsedRows.length; index += 1) {
      const row = parsedRows[index];
      if (!["EUR", "USD", "PLN", "UAH"].includes(row.currency)) throw new Error(`Currency ${row.currency} is not supported yet.`);
      const source = await nbuRateToUah(row.currency, row.date); const target = await nbuRateToUah(targetCurrency, row.date);
      const rate = source.rate / target.rate;
      converted.push({ ...row, originalAmount: row.amount, originalCurrency: row.currency, amount: Math.round(row.amount * rate * 100) / 100,
        exchangeRate: rate, exchangeRateDate: source.date < target.date ? source.date : target.date,
        importHash: createHash("sha256").update(`${fileHash}:${index}:${row.date}:${row.merchant}:${row.amount}:${row.currency}`).digest("hex"),
      });
    }
    const months = [...new Set(converted.map((row) => `${row.date.slice(0, 7)}-01`))].sort();
    return sendJson(res, 200, { statement: { fileName: name, targetCurrency, months, transactions: converted } });
  } catch (error) {
    console.error("Statement import error", error.message);
    return sendJson(res, error.status || 400, { error: error instanceof SyntaxError ? "The statement response could not be parsed. Try CSV or a clearer PDF." : error.message || "The statement could not be processed." });
  }
};

const cryptoIds = (value) => [...new Set(String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter((item) => /^[a-z0-9-]{1,80}$/.test(item)))].slice(0, 10);
const cryptoHeaders = () => process.env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {};
const cachedJson = async (key, ttl, load) => {
  const cached = cryptoCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await load();
  cryptoCache.set(key, { data, expiresAt: Date.now() + ttl });
  return data;
};

const cryptoPrices = async (url, res) => {
  try {
    const ids = cryptoIds(url.searchParams.get("ids"));
    const currency = String(url.searchParams.get("currency") || "EUR").toLowerCase();
    if (!ids.length || !["eur", "usd", "pln", "uah"].includes(currency)) return sendJson(res, 400, { error: "Choose supported assets and currency." });
    const data = await cachedJson(`prices:${ids.join(",")}:${currency}`, 90_000, async () => {
      const endpoint = new URL("https://api.coingecko.com/api/v3/simple/price");
      endpoint.searchParams.set("ids", ids.join(","));
      endpoint.searchParams.set("vs_currencies", currency === "usd" ? "usd" : `${currency},usd`);
      endpoint.searchParams.set("include_24hr_change", "true");
      endpoint.searchParams.set("include_last_updated_at", "true");
      const response = await fetch(endpoint, { headers: cryptoHeaders() });
      if (!response.ok) throw Object.assign(new Error("Market prices are temporarily unavailable."), { status: response.status });
      const raw = await response.json();
      return Object.fromEntries(ids.map((id) => [id, {
        price: Number(raw[id]?.[currency] || 0),
        usdPrice: Number(raw[id]?.usd || 0),
        change24: Number(raw[id]?.[`${currency}_24h_change`] ?? raw[id]?.usd_24h_change ?? 0),
        updatedAt: Number(raw[id]?.last_updated_at || 0),
      }]));
    });
    return sendJson(res, 200, { prices: data });
  } catch (error) {
    return sendJson(res, error.status || 502, { error: error.message || "Market prices are unavailable." });
  }
};

const cryptoHistory = async (url, res) => {
  try {
    const ids = cryptoIds(url.searchParams.get("ids")).slice(0, 5);
    const currency = String(url.searchParams.get("currency") || "EUR").toLowerCase();
    const period = String(url.searchParams.get("period") || "1M").toUpperCase();
    const days = { "1D": 1, "7D": 7, "1M": 30, "3M": 90, "1Y": 365 }[period];
    if (!ids.length || !days || !["eur", "usd", "pln", "uah"].includes(currency)) return sendJson(res, 400, { error: "Choose a valid market period." });
    const series = await cachedJson(`history:${ids.join(",")}:${currency}:${period}`, 5 * 60_000, async () => Object.fromEntries(await Promise.all(ids.map(async (id) => {
      const endpoint = new URL(`https://api.coingecko.com/api/v3/coins/${id}/market_chart`);
      endpoint.searchParams.set("vs_currency", currency);
      endpoint.searchParams.set("days", String(days));
      const response = await fetch(endpoint, { headers: cryptoHeaders() });
      if (!response.ok) throw Object.assign(new Error("Market history is temporarily unavailable."), { status: response.status });
      const raw = await response.json();
      const prices = Array.isArray(raw.prices) ? raw.prices.map(([time, price]) => [Number(time), Number(price)]) : [];
      return [id, prices.length > 180 ? prices.filter((_, index) => index % Math.ceil(prices.length / 180) === 0) : prices];
    }))));
    return sendJson(res, 200, { series });
  } catch (error) {
    return sendJson(res, error.status || 502, { error: error.message || "Market history is unavailable." });
  }
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) return sendJson(res, 204, {});
  if (url.pathname === "/api/health") return sendJson(res, 200, { ok: true, service: "trek", time: new Date().toISOString() });
  if (url.pathname === "/api/account") {
    if (req.method !== "DELETE") return sendJson(res, 405, { error: "Method not allowed." });
    return deleteAccount(req, res);
  }
  if (url.pathname === "/api/stripe/webhook") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
    return stripeWebhook(req, res);
  }
  if (url.pathname === "/api/checkout") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
    return checkout(req, res);
  }
  if (url.pathname === "/api/billing-portal") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
    return billingPortal(req, res);
  }
  if (url.pathname === "/api/admin/status") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." });
    return sendJson(res, 200, { admin: Boolean(await authenticatedAdmin(req.headers.authorization)) });
  }
  if (url.pathname === "/api/admin/users") return adminUsers(req, res, url);
  if (url.pathname === "/api/coach") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
    return coach(req, res);
  }
  if (url.pathname === "/api/receipt") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
    return receiptScan(req, res);
  }
  if (url.pathname === "/api/import-statement") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
    return statementImport(req, res);
  }
  if (url.pathname === "/api/crypto-prices") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." });
    return cryptoPrices(url, res);
  }
  if (url.pathname === "/api/crypto-history") {
    if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed." });
    return cryptoHistory(url, res);
  }
  if (url.pathname === "/env.js") {
    const config = {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
      VITE_CHECKOUT_PLUS_URL: process.env.VITE_CHECKOUT_PLUS_URL || "",
      VITE_CHECKOUT_LIFETIME_URL: process.env.VITE_CHECKOUT_LIFETIME_URL || "",
      VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || process.env.PUBLIC_APP_URL || "",
      VITE_LEGAL_CONTROLLER_NAME: process.env.VITE_LEGAL_CONTROLLER_NAME || "",
      VITE_LEGAL_CONTROLLER_ADDRESS: process.env.VITE_LEGAL_CONTROLLER_ADDRESS || "",
      VITE_PRIVACY_EMAIL: process.env.VITE_PRIVACY_EMAIL || "",
      VITE_TURNSTILE_SITE_KEY: process.env.VITE_TURNSTILE_SITE_KEY || "",
    };
    res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(`window.__TREK_ENV__ = ${JSON.stringify(config).replace(/</g, "\\u003c")};`);
  }
  const requested = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  const candidate = requested.startsWith(root) ? requested : root;
  const file = existsSync(candidate) && (await stat(candidate)).isFile() ? candidate : path.join(root, "index.html");
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  const fileHeaders = { ...SECURITY_HEADERS };
  if (file.endsWith(`${path.sep}native-turnstile.html`)) {
    fileHeaders["Content-Security-Policy"] = "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'unsafe-inline'; connect-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors capacitor: ionic: https://trekmoney.pl";
    delete fileHeaders["X-Frame-Options"];
  }
  res.writeHead(200, { ...fileHeaders, "Content-Type": MIME[path.extname(file)] || "text/html; charset=utf-8", "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache" });
  createReadStream(file).pipe(res);
});

export { parseCsvStatement, parseStatementDate, statementCategory };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, "0.0.0.0", () => console.log(`Trek running on port ${port}`));
}
