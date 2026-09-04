/* Serverless proxy for the Anthropic Messages API.
 *
 * Why: the app must NOT ship your API key. This endpoint holds the key
 * server-side and forwards the request. Deploy it (e.g. to Vercel), set the
 * ANTHROPIC_API_KEY environment variable, then point the app at it via
 * window.__TREK_API_ENDPOINT__ in index.html.
 *
 * Vercel: put this file at /api/messages.js, `vercel deploy`, and set the env
 * var in Project Settings → Environment Variables. Your endpoint becomes
 * https://<your-app>.vercel.app/api/messages
 */
export default async function handler(req, res) {
  // CORS — the Capacitor webview origin is capacitor://localhost.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: { message: "ANTHROPIC_API_KEY is not set on the server" } });
  }

  try {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body,
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: { message: String(e && e.message ? e.message : e) } });
  }
}
