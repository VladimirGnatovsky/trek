import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number(process.env.PORT || 8080);
const limits = new Map();
let modelCache = { name: "", expiresAt: 0 };
const MIME = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

const getBody = async (req) => {
  const body = await getRawBody(req);
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
    const { question = "", summary = {} } = await getBody(req);
    const safeQuestion = String(question).slice(0, 600);
    const safeSummary = JSON.stringify(summary).slice(0, 4_000);
    const prompt = `You are Trek Coach, a calm personal budgeting coach. Use only the provided aggregated data. Answer directly in English without introducing yourself. Return a complete, concise response with exactly these plain-text sections: Insight, Next steps (2-3 numbered actions), Reflection question. Do not use Markdown symbols. Do not give investment, credit, tax, legal, or medical advice. Do not shame the user, do not invent facts, and say when the data is insufficient.\n\nAggregated money summary: ${safeSummary}\n\nUser question: ${safeQuestion || "What is one useful next step for me this month?"}`;
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
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
  if (url.pathname === "/api/coach") {
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed." });
    return coach(req, res);
  }
  if (url.pathname === "/env.js") {
    const config = {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
      VITE_CHECKOUT_PLUS_URL: process.env.VITE_CHECKOUT_PLUS_URL || "",
      VITE_CHECKOUT_LIFETIME_URL: process.env.VITE_CHECKOUT_LIFETIME_URL || "",
    };
    res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(`window.__TREK_ENV__ = ${JSON.stringify(config).replace(/</g, "\\u003c")};`);
  }
  const requested = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  const candidate = requested.startsWith(root) ? requested : root;
  const file = existsSync(candidate) && (await stat(candidate)).isFile() ? candidate : path.join(root, "index.html");
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "text/html; charset=utf-8" });
  createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => console.log(`Trek running on port ${port}`));
