import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
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
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_000) throw new Error("Request is too large.");
  }
  return JSON.parse(body || "{}");
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
    const prompt = `You are Trek Coach, a calm personal budgeting coach. Use only the provided aggregated data. Give a concise response in English: one short insight, 2-3 practical next steps, and one question to help the user reflect. Do not give investment, credit, tax, legal, or medical advice. Do not shame the user, do not invent facts, and say when the data is insufficient.\n\nAggregated money summary: ${safeSummary}\n\nUser question: ${safeQuestion || "What is one useful next step for me this month?"}`;
    const model = await resolveGeminiModel();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: geminiHeaders(),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 450 },
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
