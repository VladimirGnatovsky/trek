import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, X, Search, Camera, Loader2, ChevronLeft, ChevronRight, Check,
  Home, PieChart, Receipt, Settings as SettingsIcon, Download, Upload, WalletCards,
  Utensils, Car, PartyPopper, HeartPulse, ShoppingBag, RefreshCw, Tag,
} from "lucide-react";

/* ================================================================
 *  TREK — expense tracker
 *  Single-file app. Persists via window.storage (a localStorage shim
 *  is provided in standalone builds). AI features (receipt scan +
 *  quick-add parsing) call Anthropic; in a standalone build add your
 *  API key in Settings, or point at your own proxy.
 * ================================================================ */

const CATEGORIES = [
  { id: "food", label: "Food", color: "#E8654B", Icon: Utensils },
  { id: "transport", label: "Transport", color: "#4C9BE8", Icon: Car },
  { id: "home", label: "Housing", color: "#B98CE8", Icon: Home },
  { id: "fun", label: "Entertainment", color: "#E85B9E", Icon: PartyPopper },
  { id: "health", label: "Health", color: "#4FC08D", Icon: HeartPulse },
  { id: "shopping", label: "Shopping", color: "#E8B84C", Icon: ShoppingBag },
  { id: "subs", label: "Subscriptions", color: "#5AC8D8", Icon: RefreshCw },
  { id: "other", label: "Other", color: "#8A929C", Icon: Tag },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
const catOf = (id) => CAT[id] || CAT.other;

const CURRENCIES = [
  { id: "UAH", sym: "₴", after: false },
  { id: "USD", sym: "$", after: false },
  { id: "EUR", sym: "€", after: false },
  { id: "PLN", sym: "zł", after: true },
];
const CUR = Object.fromEntries(CURRENCIES.map((c) => [c.id, c]));

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const TXN_KEY = "ledger:transactions";
const SET_KEY = "ledger:settings";
const REC_KEY = "ledger:recurring";
const RECEIPT_PREFIX = "ledger:receipt:";

/* ---------- helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ymOf(iso) { const [y, m, d] = iso.split("-"); return { y: +y, m: +m - 1, d: +d }; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function fmtNum(n) { return Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtCompact(n) {
  const a = Math.abs(n);
  if (a >= 1000) return (n / 1000).toFixed(a >= 10000 ? 0 : 1) + "k";
  return String(Math.round(n));
}
function dayLabel(iso) {
  const t = todayISO();
  if (iso === t) return "Today";
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  if (iso === yIso) return "Yesterday";
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/* ---------- persistence ---------- */
async function storeGet(key) { try { if (!window.storage) return null; const r = await window.storage.get(key); return r ? r.value : null; } catch { return null; } }
async function storeSet(key, value) { try { if (window.storage) await window.storage.set(key, value); } catch {} }
async function storeDelete(key) { try { if (window.storage) await window.storage.delete(key); } catch {} }

/* ---------- receipt image (memory-frugal: one working canvas) ---------- */
function isHeic(file) {
  const n = (file.name || "").toLowerCase(); const t = (file.type || "").toLowerCase();
  return t.includes("heic") || t.includes("heif") || n.endsWith(".heic") || n.endsWith(".heif");
}
function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error(isHeic(file)
      ? "can't open HEIC here — pick a JPEG or a screenshot"
      : "image load failed"));
    const viaReader = () => {
      const reader = new FileReader();
      reader.onload = () => { const img = new Image(); img.onload = () => resolve(img); img.onerror = fail; img.src = reader.result; };
      reader.onerror = () => reject(new Error("file read failed"));
      reader.readAsDataURL(file);
    };
    if (typeof createImageBitmap === "function") createImageBitmap(file).then(resolve).catch(viaReader);
    else viaReader();
  });
}
async function processReceiptImage(file) {
  const src = await decodeImage(file);
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new Error("image decode failed (0px)");
  const MAX = 1280;
  const scale = Math.min(1, MAX / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(src, 0, 0, w, h);
  const full = c.toDataURL("image/jpeg", 0.7);
  // tiny thumbnail from the already-small canvas
  const ts = Math.min(1, 120 / Math.max(w, h));
  const tc = document.createElement("canvas");
  tc.width = Math.round(w * ts); tc.height = Math.round(h * ts);
  tc.getContext("2d").drawImage(c, 0, 0, tc.width, tc.height);
  const thumb = tc.toDataURL("image/jpeg", 0.5);
  if (typeof src.close === "function") src.close();
  return { api: { mediaType: "image/jpeg", data: full.split(",")[1] }, view: full, thumb };
}

/* ---------- prompts ---------- */
const RECEIPT_PROMPT =
  "Read this receipt photo and extract the purchase. Respond with ONLY a single minified JSON object, " +
  "no markdown, with keys: " +
  '"amount" (number — final total paid, no symbol; null if none), ' +
  '"currency" ("UAH"/"USD"/"EUR"/"PLN" or null), "merchant" (short name or null), ' +
  '"date" ("YYYY-MM-DD" or null), ' +
  '"items" (array of {"name":string,"price":number}; [] if none; skip subtotal/tax/total rows), ' +
  '"category" (one of: food, transport, home, fun, health, shopping, subs, other), ' +
  '"confidence" ("high"/"low").';
function quickPrompt(text) {
  return "Parse this short spending note into one expense. Today is " + todayISO() + ". " +
    "Respond with ONLY a minified JSON object, no markdown, keys: " +
    '"amount" (number or null), "currency" ("UAH"/"USD"/"EUR"/"PLN" or null), ' +
    '"merchant" (short label or null), "date" ("YYYY-MM-DD"; resolve today/yesterday; null if unspecified), ' +
    '"category" (one of: food, transport, home, fun, health, shopping, subs, other), "confidence" ("high"/"low"). ' +
    'Note: "' + String(text).replace(/"/g, "'").slice(0, 200) + '"';
}

/* ---------- offline quick-add parser (no API) ---------- */
const KEYWORDS = {
  food: ["coffee","cafe","restaurant","lunch","dinner","breakfast","food","pizza","burger","sushi","bakery","кофе","кава","еда","їжа","ресторан","обед","обід","кафе"],
  transport: ["taxi","uber","bolt","bus","metro","train","fuel","gas","petrol","parking","такси","таксі","метро","автобус","бензин","проезд","проїзд","парковка"],
  home: ["rent","utilities","electricity","water","internet","аренда","оренда","квартплата","комуналка","свет","світло","вода","интернет","інтернет"],
  fun: ["movie","cinema","game","bar","club","concert","кино","кіно","игра","гра","бар","клуб","концерт"],
  health: ["pharmacy","drugstore","doctor","clinic","dentist","gym","аптека","врач","лікар","ліки","клиника","клініка","спортзал"],
  shopping: ["shop","store","clothes","amazon","zara","hm","ikea","магазин","одежда","одяг","покупки"],
  subs: ["subscription","netflix","spotify","icloud","youtube","подписка","підписка"],
};
function parseLocal(text) {
  const raw = String(text || "");
  const low = raw.toLowerCase();
  let currency = null;
  if (/₴|uah|грн/i.test(raw)) currency = "UAH";
  else if (/\$|usd|дол/i.test(raw)) currency = "USD";
  else if (/€|eur|евро|євро/i.test(raw)) currency = "EUR";
  else if (/zł|pln|злот/i.test(raw)) currency = "PLN";
  let date = null;
  if (/\b(today|сегодня|сьогодні)\b/i.test(raw)) date = todayISO();
  else if (/\b(yesterday|вчера|вчора)\b/i.test(raw)) { const d = new Date(); d.setDate(d.getDate() - 1); date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  const nums = raw.match(/\d+(?:[.,]\d{1,2})?/g) || [];
  let amount = null;
  if (nums.length) {
    const withDec = nums.filter((n) => /[.,]/.test(n));
    const pick = (withDec.length ? withDec : nums).map((n) => parseFloat(n.replace(",", "."))).filter((x) => Number.isFinite(x));
    if (pick.length) amount = Math.max(...pick);
  }
  let category = "other";
  outer: for (const [cat, words] of Object.entries(KEYWORDS)) for (const w of words) if (low.includes(w)) { category = cat; break outer; }
  let note = raw
    .replace(/\d+(?:[.,]\d{1,2})?/g, "")
    .replace(/₴|\$|€|zł|uah|usd|eur|pln|грн/gi, "")
    .replace(/\b(today|yesterday|сегодня|вчера|сьогодні|вчора)\b/gi, "")
    .replace(/\s+/g, " ").trim().replace(/^[-–—,.\s]+|[-–—,.\s]+$/g, "");
  if (note) note = note.charAt(0).toUpperCase() + note.slice(1);
  return { amount, currency, date, category, merchant: note || null, confidence: amount ? "high" : "low" };
}

/* ---------- Gemini helpers (auto-discovers a working model) ---------- */
async function listGeminiModels(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
  if (!res.ok) { let d = ""; try { const e = await res.json(); d = (e && e.error && e.error.message) || ""; } catch {} throw new Error("Gemini models " + res.status + (d ? ": " + d : "")); }
  const data = await res.json();
  return (data.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"));
}
function pickGeminiModel(models) {
  const names = models.map((m) => String(m.name || "").replace(/^models\//, "")).filter(Boolean);
  const score = (n) => { const m = n.match(/gemini-(\d+(?:\.\d+)?)/i); return m ? parseFloat(m[1]) : 0; };
  const flash = names.filter((n) => /gemini/i.test(n) && /flash/i.test(n) && !/embed|aqa|thinking|image|tts|native-audio/i.test(n));
  flash.sort((a, b) => score(b) - score(a));
  if (flash[0]) return flash[0];
  const any = names.filter((n) => /gemini/i.test(n) && !/embed|aqa|tts/i.test(n));
  any.sort((a, b) => score(b) - score(a));
  return any[0] || names[0] || null;
}
async function geminiGenerate(m, apiKey, mediaType, dataB64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mediaType, data: dataB64 } }, { text: RECEIPT_PROMPT }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 1024 },
    }),
  });
  if (!res.ok) { let d = ""; try { const e = await res.json(); d = (e && e.error && e.error.message) || ""; } catch {} const err = new Error("Gemini " + res.status + (d ? ": " + d : "")); err.status = res.status; throw err; }
  const data = await res.json();
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = (parts || []).map((p) => p.text || "").join("").trim();
  const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (!clean) throw new Error("empty response");
  return JSON.parse(clean);
}

