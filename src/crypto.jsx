import React, { useMemo, useState } from "react";
import { Bitcoin, ChevronRight, Coins, Plus, RefreshCw, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import "./crypto.css";
import { ui } from "./cabinet-copy.js";
import CryptoIcon from "./crypto-icon.jsx";

export const CRYPTO_CATALOG = [
  ["bitcoin", "BTC", "Bitcoin"],
  ["ethereum", "ETH", "Ethereum"],
  ["solana", "SOL", "Solana"],
  ["tether", "USDT", "Tether"],
  ["usd-coin", "USDC", "USD Coin"],
  ["binancecoin", "BNB", "BNB"],
  ["ripple", "XRP", "XRP"],
  ["cardano", "ADA", "Cardano"],
  ["dogecoin", "DOGE", "Dogecoin"],
  ["avalanche-2", "AVAX", "Avalanche"],
];

const SYMBOLS = { UAH: "₴", PLN: "zł", EUR: "€", USD: "$" };
const COLORS = ["#00e5a0", "#59a9ff", "#ffcc66", "#b883ff", "#ff795e", "#35d0ba", "#f58ac5", "#9aa7ff"];
const amount = (value, currency, hidden = false) => hidden ? "*****" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value) || 0)} ${SYMBOLS[currency] || currency}`;
const compact = (value, hidden = false) => hidden ? "*****" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(Number(value) || 0);

const pathFrom = (values, width = 720, height = 170) => {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, max * .02, 1);
  const points = values.map((value, index) => ({
    x: 12 + index * ((width - 24) / Math.max(1, values.length - 1)),
    y: 12 + (1 - (value - min) / span) * (height - 24),
  }));
  return points.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, "");
};

function PortfolioChart({ history, currency, hidden, locale = "en" }) {
  const [active, setActive] = useState(Math.max(0, history.length - 1));
  const values = history.map((item) => item.value);
  const selected = history[active] || history[history.length - 1];
  return <div className="tcrypto-chart" onPointerMove={(event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setActive(Math.round(ratio * Math.max(0, history.length - 1)));
  }} onPointerLeave={() => setActive(Math.max(0, history.length - 1))}>
    {history.length > 1 ? <>
      <svg viewBox="0 0 720 170" preserveAspectRatio="none" aria-hidden="true"><path className="tcrypto-area" d={`${pathFrom(values)} L 708 170 L 12 170 Z`} /><path className="tcrypto-line" d={pathFrom(values)} /></svg>
      <i className="tcrypto-cursor" style={{ left: `${(active / Math.max(1, history.length - 1)) * 100}%` }} />
      {selected && <output style={{ left: `${Math.max(14, Math.min(86, (active / Math.max(1, history.length - 1)) * 100))}%` }}><small>{new Date(selected.time).toLocaleDateString(locale === "pl" ? "pl-PL" : locale === "uk" ? "uk-UA" : "en-US", { month: "short", day: "numeric" })}</small><strong>{amount(selected.value, currency, hidden)}</strong></output>}
    </> : <div className="tcrypto-chart-empty">{ui(locale, "Price history will appear when quotes are available.")}</div>}
  </div>;
}

export function CryptoPage({ holdings, prices, history, period, loading, currency, hidden, plan, onPeriod, onAdd, onDelete, onUpgrade, onRefresh, locale = "en" }) {
  const rows = useMemo(() => holdings.map((holding, index) => {
    const quote = prices[holding.coinId] || {};
    const value = holding.quantity * Number(quote.price || 0);
    const displayPerUsd = quote.usdPrice ? Number(quote.price || 0) / Number(quote.usdPrice) : 0;
    const cost = holding.quantity * holding.averageBuyPriceUsd * displayPerUsd;
    return { ...holding, quote, value, cost, pnl: value - cost, color: COLORS[index % COLORS.length] };
  }), [holdings, prices]);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const pnl = total - cost;
  const change24 = total ? rows.reduce((sum, row) => sum + row.value * Number(row.quote.change24 || 0) / 100, 0) / total * 100 : 0;
  let cursor = 0;
  const stops = rows.map((row) => { const end = cursor + row.value / Math.max(total, 1) * 100; const stop = `${row.color} ${cursor}% ${end}%`; cursor = end; return stop; });

  return <section className="tc-page tcrypto-page">
    <div className="tc-page-head"><div><span>{ui(locale, "DIGITAL ASSETS")}</span><h2>{ui(locale, "Crypto portfolio")}</h2><p>{ui(locale, "Track positions and market value without sharing wallet keys.")}</p></div><div className="tcrypto-head-actions"><button className="tcrypto-refresh" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? "tn-spin" : ""} /> {ui(locale, "Refresh")}</button><button className="tc-action" onClick={plan === "Start" && holdings.length >= 2 ? onUpgrade : onAdd}><Plus size={17} /> {ui(locale, "Add asset")}</button></div></div>
    <div className="tc-kpis tcrypto-kpis"><div><span>{ui(locale, "PORTFOLIO VALUE")}</span><b>{amount(total, currency, hidden)}</b><small>{ui(locale, "live market estimate")}</small></div><div><span>{ui(locale, "COST BASIS")}</span><b>{amount(cost, currency, hidden)}</b><small>{ui(locale, "from your average prices")}</small></div><div><span>{ui(locale, "UNREALIZED P/L")}</span><b className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{amount(pnl, currency, hidden)}</b><small>{cost ? `${(pnl / cost * 100).toFixed(1)}%` : ui(locale, "add purchase prices")}</small></div><div><span>{ui(locale, "24H CHANGE")}</span><b className={change24 >= 0 ? "positive" : "negative"}>{change24 >= 0 ? "+" : ""}{change24.toFixed(2)}%</b><small>{ui(locale, "weighted portfolio move")}</small></div></div>
    <div className="tcrypto-grid">
      <section className="tc-panel tcrypto-performance"><header><div><span>{ui(locale, "PORTFOLIO TREND")}</span><h3>{amount(total, currency, hidden)}</h3></div><div className="tcrypto-periods">{["1D", "7D", "1M", "3M", "1Y"].map((item) => { const locked = plan === "Start" && ["3M", "1Y"].includes(item); return <button className={`${period === item ? "on" : ""}${locked ? " locked" : ""}`} key={item} onClick={locked ? onUpgrade : () => onPeriod(item)} title={locked ? ui(locale, "Plus feature") : undefined}>{item}{locked ? "·" : ""}</button>; })}</div></header><PortfolioChart history={history} currency={currency} hidden={hidden} locale={locale} /></section>
      <section className="tc-panel tcrypto-allocation"><span>{ui(locale, "ALLOCATION")}</span><div className="tcrypto-donut" style={{ background: rows.length ? `conic-gradient(${stops.join(",")})` : "#263038" }}><div><Bitcoin size={19} /><b>{rows.length}</b><small>{ui(locale, "assets")}</small></div></div><div className="tcrypto-key">{rows.slice(0, 6).map((row) => <p key={row.id}><CryptoIcon symbol={row.symbol} size={17} /><span>{row.symbol}</span><b>{total ? (row.value / total * 100).toFixed(1) : 0}%</b></p>)}</div></section>
    </div>
    <section className="tc-panel tcrypto-list"><header><div><span>{ui(locale, "POSITIONS")}</span><h3>{ui(locale, "Your assets")}</h3></div>{plan === "Start" && <small>{holdings.length}/2 Start positions</small>}</header>{rows.length ? rows.map((row) => <article key={row.id}><span className="tcrypto-coin"><CryptoIcon symbol={row.symbol} size={34} /></span><div><b>{row.name}</b><small>{compact(row.quantity, hidden)} {row.symbol} · {ui(locale, "avg")} {amount(row.averageBuyPriceUsd * (row.quote.usdPrice ? row.quote.price / row.quote.usdPrice : 0), currency, hidden)}</small></div><div><b>{amount(row.value, currency, hidden)}</b><small className={row.quote.change24 >= 0 ? "positive" : "negative"}>{row.quote.change24 >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Number(row.quote.change24 || 0).toFixed(2)}%</small></div><div><b className={row.pnl >= 0 ? "positive" : "negative"}>{row.pnl >= 0 ? "+" : ""}{amount(row.pnl, currency, hidden)}</b><small>{ui(locale, "unrealized P/L")}</small></div><button onClick={() => onDelete(row.id)} aria-label={`Remove ${row.name}`}><Trash2 size={15} /></button></article>) : <div className="tcrypto-empty"><Coins size={27} /><b>{ui(locale, "No crypto assets yet")}</b><p>{ui(locale, "Add a position to see live value, performance and allocation.")}</p><button className="tc-action" onClick={onAdd}>{ui(locale, "Add your first asset")} <ChevronRight size={15} /></button></div>}</section>
    <p className="tcrypto-disclaimer">{ui(locale, "Market data may be delayed. Trek tracks your portfolio and does not provide investment advice or execute trades.")}</p>
  </section>;
}

export function CryptoModal({ currency, onClose, onSave, locale = "en" }) {
  const [form, setForm] = useState({ coinId: CRYPTO_CATALOG[0][0], quantity: "", averagePrice: "" });
  const [busy, setBusy] = useState(false);
  const selected = CRYPTO_CATALOG.find(([id]) => id === form.coinId) || CRYPTO_CATALOG[0];
  return <div className="tc-modal" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="tc-modal-card tcrypto-modal" role="dialog" aria-modal="true"><button className="tc-close" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="tc-kicker">{ui(locale, "NEW POSITION")}</span><h2>{ui(locale, "Add a crypto asset")}</h2><p className="tc-modal-copy">{ui(locale, "Enter the amount you own and your average purchase price. Trek stores the position, never wallet credentials.")}</p><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); const ok = await onSave({ coinId: selected[0], symbol: selected[1], name: selected[2], quantity: Number(form.quantity.replace(",", ".")), averagePrice: Number(form.averagePrice.replace(",", ".")) }); setBusy(false); if (ok) onClose(); }}><label>{ui(locale, "Asset")}<select value={form.coinId} onChange={(event) => setForm({ ...form, coinId: event.target.value })}>{CRYPTO_CATALOG.map(([id, symbol, name]) => <option key={id} value={id}>{symbol} · {name}</option>)}</select></label><label>{ui(locale, "Quantity")}<input required min="0.00000001" step="any" inputMode="decimal" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder="0.00" /></label><label>{ui(locale, "Average purchase price")} ({currency})<input required min="0" step="any" inputMode="decimal" value={form.averagePrice} onChange={(event) => setForm({ ...form, averagePrice: event.target.value })} placeholder={ui(locale, "Price per coin")} /></label><button className="tc-action" disabled={busy}>{busy ? "Saving…" : ui(locale, "Save position")}</button></form></section></div>;
}