function Donut({ data, size = 150, thickness = 20 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel2)" strokeWidth={thickness} />
        {total > 0 && data.map((d, i) => {
          const f = d.value / total;
          const dash = f * C;
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color}
              strokeWidth={thickness} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C} />
          );
          acc += f;
          return el;
        })}
      </g>
    </svg>
  );
}

const NAV = [
  { id: "home", label: "Home", Icon: Home },
  { id: "stats", label: "Stats", Icon: PieChart },
  { id: "txns", label: "List", Icon: Receipt },
  { id: "settings", label: "Settings", Icon: SettingsIcon },
];

export default function Trek() {
  const [txns, setTxns] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [currency, setCurrency] = useState("UAH");
  const [budget, setBudget] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [provider, setProvider] = useState("gemini"); // "gemini" | "anthropic"
  const [loaded, setLoaded] = useState(false);

  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [tab, setTab] = useState("home");
  const [search, setSearch] = useState("");

  // add sheet
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState("");
  const [catId, setCatId] = useState("food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState("expense");
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [err, setErr] = useState("");
  const [quick, setQuick] = useState("");
  const [parsing, setParsing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [pending, setPending] = useState(null);
  const fileRef = useRef(null);
  const importRef = useRef(null);
  const geminiModelRef = useRef(null);

  // budget editor
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  // receipt viewer
  const [viewer, setViewer] = useState(null);

  /* load */
  useEffect(() => {
    (async () => {
      const t = await storeGet(TXN_KEY);
      const s = await storeGet(SET_KEY);
      const r = await storeGet(REC_KEY);
      if (t) { try { setTxns(JSON.parse(t)); } catch {} }
      if (s) { try {
        const p = JSON.parse(s);
        if (CUR[p.currency]) setCurrency(p.currency);
        if (typeof p.budget === "number" && p.budget > 0) setBudget(p.budget);
        // Never restore legacy browser-stored AI keys. Use a server proxy instead.
        if (p.model) setModel(p.model);
        if (p.endpoint) setEndpoint(p.endpoint);
        if (p.provider) setProvider(p.provider);
        else if (p.apiKey) setProvider("anthropic"); // migrate existing keys
      } catch {} }
      if (r) { try { setRecurring(JSON.parse(r)); } catch {} }
      setLoaded(true);
    })();
  }, []);
  useEffect(() => { if (loaded) storeSet(TXN_KEY, JSON.stringify(txns)); }, [txns, loaded]);
  useEffect(() => { if (loaded) storeSet(REC_KEY, JSON.stringify(recurring)); }, [recurring, loaded]);
  useEffect(() => { if (loaded) storeSet(SET_KEY, JSON.stringify({ currency, budget, apiKey, model, endpoint, provider })); },
    [currency, budget, apiKey, model, endpoint, provider, loaded]);

  /* derived */
  const monthTxns = useMemo(
    () => txns.filter((t) => { const { y, m } = ymOf(t.date); return y === cursor.y && m === cursor.m; }),
    [txns, cursor]
  );
  const expenses = useMemo(() => monthTxns.filter((t) => t.kind !== "income"), [monthTxns]);
  const income = useMemo(() => monthTxns.filter((t) => t.kind === "income"), [monthTxns]);
  const total = useMemo(() => expenses.reduce((s, t) => s + t.amount, 0), [expenses]);
  const incomeTotal = useMemo(() => income.reduce((s, t) => s + t.amount, 0), [income]);
  const balance = incomeTotal - total;

  const monthTotal = useMemo(() => {
    const map = {};
    for (const t of txns) { if (t.kind === "income") continue; const { y, m } = ymOf(t.date); const k = y + "-" + m; map[k] = (map[k] || 0) + t.amount; }
    return (y, m) => map[y + "-" + m] || 0;
  }, [txns]);

  const prevTotal = useMemo(() => { let m = cursor.m - 1, y = cursor.y; if (m < 0) { m = 11; y--; } return monthTotal(y, m); }, [cursor, monthTotal]);
  const deltaPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const byCat = useMemo(() => {
    const map = {};
    for (const t of expenses) map[t.category] = (map[t.category] || 0) + t.amount;
    return Object.entries(map).map(([id, sum]) => ({ id, sum, cat: catOf(id) })).sort((a, b) => b.sum - a.sum);
  }, [expenses]);

  const series = useMemo(() => {
    const arr = []; let y = cursor.y, m = cursor.m;
    for (let i = 0; i < 6; i++) { arr.unshift({ y, m, label: MONTHS_SHORT[m], total: monthTotal(y, m) }); m--; if (m < 0) { m = 11; y--; } }
    return arr;
  }, [cursor, monthTotal]);
  const seriesMax = Math.max(1, ...series.map((s) => s.total));

  const daily = useMemo(() => {
    const n = daysInMonth(cursor.y, cursor.m);
    const arr = Array.from({ length: n }, (_, i) => ({ day: i + 1, total: 0 }));
    for (const t of expenses) { const { d } = ymOf(t.date); if (arr[d - 1]) arr[d - 1].total += t.amount; }
    return arr;
  }, [expenses, cursor]);
  const dailyMax = Math.max(1, ...daily.map((d) => d.total));

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const src = q
      ? monthTxns.filter((t) => (t.note || "").toLowerCase().includes(q) || catOf(t.category).label.toLowerCase().includes(q))
      : monthTxns;
    const map = {};
    for (const t of src) (map[t.date] = map[t.date] || []).push(t);
    return Object.keys(map).sort((a, b) => (a < b ? 1 : -1)).map((d) => ({ date: d, items: map[d].sort((a, b) => b.createdAt - a.createdAt) }));
  }, [monthTxns, search]);

  const remaining = budget - total;
  const budgetPct = budget > 0 ? Math.min(100, (total / budget) * 100) : 0;
  const overBudget = budget > 0 && total > budget;

  const curObj = CUR[currency];
  const Money = ({ n, className, style }) => (
    <span className={className} style={style}>
      {!curObj.after && <span className="tk-sym">{curObj.sym}</span>}{fmtNum(n)}{curObj.after && <span className="tk-sym"> {curObj.sym}</span>}
    </span>
  );

  /* ---------- actions ---------- */
  const shiftMonth = (dir) => setCursor((c) => { let m = c.m + dir, y = c.y; if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; } return { y, m }; });

  const openAdd = () => { setErr(""); setScan(null); setShowAdd(true); };
  const resetForm = () => { setAmount(""); setNote(""); setQuick(""); setPending(null); setScan(null); setErr(""); setDate(todayISO()); setCatId("food"); setKind("expense"); setRepeatMonthly(false); };

  const addTxn = () => {
    const value = parseFloat(String(amount).replace(",", "."));
    if (!value || value <= 0) { setErr("Enter an amount greater than zero"); return; }
    setErr("");
    const id = uid();
    const txn = { id, amount: Math.round(value * 100) / 100, kind, category: kind === "income" ? "other" : catId, note: note.trim(), date, createdAt: Date.now() };
    if (pending) {
      if (pending.thumb) txn.thumb = pending.thumb;
      if (pending.items && pending.items.length) txn.items = pending.items;
      if (pending.view) { txn.receipt = true; storeSet(RECEIPT_PREFIX + id, pending.view); }
    }
    setTxns((prev) => [...prev, txn]);
    if (repeatMonthly) setRecurring((prev) => [...prev, { ...txn, id: uid(), recurring: true, day: ymOf(date).d }]);
    const { y, m } = ymOf(date); setCursor({ y, m });
    resetForm(); setShowAdd(false);
  };

  const removeTxn = (id) => { setTxns((prev) => prev.filter((t) => t.id !== id)); storeDelete(RECEIPT_PREFIX + id); setViewer((v) => (v && v.txn.id === id ? null : v)); };

  const exportBackup = () => {
    const payload = { version: 2, exportedAt: new Date().toISOString(), transactions: txns, recurring, settings: { currency, budget } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `trek-backup-${todayISO()}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const importBackup = async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.transactions)) throw new Error("invalid");
      const clean = data.transactions.filter((t) => t && typeof t.amount === "number" && t.id && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
      if (!window.confirm(`Replace local data with ${clean.length} imported transactions?`)) return;
      setTxns(clean); setRecurring(Array.isArray(data.recurring) ? data.recurring : []);
      if (data.settings?.currency && CUR[data.settings.currency]) setCurrency(data.settings.currency);
      if (Number.isFinite(data.settings?.budget)) setBudget(data.settings.budget);
    } catch { window.alert("That backup could not be imported."); }
  };

  const openReceipt = async (t) => {
    if (!t.receipt && !(t.items && t.items.length)) return;
    setViewer({ txn: t, img: null, loading: !!t.receipt });
    if (t.receipt) { const img = await storeGet(RECEIPT_PREFIX + t.id); setViewer((v) => (v && v.txn.id === t.id ? { ...v, img, loading: false } : v)); }
  };

  const startEditBudget = () => { setBudgetInput(budget ? String(budget) : ""); setEditingBudget(true); };
  const saveBudget = () => { const v = parseFloat(String(budgetInput).replace(",", ".")); setBudget(Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0); setEditingBudget(false); };

  const callAI = async (bodyObj) => {
    const url = endpoint || "https://api.anthropic.com/v1/messages";
    const headers = { "Content-Type": "application/json" };
    if (!endpoint && apiKey) {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
    }
    const defaultModel = (apiKey || endpoint) ? "claude-sonnet-5" : "claude-sonnet-4-6";
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ ...bodyObj, model: bodyObj.model || model || defaultModel }) });
    if (!res.ok) { let d = ""; try { const e = await res.json(); d = (e && e.error && e.error.message) || ""; } catch {} throw new Error("API " + res.status + (d ? ": " + d : "")); }
    const data = await res.json();
    if (data && data.error) throw new Error(data.error.message || "API error");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    if (!clean) throw new Error("empty response");
    return JSON.parse(clean);
  };

  const aiHint = () => !endpoint ? " Add your secure AI proxy URL in Settings." : "";

  const applyParsed = (p) => {
    const value = typeof p.amount === "number" ? p.amount : parseFloat(p.amount);
    let filled = false;
    if (value && value > 0) { setAmount(String(value)); filled = true; }
    if (p.merchant) setNote(String(p.merchant).slice(0, 80));
    if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) setDate(p.date);
    if (p.category && CAT[p.category]) setCatId(p.category);
    if (p.currency && CUR[p.currency]) setCurrency(p.currency);
    return filled;
  };

  // Quick add is fully offline — no API, no key needed.
  const parseQuick = (text) => {
    const t = (text || "").trim();
    if (!t) return;
    const filled = applyParsed(parseLocal(t));
    setPending(null);
    if (filled) { setScan({ ok: true, text: 'Filled from "' + t + '". Check and Save.' }); setQuick(""); }
    else setScan({ ok: false, text: 'Add a number, e.g. "coffee 4.50".' });
  };

  // Vision extraction for receipts — routes to Gemini (free tier), Anthropic, or a proxy.
  const visionExtract = async (mediaType, dataB64) => {
    if (!endpoint) throw new Error("secure AI proxy is not configured");
    if (provider === "gemini" && !endpoint) {
      if (!apiKey) throw new Error("no Gemini key");
      let m = model || geminiModelRef.current;
      if (!m) {
        m = pickGeminiModel(await listGeminiModels(apiKey));
        if (!m) throw new Error("no usable Gemini model for this key");
        geminiModelRef.current = m;
      }
      try {
        return await geminiGenerate(m, apiKey, mediaType, dataB64);
      } catch (e) {
        // stale model name → discover a current one and retry once
        if (e && e.status === 404) {
          const picked = pickGeminiModel(await listGeminiModels(apiKey));
          if (picked && picked !== m) { geminiModelRef.current = picked; return await geminiGenerate(picked, apiKey, mediaType, dataB64); }
        }
        throw e;
      }
    }
    // A server proxy keeps provider credentials out of the app and browser storage.
    return callAI({
      max_tokens: 1000,
      system: "You are a receipt-scanning assistant. Respond with ONLY a minified JSON object, no markdown.",
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: dataB64 } },
        { type: "text", text: RECEIPT_PROMPT },
      ] }],
    });
  };

  const onFile = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) scanReceipt(f); };
  const scanReceipt = async (file) => {
    setScanning(true); setScan(null); setErr("");
    try {
      const proc = await processReceiptImage(file);
      const p = await visionExtract(proc.api.mediaType, proc.api.data);
      const filled = applyParsed(p);
      const items = Array.isArray(p.items) ? p.items.filter((it) => it && (it.name || it.title)).slice(0, 40).map((it) => {
        const price = typeof it.price === "number" ? it.price : parseFloat(it.price);
        return { name: String(it.name || it.title).slice(0, 60), price: Number.isFinite(price) ? price : null };
      }) : [];
      setPending({ thumb: proc.thumb, view: proc.view, items });
      if (filled) {
        const bits = ["Filled from receipt"];
        if (p.merchant) bits.push(String(p.merchant));
        if (items.length) bits.push(items.length + (items.length === 1 ? " item" : " items"));
        setScan({ ok: true, text: bits.join(" · ") + ". Check and Save." + (p.confidence === "low" ? " Low confidence — verify the amount." : "") });
      } else setScan({ ok: false, text: "Couldn't find a total. Enter the amount manually." });
    } catch (e) {
      setScan({ ok: false, text: "Couldn't read the receipt — " + (e && e.message ? e.message : "error") + "." + aiHint() });
    } finally { setScanning(false); }
  };

  /* ================= views ================= */
  const MonthBar = () => (
    <div className="tk-monthbar">
      <button className="tk-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
      <div className="tk-monthlabel">{MONTHS[cursor.m]} {cursor.y}</div>
      <button className="tk-nav" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
    </div>
  );

  const renderHome = () => (
    <>
      <div className="tk-topbar"><div className="tk-brand"><CompassMark /><span className="tk-word">TREK</span></div></div>
      <MonthBar />
      <section className="tk-card tk-hero">
        <div className="tk-eyebrow">Available this month</div>
        <Money n={balance} className="tk-total" />
        <div className="tk-balancegrid"><span>Income <Money n={incomeTotal} /></span><span>Spent <Money n={total} /></span></div>
        <div className="tk-count">
          {monthTxns.length} {monthTxns.length === 1 ? "transaction" : "transactions"}
          {deltaPct !== null && <span className={"tk-delta " + (deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "")}>{deltaPct > 0 ? "↑" : deltaPct < 0 ? "↓" : "→"} {Math.abs(deltaPct)}% vs last month</span>}
        </div>
        {budget > 0 && !editingBudget && (
          <div className="tk-budget">
            <div className="tk-budgetbar"><span style={{ width: budgetPct + "%", background: overBudget ? "#E8654B" : "var(--signal)" }} /></div>
            <div className="tk-budgetrow">
              <span className={overBudget ? "tk-over" : ""}>{overBudget ? "Over by " : "Remaining "}<Money n={Math.abs(remaining)} /></span>
              <button className="tk-budgetedit" onClick={startEditBudget}>Budget <Money n={budget} /></button>
            </div>
          </div>
        )}
        {budget === 0 && !editingBudget && <button className="tk-setbudget" onClick={startEditBudget}>+ Set monthly budget</button>}
        {editingBudget && (
          <div className="tk-budgetedit-row">
            <input className="tk-inp tk-mono" inputMode="decimal" placeholder="Monthly budget" value={budgetInput} autoFocus
              onChange={(e) => setBudgetInput(e.target.value.replace(/[^\d.,]/g, ""))} onKeyDown={(e) => e.key === "Enter" && saveBudget()} />
            <button className="tk-btn-primary" onClick={saveBudget}>Save</button>
            {budget > 0 && <button className="tk-btn-ghost" onClick={() => { setBudget(0); setEditingBudget(false); }}>Off</button>}
          </div>
        )}
      </section>

      {byCat.length > 0 && (
        <section className="tk-card">
          <div className="tk-cardhead"><span className="tk-eyebrow">By category</span><button className="tk-link" onClick={() => setTab("stats")}>Details</button></div>
          <div className="tk-donutwrap">
            <div className="tk-donutbox">
              <Donut data={byCat.map((r) => ({ value: r.sum, color: r.cat.color }))} />
              <div className="tk-donutctr"><div className="tk-donutlbl">total</div><Money n={total} className="tk-donuttot" /></div>
            </div>
            <ul className="tk-leg">
              {byCat.slice(0, 5).map((r) => (
                <li key={r.id}><span className="tk-dot" style={{ background: r.cat.color }} /><span className="tk-legname">{r.cat.label}</span><span className="tk-legpct">{Math.round((r.sum / total) * 100)}%</span></li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="tk-card">
        <div className="tk-cardhead"><span className="tk-eyebrow">Recent</span>{monthTxns.length > 4 && <button className="tk-link" onClick={() => setTab("txns")}>See all</button>}</div>
        {monthTxns.length === 0 ? <div className="tk-empty">No expenses yet this month. Tap + to add one.</div>
          : <div className="tk-rows">{monthTxns.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((t) => <TxnRow key={t.id} t={t} />)}</div>}
      </section>
    </>
  );

  const renderStats = () => (
    <>
      <div className="tk-topbar"><h1 className="tk-h1">Stats</h1></div>
      <MonthBar />
      <section className="tk-card">
        <div className="tk-eyebrow">Total spent</div>
        <Money n={total} className="tk-total sm" />
        <div className="tk-donutwrap big">
          <div className="tk-donutbox">
            <Donut data={byCat.map((r) => ({ value: r.sum, color: r.cat.color }))} size={168} thickness={22} />
            <div className="tk-donutctr"><div className="tk-donutlbl">this month</div><Money n={total} className="tk-donuttot" /></div>
          </div>
        </div>
        {byCat.length === 0 ? <div className="tk-empty">No data for this month.</div> : (
          <ul className="tk-catlist">
            {byCat.map((r) => { const Ico = r.cat.Icon; return (
              <li key={r.id}>
                <span className="tk-catico" style={{ color: r.cat.color, background: r.cat.color + "22" }}><Ico size={16} /></span>
                <div className="tk-catmain"><div className="tk-catname">{r.cat.label}</div><div className="tk-catpct">{Math.round((r.sum / total) * 100)}%</div></div>
                <Money n={r.sum} className="tk-catsum" />
              </li>
            ); })}
          </ul>
        )}
      </section>

      {recurring.length > 0 && <section className="tk-card">
        <div className="tk-cardhead"><span className="tk-eyebrow">Monthly recurring</span><span className="tk-recurring-count">{recurring.length} planned</span></div>
        <div className="tk-rows">{recurring.slice(0, 4).map((t) => <div className="tk-row" key={t.id}><span className="tk-rowico"><RefreshCw size={16} /></span><div className="tk-rowmain"><div className="tk-rowtop">{t.note || catOf(t.category).label}</div><div className="tk-rowsub">Every month · day {t.day}</div></div><Money n={t.amount} className="tk-rowsum" /><button className="tk-del" onClick={() => setRecurring((p) => p.filter((x) => x.id !== t.id))} aria-label="Delete recurring item"><X size={15} /></button></div>)}</div>
      </section>}

      <section className="tk-card">
        <div className="tk-eyebrow">Last 6 months</div>
        <div className="tk-bars">
          {series.map((s, i) => { const isCur = s.y === cursor.y && s.m === cursor.m; const h = s.total > 0 ? Math.max(5, (s.total / seriesMax) * 96) : 2; return (
            <button key={i} className={"tk-bar" + (isCur ? " on" : "")} onClick={() => setCursor({ y: s.y, m: s.m })} aria-label={s.label + " " + s.y}>
              <span className="tk-barval">{s.total > 0 ? fmtCompact(s.total) : ""}</span>
              <span className="tk-barcol" style={{ height: h + "px" }} /><span className="tk-barlbl">{s.label}</span>
            </button>
          ); })}
        </div>
      </section>

      <section className="tk-card">
        <div className="tk-eyebrow">Daily · {MONTHS_SHORT[cursor.m]} {cursor.y}</div>
        <div className="tk-daily">
          {daily.map((d) => { const h = d.total > 0 ? Math.max(3, (d.total / dailyMax) * 76) : 0; const show = d.day === 1 || d.day % 7 === 0 || d.day === daily.length; return (
            <div key={d.day} className="tk-dcol" title={d.day + ": " + fmtNum(d.total)}>
              <span className="tk-dbar" style={{ height: h + "px" }} />
              <span className="tk-dlbl">{show ? d.day : ""}</span>
            </div>
          ); })}
        </div>
      </section>
    </>
  );

  const renderTxns = () => (
    <>
      <div className="tk-topbar"><h1 className="tk-h1">Transactions</h1></div>
      <MonthBar />
      <div className="tk-searchwrap">
        <Search size={16} className="tk-searchico" />
        <input className="tk-search" placeholder="Search notes or categories" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && <button className="tk-searchclear" onClick={() => setSearch("")} aria-label="Clear"><X size={15} /></button>}
      </div>
      {grouped.length === 0 ? <div className="tk-card"><div className="tk-empty">{search ? "Nothing matches your search." : "No expenses this month. Tap + to add one."}</div></div>
        : grouped.map((g) => (
          <section key={g.date} className="tk-card tk-group">
            <div className="tk-daybar"><span className="tk-day">{dayLabel(g.date)}</span><span className="tk-dayline" /><Money n={g.items.reduce((s, t) => s + (t.kind === "income" ? -t.amount : t.amount), 0)} className="tk-daysum" /></div>
            <div className="tk-rows">{g.items.map((t) => <TxnRow key={t.id} t={t} />)}</div>
          </section>
        ))}
    </>
  );

  const renderSettings = () => (
    <>
      <div className="tk-topbar"><h1 className="tk-h1">Settings</h1></div>
      <section className="tk-card">
        <div className="tk-eyebrow">Currency</div>
        <div className="tk-curgrid">
          {CURRENCIES.map((c) => <button key={c.id} className={"tk-curbtn" + (currency === c.id ? " on" : "")} onClick={() => setCurrency(c.id)}>{c.sym} {c.id}</button>)}
        </div>
      </section>
      <section className="tk-card">
        <div className="tk-eyebrow">Monthly budget</div>
        <div className="tk-budgetedit-row" style={{ marginTop: 12 }}>
          <input className="tk-inp tk-mono" inputMode="decimal" placeholder="0 = off" value={budgetInput || (budget ? String(budget) : "")}
            onChange={(e) => setBudgetInput(e.target.value.replace(/[^\d.,]/g, ""))} />
          <button className="tk-btn-primary" onClick={() => { const v = parseFloat(String(budgetInput).replace(",", ".")); setBudget(Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0); }}>Save</button>
        </div>
      </section>
      <section className="tk-card">
        <div className="tk-eyebrow">Receipt scanning</div>
        <p className="tk-help">Quick add works offline. For receipt recognition connect a secure server proxy; provider keys are never stored in the app.</p>
        <input className="tk-inp" placeholder="Secure AI proxy URL" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} inputMode="url" />
        <p className="tk-help">{endpoint ? "Scanning is configured through your proxy." : "Scanning is off — your financial data remains on this device."}</p>
      </section>
      <section className="tk-card">
        <div className="tk-eyebrow">Data</div>
        <p className="tk-help">{txns.length} transactions saved on this device.</p>
        <div className="tk-data-actions">
          <button className="tk-curbtn" onClick={() => exportBackup()}><Download size={15} /> Export backup</button>
          <button className="tk-curbtn" onClick={() => importRef.current?.click()}><Upload size={15} /> Import backup</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={importBackup} />
        </div>
      </section>
      <div className="tk-foot">TREK · your data stays on this device</div>
    </>
  );

  function TxnRow({ t }) {
    const c = catOf(t.category); const Ico = c.Icon;
    const hasItems = t.items && t.items.length > 0;
    const openable = t.receipt || hasItems;
    const sub = [t.kind === "income" ? "Income" : (t.note ? c.label : null), hasItems ? t.items.length + (t.items.length === 1 ? " item" : " items") : null].filter(Boolean).join(" · ");
    return (
      <div className="tk-row">
        {t.thumb ? <img className="tk-thumb" src={t.thumb} alt="" onClick={() => openReceipt(t)} />
          : <span className="tk-rowico" style={{ color: c.color, background: c.color + "22" }}><Ico size={17} /></span>}
        <div className={"tk-rowmain" + (openable ? " tk-tap" : "")} onClick={openable ? () => openReceipt(t) : undefined}>
          <div className="tk-rowtop">{t.note || c.label}</div>{sub ? <div className="tk-rowsub">{sub}</div> : null}
        </div>
        <Money n={t.amount} className={(t.kind === "income" ? "tk-income " : "") + "tk-rowsum"} />
        <button className="tk-del" onClick={() => removeTxn(t.id)} aria-label="Delete"><X size={15} /></button>
      </div>
    );
  }

  const renderAddSheet = () => (
    <div className="tk-modal" onClick={() => setShowAdd(false)}>
      <div className="tk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tk-sheethead"><div className="tk-sheettitle">New {kind}</div><button className="tk-del" onClick={() => setShowAdd(false)} aria-label="Close"><X size={18} /></button></div>

        <div className="tk-kindtoggle"><button className={kind === "expense" ? "on" : ""} onClick={() => setKind("expense")}>Expense</button><button className={kind === "income" ? "on" : ""} onClick={() => setKind("income")}>Income</button></div>

        <div className="tk-quick">
          <input className="tk-quickinput" placeholder={'Quick add — e.g. "coffee 4.50" (⌨︎ mic works too)'} value={quick}
            onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && parseQuick(quick)} />
          <button className="tk-quickgo" onClick={() => parseQuick(quick)} disabled={!quick.trim()} aria-label="Parse">
            <Check size={16} />
          </button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />
        <button className="tk-scan" onClick={() => fileRef.current && fileRef.current.click()} disabled={scanning}>
          {scanning ? <Loader2 size={17} className="tk-spin" /> : <Camera size={17} />}{scanning ? "Reading receipt…" : "Scan or upload receipt"}
        </button>
        {scan && <div className={"tk-scanmsg " + (scan.ok ? "ok" : "bad")}>{scan.text}</div>}

        <div className="tk-amountrow">
          {!curObj.after && <span className="tk-amountsym">{curObj.sym}</span>}
          <input className="tk-amount" inputMode="decimal" placeholder="0" value={amount}
            onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); if (err) setErr(""); }} onKeyDown={(e) => e.key === "Enter" && addTxn()} />
          {curObj.after && <span className="tk-amountsym">{curObj.sym}</span>}
        </div>

        {kind === "expense" && <div className="tk-chips">
          {CATEGORIES.map((c) => { const Ico = c.Icon; return (
            <button key={c.id} className={"tk-chip" + (catId === c.id ? " on" : "")} onClick={() => setCatId(c.id)} style={catId === c.id ? { borderColor: c.color, color: c.color } : undefined}>
              <Ico size={14} /> {c.label}
            </button>
          ); })}
        </div>}

        <div className="tk-formrow">
          <input className="tk-inp" placeholder="Note (optional)" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTxn()} />
          <input className="tk-inp tk-mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {kind === "expense" && <label className="tk-repeat"><input type="checkbox" checked={repeatMonthly} onChange={(e) => setRepeatMonthly(e.target.checked)} /> Repeat monthly</label>}
        {err && <div className="tk-err">{err}</div>}
        <button className="tk-submit" onClick={addTxn}><Plus size={18} strokeWidth={2.5} /> Save {kind}</button>
      </div>
    </div>
  );

  const renderViewer = () => (
    <div className="tk-modal" onClick={() => setViewer(null)}>
      <div className="tk-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tk-sheethead">
          <div><div className="tk-sheettitle">{viewer.txn.note || catOf(viewer.txn.category).label}</div><div className="tk-sheetsub">{dayLabel(viewer.txn.date)} · <Money n={viewer.txn.amount} /></div></div>
          <button className="tk-del" onClick={() => setViewer(null)} aria-label="Close"><X size={18} /></button>
        </div>
        {viewer.txn.receipt && (
          <div className="tk-receiptimg">
            {viewer.loading ? <div className="tk-imgload"><Loader2 size={18} className="tk-spin" /> Loading…</div>
              : viewer.img ? <img src={viewer.img} alt="Receipt" /> : <div className="tk-imgload">Image unavailable</div>}
          </div>
        )}
        {viewer.txn.items && viewer.txn.items.length > 0 && (
          <ul className="tk-items">{viewer.txn.items.map((it, i) => <li key={i}><span className="tk-itname">{it.name}</span>{typeof it.price === "number" ? <span className="tk-itprice">{fmtNum(it.price)}</span> : null}</li>)}</ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="tk-root">
      <style>{CSS}</style>
      <div className="tk-app">
        <main className="tk-main">
          {tab === "home" && renderHome()}
          {tab === "stats" && renderStats()}
          {tab === "txns" && renderTxns()}
          {tab === "settings" && renderSettings()}
        </main>

        <button className="tk-fab" onClick={openAdd} aria-label="Add expense"><Plus size={26} strokeWidth={2.5} /></button>

        <nav className="tk-tabbar">
          {NAV.map((n) => { const Ico = n.Icon; return (
            <button key={n.id} className={"tk-tab" + (tab === n.id ? " on" : "")} onClick={() => setTab(n.id)}><Ico size={21} /><span>{n.label}</span></button>
          ); })}
        </nav>
      </div>
      {showAdd && renderAddSheet()}
      {viewer && renderViewer()}
    </div>
  );
}

function CompassMark() {
  return (
    <span className="tk-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <circle cx="12" cy="12" r="10.2" fill="none" stroke="var(--steel)" strokeWidth="1.3" />
        <polygon points="12,3.6 14.1,12 12,12" fill="var(--signal)" />
        <polygon points="12,20.4 14.1,12 12,12" fill="var(--steel)" />
        <polygon points="12,3.6 9.9,12 12,12" fill="var(--signal)" opacity="0.7" />
        <polygon points="12,20.4 9.9,12 12,12" fill="var(--steel)" opacity="0.7" />
        <circle cx="12" cy="12" r="1.5" fill="var(--panel)" stroke="var(--steel)" strokeWidth="1" />
      </svg>
    </span>
  );
}

const CSS = `
:root{
  --bg:#15171B; --panel:#1C1F25; --panel2:#23272E; --line:#2C313A;
  --ink:#ECEAE4; --muted:#868D97; --faint:#565D67;
  --signal:#CB9160; --signal-dim:rgba(203,145,96,0.13); --steel:#9AA3AD;
  --mono:ui-monospace,'SF Mono','JetBrains Mono','Roboto Mono',Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --navh:64px;
}
.tk-root{background:var(--bg);min-height:100vh;color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;}
.tk-root *{box-sizing:border-box;}
.tk-app{max-width:480px;margin:0 auto;position:relative;min-height:100vh;}
.tk-main{padding:14px 14px calc(var(--navh) + env(safe-area-inset-bottom) + 24px);display:flex;flex-direction:column;gap:12px;}

.tk-topbar{display:flex;align-items:center;justify-content:center;position:relative;padding:8px 0 2px;}
.tk-h1{font-size:19px;font-weight:700;letter-spacing:.01em;margin:0;}
.tk-brand{display:flex;align-items:center;gap:9px;}
.tk-mark{display:grid;place-items:center;width:32px;height:32px;background:var(--panel2);border:1px solid var(--line);border-radius:9px;}
.tk-word{font-weight:700;letter-spacing:.22em;font-size:15px;}

.tk-monthbar{display:flex;align-items:center;justify-content:space-between;padding:2px 4px;}
.tk-nav{width:34px;height:34px;display:grid;place-items:center;background:var(--panel);border:1px solid var(--line);border-radius:9px;color:var(--muted);cursor:pointer;transition:.15s;}
.tk-nav:hover{color:var(--ink);border-color:var(--faint);}
.tk-monthlabel{font-size:14px;font-weight:500;}

.tk-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;}
.tk-cardhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.tk-eyebrow{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);}
.tk-link{background:transparent;border:0;color:var(--signal);font-size:12px;cursor:pointer;font-family:var(--sans);}

.tk-hero{}
.tk-total{display:block;font-family:var(--mono);font-size:42px;font-weight:600;letter-spacing:-.02em;line-height:1.05;margin-top:8px;}
.tk-total.sm{font-size:30px;margin-top:4px;}
.tk-sym{color:var(--muted);font-weight:400;margin-right:2px;}
.tk-count{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:6px;letter-spacing:.03em;}
.tk-delta{margin-left:8px;}
.tk-delta.up{color:#E8654B;} .tk-delta.down{color:#4FC08D;}
.tk-balancegrid{display:flex;gap:18px;margin-top:12px;font:11px var(--mono);color:var(--muted);}
.tk-balancegrid span{display:flex;gap:5px;align-items:center;}
.tk-balancegrid .tk-sym{font-size:inherit;}

.tk-budget{margin-top:16px;}
.tk-budgetbar{height:8px;border-radius:5px;overflow:hidden;background:var(--panel2);}
.tk-budgetbar>span{display:block;height:100%;transition:width .5s cubic-bezier(.2,.7,.2,1);}
.tk-budgetrow{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12.5px;color:var(--muted);}
.tk-budgetrow .tk-over{color:#E8654B;font-weight:500;}
.tk-budgetedit{background:transparent;border:0;color:var(--faint);font-size:12px;cursor:pointer;font-family:var(--sans);}
.tk-budgetedit:hover{color:var(--ink);}
.tk-setbudget{margin-top:16px;background:transparent;border:1px dashed var(--line);border-radius:9px;color:var(--muted);font-size:12.5px;padding:9px 12px;cursor:pointer;width:100%;font-family:var(--sans);transition:.15s;}
.tk-setbudget:hover{border-color:var(--signal);color:var(--signal);}
.tk-budgetedit-row{display:flex;gap:8px;margin-top:16px;}

.tk-inp{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--ink);font-family:var(--sans);font-size:13.5px;padding:11px 12px;outline:0;transition:.15s;}
.tk-inp:focus{border-color:var(--faint);} .tk-inp::placeholder{color:var(--faint);}
.tk-mono{font-family:var(--mono);}
.tk-btn-primary{background:var(--signal);color:#15100C;border:0;border-radius:10px;padding:0 16px;font-weight:700;font-size:13px;cursor:pointer;flex:none;}
.tk-btn-ghost{background:var(--panel2);color:var(--muted);border:1px solid var(--line);border-radius:10px;padding:0 12px;font-size:13px;cursor:pointer;flex:none;}

/* donut */
.tk-donutwrap{display:flex;align-items:center;gap:18px;margin-top:10px;}
.tk-donutwrap.big{justify-content:center;}
.tk-donutbox{position:relative;flex:none;}
.tk-donutctr{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;}
.tk-donutlbl{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
.tk-donuttot{font-family:var(--mono);font-size:15px;font-weight:600;margin-top:2px;}
.tk-leg{list-style:none;margin:0;padding:0;flex:1;display:flex;flex-direction:column;gap:9px;}
.tk-leg li{display:flex;align-items:center;gap:8px;font-size:13px;}
.tk-dot{width:9px;height:9px;border-radius:50%;flex:none;}
.tk-legname{color:var(--ink);}
.tk-legpct{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--muted);}

.tk-catlist{list-style:none;margin:14px 0 0;padding:0;}
.tk-catlist li{display:flex;align-items:center;gap:12px;padding:9px 0;border-top:1px solid var(--line);}
.tk-catlist li:first-child{border-top:0;}
.tk-catico{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:none;}
.tk-catmain{flex:1;}
.tk-catname{font-size:14px;}
.tk-catpct{font-family:var(--mono);font-size:11px;color:var(--faint);margin-top:2px;}
.tk-catsum{font-family:var(--mono);font-size:14px;}

/* bars */
.tk-bars{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;height:132px;margin-top:14px;}
.tk-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;background:transparent;border:0;cursor:pointer;padding:0;height:100%;}
.tk-barval{font-family:var(--mono);font-size:9px;color:var(--faint);height:12px;line-height:12px;}
.tk-barcol{width:100%;max-width:34px;background:var(--panel2);border-radius:5px 5px 0 0;transition:height .4s cubic-bezier(.2,.7,.2,1),background .15s;}
.tk-bar:hover .tk-barcol{background:#39414c;}
.tk-bar.on .tk-barcol{background:var(--signal);}
.tk-barlbl{font-size:10px;letter-spacing:.03em;color:var(--muted);text-transform:uppercase;}
.tk-bar.on .tk-barlbl{color:var(--signal);}

/* daily */
.tk-daily{display:flex;align-items:flex-end;gap:2px;height:100px;margin-top:12px;}
.tk-dcol{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%;}
.tk-dbar{width:100%;max-width:9px;background:var(--signal);opacity:.8;border-radius:3px 3px 0 0;}
.tk-dcol:hover .tk-dbar{opacity:1;}
.tk-dlbl{font-size:8px;color:var(--faint);height:10px;font-family:var(--mono);}

/* search */
.tk-searchwrap{position:relative;display:flex;align-items:center;}
.tk-searchico{position:absolute;left:13px;color:var(--muted);}
.tk-search{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;color:var(--ink);font-size:14px;padding:12px 12px 12px 38px;outline:0;font-family:var(--sans);}
.tk-search:focus{border-color:var(--faint);} .tk-search::placeholder{color:var(--faint);}
.tk-searchclear{position:absolute;right:8px;width:26px;height:26px;display:grid;place-items:center;background:transparent;border:0;color:var(--faint);cursor:pointer;}

/* rows */
.tk-rows{display:flex;flex-direction:column;}
.tk-group{padding-top:12px;}
.tk-daybar{display:flex;align-items:center;gap:12px;margin-bottom:4px;}
.tk-day{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);}
.tk-dayline{flex:1;height:1px;background:var(--line);}
.tk-daysum{font-family:var(--mono);font-size:11px;color:var(--faint);}
.tk-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);}
.tk-row:last-child{border-bottom:0;}
.tk-rowico{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;flex:none;}
.tk-thumb{width:38px;height:38px;border-radius:10px;object-fit:cover;flex:none;cursor:pointer;border:1px solid var(--line);}
.tk-rowmain{flex:1;min-width:0;} .tk-tap{cursor:pointer;}
.tk-rowtop{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tk-rowsub{font-size:11px;color:var(--faint);margin-top:2px;}
.tk-rowsum{font-family:var(--mono);font-size:15px;white-space:nowrap;}
.tk-del{width:26px;height:26px;display:grid;place-items:center;background:transparent;border:0;color:var(--faint);border-radius:6px;cursor:pointer;transition:.15s;flex:none;}
.tk-del:hover{color:#E8654B;background:var(--panel2);}
.tk-empty{color:var(--muted);font-size:13px;text-align:center;padding:22px 8px;line-height:1.5;}

/* settings */
.tk-curgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:12px;}
.tk-curbtn{background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--muted);font-size:13px;padding:11px;cursor:pointer;font-family:var(--mono);transition:.15s;}
.tk-curbtn.on{color:var(--signal);border-color:var(--signal);background:var(--bg);}
.tk-help{font-size:12px;color:var(--muted);line-height:1.5;margin:10px 0;}
.tk-foot{text-align:center;font-size:11px;color:var(--faint);padding:8px 0 4px;}
.tk-data-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;}
.tk-data-actions .tk-curbtn{display:flex;align-items:center;justify-content:center;gap:7px;font-family:var(--sans);}
.tk-recurring-count{font:11px var(--mono);color:var(--muted);}
.tk-income{color:#4FC08D;}

/* fab */
.tk-fab{position:fixed;right:calc(50% - 240px + 18px);bottom:calc(var(--navh) + env(safe-area-inset-bottom) + 16px);
  width:56px;height:56px;border-radius:50%;background:var(--signal);color:#15100C;border:0;display:grid;place-items:center;
  cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.4);z-index:30;transition:.15s;}
.tk-fab:hover{filter:brightness(1.08);} .tk-fab:active{transform:translateY(1px);}
@media (max-width:520px){ .tk-fab{right:18px;} }

/* tab bar */
.tk-tabbar{position:fixed;left:50%;transform:translateX(-50%);bottom:0;width:100%;max-width:480px;
  height:calc(var(--navh) + env(safe-area-inset-bottom));padding-bottom:env(safe-area-inset-bottom);
  background:rgba(20,22,26,.92);backdrop-filter:blur(10px);border-top:1px solid var(--line);
  display:flex;align-items:stretch;z-index:20;}
.tk-tab{flex:1;background:transparent;border:0;color:var(--faint);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;font-family:var(--sans);transition:.15s;}
.tk-tab span{font-size:10px;letter-spacing:.02em;}
.tk-tab.on{color:var(--signal);}

/* modal / sheet */
.tk-modal{position:fixed;inset:0;background:rgba(8,9,11,.72);backdrop-filter:blur(2px);display:flex;align-items:flex-end;justify-content:center;z-index:60;}
.tk-sheet{background:var(--panel);border:1px solid var(--line);border-radius:20px 20px 0 0;width:100%;max-width:480px;max-height:92vh;overflow-y:auto;
  padding:16px 16px calc(20px + env(safe-area-inset-bottom));animation:tk-up .24s cubic-bezier(.2,.7,.2,1);}
@keyframes tk-up{from{transform:translateY(18px);opacity:.5;}to{transform:none;opacity:1;}}
.tk-sheethead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;}
.tk-sheettitle{font-size:16px;font-weight:600;}
.tk-sheetsub{font-size:12px;color:var(--muted);margin-top:5px;font-family:var(--mono);}
.tk-kindtoggle{display:grid;grid-template-columns:1fr 1fr;background:var(--panel2);border:1px solid var(--line);padding:3px;border-radius:10px;margin-bottom:12px;}
.tk-kindtoggle button{border:0;background:transparent;color:var(--muted);font:600 13px var(--sans);padding:9px;border-radius:7px;cursor:pointer;}
.tk-kindtoggle button.on{background:var(--bg);color:var(--signal);box-shadow:0 1px 2px rgba(0,0,0,.25);}

.tk-quick{display:flex;gap:8px;}
.tk-quickinput{flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line);border-radius:10px;color:var(--ink);font-size:13.5px;padding:11px 13px;outline:0;font-family:var(--sans);}
.tk-quickinput:focus{border-color:var(--faint);} .tk-quickinput::placeholder{color:var(--faint);}
.tk-quickgo{width:44px;flex:none;display:grid;place-items:center;border-radius:10px;background:var(--signal);color:#15100C;border:1px solid var(--signal);cursor:pointer;transition:.15s;}
.tk-quickgo:disabled{opacity:.5;cursor:default;}

.tk-scan{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;background:var(--panel2);border:1px dashed var(--faint);border-radius:11px;padding:13px;color:var(--ink);font-size:13.5px;font-weight:500;cursor:pointer;transition:.15s;margin-top:10px;font-family:var(--sans);}
.tk-scan:hover:not(:disabled){border-color:var(--signal);color:var(--signal);}
.tk-scan:disabled{opacity:.65;cursor:default;}
.tk-scanmsg{font-size:12px;line-height:1.45;margin-top:9px;padding:10px 12px;border-radius:9px;}
.tk-scanmsg.ok{background:var(--signal-dim);color:var(--signal);}
.tk-scanmsg.bad{background:rgba(232,101,75,.12);color:#E8654B;}

.tk-amountrow{display:flex;align-items:baseline;gap:8px;margin:16px 0;border-bottom:1px solid var(--line);padding-bottom:12px;}
.tk-amountsym{font-family:var(--mono);font-size:26px;color:var(--muted);}
.tk-amount{flex:1;background:transparent;border:0;outline:0;color:var(--ink);font-family:var(--mono);font-size:38px;font-weight:600;letter-spacing:-.02em;width:100%;padding:0;}
.tk-amount::placeholder{color:var(--faint);}
.tk-chips{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px;}
.tk-chip{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:9px;background:var(--panel2);border:1px solid var(--line);color:var(--muted);font-size:12.5px;cursor:pointer;transition:.15s;font-family:var(--sans);}
.tk-chip:hover{color:var(--ink);}
.tk-chip.on{background:var(--bg);font-weight:500;}
.tk-formrow{display:flex;gap:9px;margin-bottom:14px;}
.tk-formrow .tk-inp:first-child{flex:1;}
.tk-formrow .tk-inp.tk-mono{flex:none;color:var(--muted);}
.tk-repeat{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px;margin:-2px 0 14px;cursor:pointer;}
.tk-repeat input{accent-color:var(--signal);width:16px;height:16px;}
.tk-err{color:#E8654B;font-size:12px;margin-bottom:12px;font-family:var(--mono);}
.tk-submit{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--signal);color:#15100C;border:0;border-radius:11px;padding:14px;font-size:14px;font-weight:700;cursor:pointer;transition:.15s;font-family:var(--sans);}
.tk-submit:hover{filter:brightness(1.08);} .tk-submit:active{transform:translateY(1px);}

.tk-receiptimg{border-radius:11px;overflow:hidden;background:var(--panel2);border:1px solid var(--line);margin-bottom:14px;}
.tk-receiptimg img{display:block;width:100%;height:auto;}
.tk-imgload{display:flex;align-items:center;justify-content:center;gap:8px;padding:30px 20px;color:var(--muted);font-size:12.5px;}
.tk-items{list-style:none;margin:0;padding:0;}
.tk-items li{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-top:1px solid var(--line);font-size:13px;}
.tk-items li:first-child{border-top:0;}
.tk-itname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.tk-itprice{font-family:var(--mono);color:var(--muted);flex:none;}

.tk-spin{animation:tk-rot .7s linear infinite;}
@keyframes tk-rot{to{transform:rotate(360deg);}}
:focus-visible{outline:2px solid var(--signal);outline-offset:2px;border-radius:4px;}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
@media (min-width:760px){
  :root{--navh:74px;}
  .tk-app{max-width:1180px;padding-left:210px;}
  .tk-main{padding:30px 30px 40px;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(310px,.85fr);align-content:start;gap:16px;}
  .tk-topbar,.tk-monthbar{grid-column:1/-1;}
  .tk-topbar{justify-content:flex-start;padding:0;}
  .tk-brand{margin-left:2px;}.tk-card{border-radius:18px;padding:20px;}
  .tk-hero{grid-column:1/-1;background:linear-gradient(112deg,var(--panel),#222831);}
  .tk-tabbar{left:0;transform:none;top:0;bottom:0;width:210px;max-width:none;height:100vh;padding:30px 12px;flex-direction:column;align-items:stretch;border-top:0;border-right:1px solid var(--line);background:#121418;gap:6px;}
  .tk-tab{flex:none;flex-direction:row;justify-content:flex-start;gap:12px;padding:13px 16px;border-radius:10px;}.tk-tab span{font-size:13px;}.tk-tab.on{background:var(--signal-dim);}
  .tk-fab{right:32px;bottom:32px;}.tk-total{font-size:52px;}.tk-donutwrap{justify-content:center;}
  .tk-group{grid-column:1/-1;}.tk-searchwrap{grid-column:1/-1;}.tk-sheet{max-width:680px;border-radius:20px;margin-bottom:30px;}.tk-modal{align-items:center;}
}
`;
