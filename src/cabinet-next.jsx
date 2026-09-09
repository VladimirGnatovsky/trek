import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArchiveRestore, ArrowLeft, ArrowRightLeft, ArrowUpRight, Banknote, BarChart3, Bell, Bitcoin, Camera, CalendarClock, CalendarDays, CalendarRange, Check, ChevronLeft,
  ChevronRight, CircleDollarSign, Coffee, CreditCard, Download, Eye, EyeOff,
  FileText, FileUp, HeartPulse, Home, Landmark, LayoutDashboard, LoaderCircle, LogOut, Menu, Mic, Music2, Pencil, PiggyBank,
  Plus, ReceiptText, RefreshCw, Repeat2, Search, Settings, ShieldCheck, ShoppingBag, Sparkles, Target, TrendingDown, TrendingUp, Trophy,
  Trash2, Upload, UserRound, Wallet, WifiOff, Workflow, X, Car,
} from "lucide-react";
import "./cabinet.css";
import "./cabinet-extra.css";
import "./profile.css";
import "./coach.css";
import "./cabinet-next.css";
import "./dashboard-calm.css";
import "./product-intelligence.css";
import { supabase } from "./supabase.js";
import { CryptoModal, CryptoPage } from "./crypto.jsx";
import { normalizeMerchant, suggestedCategory } from "../lib/merchant-rules.mjs";
import { validateBackup } from "../lib/backup.mjs";
import { CABINET_COPY, categoryLabel, ui } from "./cabinet-copy.js";
import { parseCoachAnswer } from "./coach-format.js";
import { applyAutomationRules, buildFinancialTimeline, buildSmartInsights, buildWeeklyReport, calculateAccountBalances, calculateNoSpendStreak, detectRecurringCandidates } from "../lib/product-intelligence.mjs";
import LanguageSwitch from "./language-switch.jsx";
import LoadingScreen from "./loading-screen.jsx";
import ThemeToggle from "./theme-toggle.jsx";

const CATEGORIES = ["Groceries", "Transport", "Subscriptions", "Coffee", "Shopping", "Housing", "Health", "Fun", "Other"];
const COLORS = ["#00e5a0", "#59a9ff", "#ffcc66", "#ff795e", "#b883ff", "#35d0ba", "#f58ac5", "#9aa7ff", "#aab5af"];
const SYMBOLS = { UAH: "₴", PLN: "zł", EUR: "€", USD: "$" };
const ICONS = { Groceries: ShoppingBag, Transport: Car, Subscriptions: Music2, Coffee, Shopping: ShoppingBag, Housing: Home, Health: HeartPulse, Fun: Sparkles, Other: CircleDollarSign };
const categoryColor = (category, type = "expense") => type === "income" ? COLORS[1] : COLORS[Math.max(0, CATEGORIES.indexOf(category)) % COLORS.length];
const NAV = [
  ["overview", LayoutDashboard], ["accounts", Wallet], ["transactions", ReceiptText], ["plan", CalendarDays],
  ["calendar", CalendarRange], ["recurring", CalendarClock], ["automation", Workflow], ["goals", Target], ["crypto", Bitcoin], ["analytics", BarChart3],
];
const LOCALE_TAGS = { en: "en-US", pl: "pl-PL", uk: "uk-UA" };

const iso = (date) => date.toISOString().slice(0, 10);
const localDate = (value) => new Date(`${value}T12:00:00`);
const monthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
const shiftMonth = (key, delta) => {
  const date = localDate(key);
  date.setMonth(date.getMonth() + delta);
  return monthKey(date);
};
const monthEnd = (key) => {
  const date = localDate(key);
  return iso(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
};
const monthLabel = (key, locale = "en") => localDate(key).toLocaleDateString(LOCALE_TAGS[locale] || LOCALE_TAGS.en, { month: "long", year: "numeric" });
const inMonth = (item, key) => item.date >= key && item.date <= monthEnd(key);
const money = (value, currency, hidden = false) => hidden
  ? "*****"
  : `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)} ${SYMBOLS[currency] || currency}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const apiUrl = (path) => {
  const configured = window.__TREK_ENV__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
  const nativeOrigin = window.location.protocol === "capacitor:" ? "https://trekmoney.pl" : "";
  return `${String(configured || nativeOrigin).replace(/\/$/, "")}${path}`;
};

const prepareReceiptImage = (file) => new Promise((resolve, reject) => {
  if (!file?.type?.startsWith("image/")) return reject(new Error("Choose a receipt photo."));
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("The receipt image could not be read."));
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => reject(new Error("Use a JPG, PNG or WebP image."));
    image.onload = () => {
      const maxSide = 1500;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL("image/jpeg", 0.76);
      resolve({ mimeType: "image/jpeg", data: encoded.split(",")[1] });
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function CategoryIcon({ category, size = 16 }) {
  const Icon = ICONS[category] || CircleDollarSign;
  return <Icon size={size} aria-hidden="true" />;
}

function CategoryBadge({ category, type = "expense", className = "" }) {
  const color = categoryColor(category, type);
  return <span className={`tc-txn-icon tn-category-badge ${className}`.trim()} style={{ "--category-color": color, background: `${color}20`, color }}><CategoryIcon category={category} /></span>;
}

function calculateMetrics(items, budget, selectedMonth, recurring = [], locale = "en") {
  const expenses = items.filter((item) => item.type !== "income");
  const income = items.filter((item) => item.type === "income");
  const spending = expenses.reduce((sum, item) => sum + item.amount, 0);
  const earned = income.reduce((sum, item) => sum + item.amount, 0);
  const month = localDate(selectedMonth);
  const today = new Date();
  const historical = monthKey(today) !== selectedMonth;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const elapsedDays = historical ? daysInMonth : Math.max(1, Math.min(today.getDate(), daysInMonth));
  const daily = spending / elapsedDays;
  const forecast = historical ? spending : daily * daysInMonth;
  const remaining = budget - spending;
  const upcoming = historical ? 0 : recurring
    .filter((item) => item.active && item.type !== "income" && item.day > elapsedDays)
    .reduce((sum, item) => sum + item.amount, 0);
  const safeToSpend = budget > 0 ? budget - spending - upcoming : earned - spending - upcoming;
  const paceRatio = budget > 0 ? forecast / budget : 1;
  const score = budget > 0 ? clamp(Math.round(100 - Math.max(0, paceRatio - 0.85) * 100), 0, 100) : 0;
  const byCategory = CATEGORIES.map((category) => ({
    category,
    amount: expenses.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0),
  })).filter((item) => item.amount > 0).sort((a, b) => b.amount - a.amount);
  const dailySeries = Array.from({ length: 7 }, (_, index) => {
    const endDay = historical ? daysInMonth : elapsedDays;
    const date = new Date(month.getFullYear(), month.getMonth(), endDay - 6 + index, 12);
    const key = iso(date);
    return {
      key,
      label: date.toLocaleDateString(LOCALE_TAGS[locale] || LOCALE_TAGS.en, { weekday: "narrow" }),
      amount: expenses.filter((item) => item.date === key).reduce((sum, item) => sum + item.amount, 0),
    };
  });
  return { spending, earned, remaining, daily, forecast, upcoming, safeToSpend, score, byCategory, dailySeries, daysInMonth, elapsedDays };
}

function Modal({ children, onClose, wide = false, locked = false }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  return <div className="tc-modal" onMouseDown={(event) => !locked && event.target === event.currentTarget && onClose()}>
    <section className={`tc-modal-card${wide ? " tc-modal-wide" : ""}`} role="dialog" aria-modal="true">
      {!locked && <button className="tc-close" onClick={onClose} aria-label="Close"><X size={18} /></button>}
      {children}
    </section>
  </div>;
}

function MonthControl({ value, onChange, locale = "en" }) {
  const current = monthKey();
  return <div className="tn-month-control" aria-label="Selected month">
    <button onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month"><ChevronLeft size={17} /></button>
    <strong>{monthLabel(value, locale)}</strong>
    <button disabled={value >= current} onClick={() => onChange(shiftMonth(value, 1))} aria-label="Next month"><ChevronRight size={17} /></button>
  </div>;
}

function Score({ value }) {
  return <div className="tc-score" style={{ "--score": `${value}%` }} title="Pulse Score compares your projected month-end spending with your budget.">
    <div><b>{value}</b><span>pulse<br />score</span></div>
  </div>;
}

const smoothPath = (points) => points.reduce((path, point, index) => {
  if (index === 0) return `M ${point.x} ${point.y}`;
  const previous = points[index - 1];
  const middle = (previous.x + point.x) / 2;
  return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
}, "");

function Bars({ values, currency, hidden, locale = "en" }) {
  const [active, setActive] = useState(Math.max(0, values.length - 1));
  const max = Math.max(...values.map((item) => item.amount), 1);
  const points = values.map((item, index) => ({
    x: values.length === 1 ? 350 : 24 + index * (652 / Math.max(1, values.length - 1)),
    y: 135 - (item.amount / max) * 112,
  }));
  const selected = values[active];
  const tooltipLeft = clamp(((active + 0.5) / Math.max(1, values.length)) * 100, 13, 87);
  return <div className="tc-chart tn-bars" onMouseLeave={() => setActive(Math.max(0, values.length - 1))}>
    <svg className="tn-trend-line" viewBox="0 0 700 150" preserveAspectRatio="none" aria-hidden="true">
      <path className="tn-trend-area" d={`${smoothPath(points)} L ${points[points.length - 1]?.x || 676} 150 L ${points[0]?.x || 24} 150 Z`} />
      <path className="tn-trend-path" d={smoothPath(points)} />
      {points.map((point, index) => <circle key={index} className={index === active ? "active" : ""} cx={point.x} cy={point.y} r={index === active ? 5 : 3} />)}
    </svg>
    {selected && <output className="tn-chart-tooltip" style={{ left: `${tooltipLeft}%` }}>
      <small>{selected.key ? localDate(selected.key).toLocaleDateString(LOCALE_TAGS[locale] || LOCALE_TAGS.en, { month: "short", day: "numeric" }) : selected.label}</small>
      <strong>{money(selected.amount, currency, hidden)}</strong>
    </output>}
    {values.map((item, index) => <button type="button" className={`tc-bar${index === active ? " selected" : ""}`} key={item.key || item.label} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)} aria-label={`${item.label}: ${money(item.amount, currency, hidden)}`}>
      <i className={index === values.length - 1 ? "active" : ""} style={{ height: `${Math.max(5, item.amount / max * 100)}%` }} />
      <small>{item.label}</small>
    </button>)}
  </div>;
}

function Donut({ rows, total, currency, hidden, locale = "en" }) {
  const [active, setActive] = useState(0);
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const end = cursor + (row.amount / Math.max(total, 1)) * 100;
    const stop = `${COLORS[index % COLORS.length]} ${cursor}% ${end}%`;
    cursor = end;
    return stop;
  });
  const selected = rows[active] || rows[0];
  return <div className="tn-donut-wrap">
    <div className="tn-donut" style={{ background: rows.length ? `conic-gradient(${stops.join(",")})` : "#263038" }}>
      <span><b>{selected?.category ? categoryLabel(locale, selected.category) : ui(locale, "Total")}</b><small>{money(selected?.amount ?? total, currency, hidden)}</small></span>
    </div>
    <div className="tn-donut-legend">
      {rows.slice(0, 5).map((row, index) => <button type="button" className={index === active ? "active" : ""} key={row.category} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)}>
        <i style={{ background: COLORS[index % COLORS.length] }} />{categoryLabel(locale, row.category)}
      </button>)}
    </div>
  </div>;
}

function SmartInsights({ insights, weekly, streak, monthProgress, currency, hidden, locale }) {
  const copy = (item) => {
    if (item.id === "month-change") return item.direction === "up"
      ? locale === "pl" ? `Wydatki wzrosły o ${item.value}% względem poprzedniego miesiąca.` : locale === "uk" ? `Витрати зросли на ${item.value}% порівняно з минулим місяцем.` : `Spending is up ${item.value}% from last month.`
      : locale === "pl" ? `Wydatki spadły o ${item.value}% względem poprzedniego miesiąca.` : locale === "uk" ? `Витрати зменшилися на ${item.value}% порівняно з минулим місяцем.` : `Spending is down ${item.value}% from last month.`;
    if (item.id === "upcoming") return locale === "pl" ? `${item.merchant}: ${item.days ? `za ${item.days} dni` : "dzisiaj"} · ${money(item.amount, currency, hidden)}` : locale === "uk" ? `${item.merchant}: ${item.days ? `через ${item.days} дн.` : "сьогодні"} · ${money(item.amount, currency, hidden)}` : `${item.merchant} ${item.days ? `in ${item.days} days` : "today"} · ${money(item.amount, currency, hidden)}`;
    if (item.id === "category-limit") return locale === "pl" ? `${categoryLabel(locale, item.category)} wykorzystuje ${item.percent}% limitu.` : locale === "uk" ? `${categoryLabel(locale, item.category)} використано на ${item.percent}% ліміту.` : `${categoryLabel(locale, item.category)} has used ${item.percent}% of its limit.`;
    if (item.id === "surplus") return locale === "pl" ? `Możesz zakończyć miesiąc z zapasem ${money(item.amount, currency, hidden)}.` : locale === "uk" ? `Місяць може завершитися із запасом ${money(item.amount, currency, hidden)}.` : `You may finish the month with ${money(item.amount, currency, hidden)} spare.`;
    return locale === "pl" ? `${item.name}: ${item.days} dni do terminu, brakuje ${money(item.amount, currency, hidden)}.` : locale === "uk" ? `${item.name}: ${item.days} дн. до терміну, бракує ${money(item.amount, currency, hidden)}.` : `${item.name}: ${item.days} days left, ${money(item.amount, currency, hidden)} to go.`;
  };
  const icon = (item) => item.tone === "positive" ? TrendingDown : item.tone === "warning" ? TrendingUp : item.id === "upcoming" ? CalendarClock : Sparkles;
  return <section className="tn-intelligence"><header><div><span>{ui(locale, "SMART INSIGHTS")}</span><h3>{ui(locale, "Your money, at a glance")}</h3></div><small>{ui(locale, "Calculated locally from your records")}</small></header><div className="tn-insight-grid">{insights.map((item) => { const Icon = icon(item); return <article className={item.tone} key={item.id}><Icon size={17} /><p>{copy(item)}</p></article>; })}</div><footer><div><b>{money(weekly.current, currency, hidden)}</b><span>{ui(locale, "spent in the last 7 days")}</span><small className={weekly.change > 0 ? "warning" : "positive"}>{weekly.change > 0 ? "+" : ""}{Math.round(weekly.change)}% {ui(locale, "vs previous week")}</small></div><div><b>{streak}</b><span>{ui(locale, "no-spend day streak")}</span><small>{ui(locale, "A calm streak, not a competition")}</small></div><div><b>{monthProgress}%</b><span>{ui(locale, "of the month complete")}</span><small><Trophy size={12} /> {ui(locale, "Keep the pace steady")}</small></div></footer></section>;
}

function Overview({ transactions, allTransactions, previousMetrics, recurring, metrics, budget, goals, currency, hidden, categoryBudgets, widgets, onAdd, onRepeat, onView, onCoach, locale }) {
  const primaryGoal = goals.find((goal) => goal.status === "active");
  const planned = Object.values(categoryBudgets).reduce((sum, value) => sum + Number(value || 0), 0);
  const quickRepeat = [...transactions.reduce((merchants, item, index) => {
    if (item.type === "income") return merchants;
    const key = normalizeMerchant(item.merchant);
    const saved = merchants.get(key);
    merchants.set(key, { item: saved?.item || item, count: (saved?.count || 0) + 1, recentIndex: saved?.recentIndex ?? index });
    return merchants;
  }, new Map()).values()].sort((left, right) => right.count - left.count || left.recentIndex - right.recentIndex).slice(0, 3).map(({ item }) => item);
  const insights = buildSmartInsights({ metrics, previousMetrics, budget, categoryBudgets, recurring, goals });
  const weekly = buildWeeklyReport(allTransactions);
  const streak = calculateNoSpendStreak(allTransactions);
  const monthProgress = Math.round(metrics.elapsedDays / Math.max(metrics.daysInMonth, 1) * 100);
  const signalDetail = metrics.forecast > budget
    ? locale === "pl" ? `Zmniejsz pozostałe dzienne tempo o ${money((metrics.forecast - budget) / Math.max(1, metrics.daysInMonth - metrics.elapsedDays), currency, hidden)}.` : locale === "uk" ? `Зменште подальші щоденні витрати на ${money((metrics.forecast - budget) / Math.max(1, metrics.daysInMonth - metrics.elapsedDays), currency, hidden)}.` : `Reduce the remaining daily pace by ${money((metrics.forecast - budget) / Math.max(1, metrics.daysInMonth - metrics.elapsedDays), currency, hidden)}.`
    : locale === "pl" ? `W tym tempie na koniec miesiąca powinno zostać ${money(Math.max(0, budget - metrics.forecast), currency, hidden)}.` : locale === "uk" ? `За такого темпу наприкінці місяця має залишитися ${money(Math.max(0, budget - metrics.forecast), currency, hidden)}.` : `At this pace, ${money(Math.max(0, budget - metrics.forecast), currency, hidden)} should remain at month end.`;
  return <>
    <section className="tc-hero">
      <div><span>{ui(locale, "SAFE TO SPEND")} · {ui(locale, "DAY")} {metrics.elapsedDays}</span><h2>{money(metrics.safeToSpend, currency, hidden)}</h2><p><i /> {money(metrics.upcoming, currency, hidden)} {ui(locale, "reserved for upcoming bills")}</p></div>
      <Score value={metrics.score} />
      <button className="tc-action" onClick={onAdd}><Plus size={17} /> {ui(locale, "Add transaction")}</button>
    </section>
    <div className="tc-kpis">
      <div><span>{ui(locale, "SPENT")}</span><b>{money(metrics.spending, currency, hidden)}</b><small>{ui(locale, "of")} {money(budget, currency, hidden)} {ui(locale, "budget")}</small></div>
      <div><span>{ui(locale, "MONTH-END FORECAST")}</span><b>{money(metrics.forecast, currency, hidden)}</b><small>{ui(locale, metrics.forecast > budget ? "above" : "within")} {ui(locale, "current plan")}</small></div>
      <div><span>{ui(locale, "INCOME")}</span><b>{money(metrics.earned, currency, hidden)}</b><small>{ui(locale, "logged this month")}</small></div>
      <div><span>{ui(locale, "PLANNED")}</span><b>{money(planned, currency, hidden)}</b><small>{ui(locale, "across category envelopes")}</small></div>
    </div>
    {quickRepeat.length > 0 && <section className="tc-panel tn-quick-repeat"><span>{ui(locale, "QUICK REPEAT")}</span><div>{quickRepeat.map((item) => <button type="button" key={item.id} onClick={() => onRepeat(item)} title={ui(locale, "Open a prefilled transaction")}><span><RefreshCw size={13} /></span><b>{item.merchant}</b><small>{money(item.amount, currency, hidden)}</small></button>)}</div></section>}
    <SmartInsights insights={insights} weekly={weekly} streak={streak} monthProgress={monthProgress} currency={currency} hidden={hidden} locale={locale} />
    <div className="tc-grid">
      {widgets.includes("pace") && <section className="tc-panel tc-spend"><header><div><span>{ui(locale, "LAST 7 DAYS")}</span><h3>{ui(locale, "Daily spending rhythm")}</h3></div><button onClick={() => onView("analytics")}>{ui(locale, "View analytics")} <ChevronRight size={14} /></button></header><Bars values={metrics.dailySeries} currency={currency} hidden={hidden} locale={locale} /></section>}
      {widgets.includes("signal") && <section className="tc-panel tc-signal"><span className="tc-signal-icon"><Sparkles size={20} /></span><span>{ui(locale, "TREK SIGNAL")}</span><h3>{ui(locale, metrics.forecast > budget ? "Your current pace is above plan" : "Your current pace is inside plan")}</h3><p>{signalDetail}</p><div className="tc-signal-actions"><button onClick={() => onView("plan")}>{ui(locale, "Review plan")} <ChevronRight size={14} /></button><button onClick={onCoach}>{ui(locale, "Ask the coach")} <Sparkles size={14} /></button></div></section>}
      {widgets.includes("transactions") && <section className="tc-panel tc-list"><header><div><span>{ui(locale, "RECENT TRANSACTIONS")}</span><h3>{ui(locale, transactions.length ? "Latest activity" : "No activity yet")}</h3></div><button onClick={() => onView("transactions")}>{ui(locale, "All transactions")} <ChevronRight size={14} /></button></header>{transactions.slice(0, 4).map((item) => <TransactionRow key={item.id} item={item} currency={currency} hidden={hidden} locale={locale} />)}</section>}
      {widgets.includes("goals") && <section className="tc-panel tc-goal"><span className="tc-goal-big"><Target size={21} /></span><span>{ui(locale, "TOP GOAL")}</span>{primaryGoal ? <><h3>{primaryGoal.name}</h3><div className="tc-progress"><i style={{ width: `${clamp(primaryGoal.saved / primaryGoal.target * 100, 0, 100)}%` }} /></div><p><b>{money(primaryGoal.saved, currency, hidden)}</b> {ui(locale, "of")} {money(primaryGoal.target, currency, hidden)} <em>{Math.round(primaryGoal.saved / primaryGoal.target * 100)}%</em></p></> : <><h3>{ui(locale, "Create your first goal")}</h3><p>{ui(locale, "Give your monthly plan a direction.")}</p></>}<button onClick={() => onView("goals")}>{ui(locale, "Open goals")} <ChevronRight size={14} /></button></section>}
    </div>
  </>;
}

function TransactionRow({ item, currency, hidden, checked, onCheck, onEdit, onDelete, locale = "en" }) {
  return <div className="tc-transaction">
    {onCheck && <input type="checkbox" checked={checked} onChange={() => onCheck(item.id)} aria-label={`Select ${item.merchant}`} />}
    <CategoryBadge category={item.category} type={item.type} />
    <div><b>{item.merchant}</b><small>{item.type === "income" ? ui(locale, "INCOME") : categoryLabel(locale, item.category)} · {item.date}{item.note ? ` · ${item.note}` : ""}</small></div>
    <em className={item.type === "income" ? "tc-income" : ""}>{item.type === "income" ? "+" : "−"} {money(item.amount, currency, hidden)}</em>
    {(item.needsReview || onEdit || onDelete) && <span className="tn-transaction-actions">{item.needsReview && <AlertTriangle size={15} className="tn-review" aria-label="Needs review" />}{onEdit && <button onClick={() => onEdit(item)} aria-label="Edit transaction"><Pencil size={14} /></button>}{onDelete && <button onClick={() => onDelete(item.id)} aria-label="Delete transaction"><Trash2 size={14} /></button>}</span>}
  </div>;
}

function TransactionsPage({ items, currency, hidden, canImport, onAdd, onEdit, onDelete, onDeleteMany, onImport, locale }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [kind, setKind] = useState("All");
  const [selected, setSelected] = useState(new Set());
  const filtered = items.filter((item) => {
    const text = `${item.merchant} ${item.category} ${item.note || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category === "All" || item.category === category) && (kind === "All" || item.type === kind);
  });
  const toggle = (id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>{ui(locale, "YOUR RECORDS")}</span><h2>{ui(locale, "Transactions")}</h2><p>{filtered.length} {ui(locale, "visible entries")} · {ui(locale, "edit, filter or review your records.")}</p></div><button className="tc-action" onClick={onAdd}><Plus size={17} /> {ui(locale, "Add transaction")}</button></div>
    <section className="tc-panel tn-toolbar">
      <label className="tn-search"><Search size={16} /><input placeholder={ui(locale, "Search merchant, note or tag")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">{ui(locale, "All")}</option>{CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel(locale, item)}</option>)}</select>
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option value="All">{ui(locale, "All")}</option><option value="expense">{ui(locale, "Expenses")}</option><option value="income">{ui(locale, "INCOME")}</option></select>
      <button onClick={onImport}><FileUp size={16} /> {ui(locale, "Import statement")}{!canImport && " · Lifetime"}</button>
      {selected.size > 0 && <button className="tn-danger" onClick={async () => { await onDeleteMany([...selected]); setSelected(new Set()); }}><Trash2 size={15} /> {ui(locale, "Delete")} {selected.size}</button>}
    </section>
    <section className="tc-panel tn-transaction-table">{filtered.length ? filtered.map((item) => <TransactionRow key={item.id} item={item} currency={currency} hidden={hidden} checked={selected.has(item.id)} onCheck={toggle} onEdit={onEdit} onDelete={onDelete} locale={locale} />) : <Empty icon={ReceiptText} title={ui(locale, "No matching transactions")} copy={ui(locale, "Change the filters or log a new entry.")} />}</section>
  </section>;
}

function CalendarPage({ month, transactions, recurring, goals, metrics, currency, hidden, locale, onPost }) {
  const events = buildFinancialTimeline({ month, transactions, recurring, goals });
  const groups = events.reduce((result, event) => ({ ...result, [event.date]: [...(result[event.date] || []), event] }), {});
  const today = iso(new Date());
  const referenceDate = month === monthKey() ? today : month;
  const nextIncome = events.find((event) => event.date >= referenceDate && event.type === "income");
  const runwayEnd = nextIncome?.date || monthEnd(month);
  const runwayDays = Math.max(1, Math.ceil((localDate(runwayEnd) - localDate(referenceDate)) / 86_400_000));
  const dailyRunway = Math.max(0, metrics.safeToSpend) / runwayDays;
  const kindLabel = (event) => event.kind === "goal" ? ui(locale, "Goal deadline") : event.kind === "recurring" ? ui(locale, "Upcoming") : ui(locale, event.type === "income" ? "Income" : "Expense");
  return <section className="tc-page tn-calendar-page"><div className="tc-page-head"><div><span>{ui(locale, "MONEY TIMELINE")}</span><h2>{ui(locale, "Financial calendar")}</h2><p>{ui(locale, "See recorded activity, upcoming bills, income and goal deadlines together.")}</p></div></div><section className="tc-panel tn-runway"><div><span>{ui(locale, nextIncome ? "SAFE UNTIL NEXT INCOME" : "SAFE FOR THE REST OF MONTH")}</span><h3>{money(dailyRunway, currency, hidden)} <small>{ui(locale, "per day")}</small></h3><p>{nextIncome ? `${nextIncome.title} · ${nextIncome.date}` : monthLabel(month, locale)}</p></div><CalendarRange size={32} /></section><div className="tn-calendar-list">{Object.entries(groups).map(([date, dayEvents]) => <section className={`tc-panel${date === today ? " today" : ""}`} key={date}><header><time dateTime={date}><b>{localDate(date).getDate()}</b><span>{localDate(date).toLocaleDateString(LOCALE_TAGS[locale] || LOCALE_TAGS.en, { weekday: "short", month: "short" })}</span></time>{date === today && <em>{ui(locale, "Today")}</em>}</header><div>{dayEvents.map((event) => <article className={event.kind} key={event.id}>{event.kind === "goal" ? <span className="tn-event-badge tn-goal-badge"><Target size={16} /></span> : event.kind === "recurring" ? <CategoryBadge category={event.category} type={event.type} className="tn-event-badge" /> : <CategoryBadge category={event.category} type={event.type} className="tn-event-badge" />}<div><b>{event.title}</b><small>{kindLabel(event)}</small></div><strong className={event.type === "income" ? "positive" : ""}>{event.kind === "goal" ? money(event.amount, currency, hidden) : `${event.type === "income" ? "+" : "−"} ${money(event.amount, currency, hidden)}`}</strong>{event.kind === "recurring" && <button onClick={() => onPost({ ...event, id: event.recurringId })}>{ui(locale, "Post")}</button>}</article>)}</div></section>)}</div></section>;
}

function PlanPage({ budget, categoryBudgets, metrics, currency, hidden, onBudgetSave, onCategorySave, onCopyPrevious, locale }) {
  const [total, setTotal] = useState(String(budget));
  useEffect(() => setTotal(String(budget)), [budget]);
  const planned = Object.values(categoryBudgets).reduce((sum, value) => sum + Number(value || 0), 0);
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>{ui(locale, "YOUR SPENDING PLAN")}</span><h2>{ui(locale, "Monthly plan")}</h2><p>{ui(locale, "Assign a job to your money and compare the plan with actual spending.")}</p></div><button className="tc-action tn-secondary" onClick={onCopyPrevious}><RefreshCw size={16} /> {ui(locale, "Copy previous month")}</button></div>
    <section className="tc-plan-total"><div><span>{ui(locale, "MONTHLY BUDGET")}</span><div className="tn-budget-edit"><input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} /><button onClick={() => onBudgetSave(Number(total.replace(",", ".")) || 0)}>{ui(locale, "Save")}</button></div><p>{money(metrics.spending, currency, hidden)} {ui(locale, "spent")} · {money(metrics.remaining, currency, hidden)} {ui(locale, "remaining")}</p></div><div className="tn-plan-summary"><b>{money(planned, currency, hidden)}</b><small>{ui(locale, "assigned to categories")}</small></div></section>
    <section className="tc-panel tc-budget-list"><header><span>{ui(locale, "CATEGORY ENVELOPES")}</span><span>{money(Math.max(0, budget - planned), currency, hidden)} {ui(locale, "unassigned")}</span></header>{CATEGORIES.map((category, index) => {
      const spent = metrics.byCategory.find((item) => item.category === category)?.amount || 0;
      const amount = Number(categoryBudgets[category] || 0);
      return <div className="tc-budget-row tn-budget-row" key={category}><div><CategoryBadge category={category} /><b>{categoryLabel(locale, category)}</b><small>{money(spent, currency, hidden)} {ui(locale, "spent")}</small></div><div><span><i style={{ width: `${clamp(spent / Math.max(amount, 1) * 100, 0, 100)}%`, background: spent > amount && amount > 0 ? "#ff795e" : COLORS[index] }} /></span><input inputMode="decimal" value={categoryBudgets[category] ?? ""} placeholder="0" onChange={(event) => onCategorySave(category, event.target.value, false)} onBlur={(event) => onCategorySave(category, event.target.value, true)} /></div></div>;
    })}</section>
  </section>;
}

function RecurringPage({ items, suggestions, currency, hidden, canUse, onAdd, onAcceptSuggestion, onPost, onDelete, onUpgrade, locale }) {
  const expenses = items.filter((item) => item.type !== "income" && item.active);
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>{ui(locale, "WHAT IS COMING")}</span><h2>{ui(locale, "Recurring")}</h2><p>{ui(locale, "Plan around subscriptions, bills and regular income.")}</p></div><button className="tc-action" onClick={canUse ? onAdd : onUpgrade}><Plus size={17} /> {ui(locale, canUse ? "Add recurring" : "Unlock with Plus")}</button></div>
    <div className="tc-kpis"><div><span>{ui(locale, "MONTHLY COMMITMENTS")}</span><b>{money(total, currency, hidden)}</b><small>{ui(locale, "active recurring expenses")}</small></div><div><span>{ui(locale, "ACTIVE ITEMS")}</span><b>{items.filter((item) => item.active).length}</b><small>{ui(locale, "bills and income")}</small></div><div><span>{ui(locale, "ANNUALIZED")}</span><b>{money(total * 12, currency, hidden)}</b><small>{ui(locale, "estimated recurring spend")}</small></div></div>
    {suggestions.length > 0 && <section className="tc-panel tn-recurring-suggestions"><header><div><span>{ui(locale, "DETECTED PATTERNS")}</span><h3>{ui(locale, "Possible recurring payments")}</h3></div><small>{ui(locale, "Review before adding")}</small></header>{suggestions.slice(0, 4).map((item) => <article key={item.key}><span><Repeat2 size={17} /></span><div><b>{item.merchant}</b><small>{item.occurrences}× · {categoryLabel(locale, item.category)} · {item.confidence}% {ui(locale, "match")}</small></div><strong>{money(item.amount, currency, hidden)}</strong><button className="tc-action" onClick={() => canUse ? onAcceptSuggestion(item) : onUpgrade}>{ui(locale, canUse ? "Add recurring" : "Unlock with Plus")}</button></article>)}</section>}
    <section className="tc-panel tn-recurring-list">{items.length ? items.sort((a, b) => a.day - b.day).map((item) => <article key={item.id}><time>{item.day}</time><CategoryBadge category={item.category} type={item.type} /><div><b>{item.merchant}</b><small>{categoryLabel(locale, item.category)} · {ui(locale, "every month")}</small></div><strong>{item.type === "income" ? "+" : "−"} {money(item.amount, currency, hidden)}</strong><button onClick={() => onPost(item)} title={ui(locale, "Post this month")}><Check size={16} /></button><button className="tn-delete-icon" onClick={() => onDelete(item.id)} title={ui(locale, "Delete")}><Trash2 size={15} /></button></article>) : <Empty icon={CalendarClock} title={ui(locale, "No recurring items yet")} copy={ui(locale, "Add rent, subscriptions, salary or other repeating entries.")} />}</section>
  </section>;
}

const AUTOMATION_PRESETS = [
  { name: "Lidl → Groceries", merchantContains: "Lidl", category: "Groceries", type: "any", actionType: "keep", markReview: false },
  { name: "Netflix → Subscriptions", merchantContains: "Netflix", category: "Subscriptions", type: "any", actionType: "keep", markReview: false },
  { name: "Large purchase review", merchantContains: "", amountAbove: 300, category: "", type: "expense", actionType: "keep", markReview: true },
  { name: "Salary → Income", merchantContains: "Salary", amountAbove: "", category: "", type: "any", actionType: "income", markReview: false },
];

function AutomationPage({ rules, canUse, onAddPreset, onNew, onEdit, onToggle, onDelete, onUpgrade, locale }) {
  const condition = (rule) => [rule.merchantContains && `${ui(locale, "contains")} “${rule.merchantContains}”`, rule.amountAbove && `${ui(locale, "above")} ${rule.amountAbove}`].filter(Boolean).join(` ${ui(locale, "and")} `) || ui(locale, "Every matching transaction");
  const action = (rule) => [rule.actionType !== "keep" && `${ui(locale, "set as")} ${ui(locale, rule.actionType === "income" ? "Income" : "Expense")}`, rule.category && `${ui(locale, "categorize as")} ${categoryLabel(locale, rule.category)}`, rule.markReview && ui(locale, "mark for review")].filter(Boolean).join(" · ");
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>{ui(locale, "AUTOMATION RULES")}</span><h2>{ui(locale, "Automation")}</h2><p>{ui(locale, "Let Trek handle the repetitive sorting.")}</p></div><button className="tc-action" onClick={canUse ? onNew : onUpgrade}><Plus size={17} /> {ui(locale, canUse ? "New rule" : "Unlock with Plus")}</button></div>
    <section className="tc-panel tn-automation-presets"><header><div><span>{ui(locale, "STARTER RULES")}</span><h3>{ui(locale, "Add a useful rule in one click")}</h3></div></header><div>{AUTOMATION_PRESETS.map((preset) => { const added = rules.some((rule) => rule.name === preset.name); return <article key={preset.name}><span><Workflow size={17} /></span><div><b>{ui(locale, preset.name)}</b><small>{condition(preset)} → {action(preset)}</small></div><button disabled={added} onClick={() => canUse ? onAddPreset(preset) : onUpgrade}>{ui(locale, added ? "Added" : "Add rule")}</button></article>; })}</div></section>
    <section className="tc-panel tn-automation-list"><header><div><span>{ui(locale, "ACTIVE RULES")}</span><h3>{ui(locale, "Your rules")}</h3></div></header>{rules.length ? rules.map((rule) => <article key={rule.id} className={!rule.active ? "muted" : ""}><span><Workflow size={17} /></span><div><b>{rule.name}</b><small>{condition(rule)} → {action(rule) || ui(locale, "Keep transaction unchanged")}</small></div><label className="tn-rule-switch"><input type="checkbox" checked={rule.active} onChange={() => onToggle(rule)} /><i /></label><button className="tn-edit-icon" onClick={() => onEdit(rule)} aria-label={ui(locale, "Edit")}><Pencil size={15} /></button><button className="tn-icon-button" onClick={() => onDelete(rule.id)} aria-label={ui(locale, "Delete")}><Trash2 size={15} /></button></article>) : <Empty icon={Workflow} title={ui(locale, "No automation rules yet")} copy={ui(locale, "Add a starter rule or create your own.")} />}</section>
  </section>;
}

function GoalsPage({ goals, currency, hidden, canAddMore, onAdd, onEdit, onContribute, onArchive, onUpgrade, locale }) {
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>{ui(locale, "MAKE ROOM FOR WHAT MATTERS")}</span><h2>{ui(locale, "Goals")}</h2><p>{ui(locale, "Track several goals and see the monthly contribution needed to stay on time.")}</p></div><button className="tc-action" onClick={canAddMore ? onAdd : onUpgrade}><Plus size={17} /> {ui(locale, canAddMore ? "New goal" : "More goals · Plus")}</button></div>
    <div className="tn-goals-grid">{goals.length ? goals.map((goal) => {
      const pct = clamp(goal.saved / goal.target * 100, 0, 100);
      const deadline = goal.deadline ? localDate(goal.deadline) : null;
      const months = deadline ? Math.max(1, (deadline.getFullYear() - new Date().getFullYear()) * 12 + deadline.getMonth() - new Date().getMonth()) : null;
      return <section className="tc-panel tn-goal-card" key={goal.id}><header><span style={{ color: goal.color }}>{goal.icon || "Target"}</span><div className="tn-card-actions"><button onClick={() => onEdit(goal)} aria-label={ui(locale, "Edit")}><Pencil size={14} /></button><button className="tn-delete-icon" onClick={() => onArchive(goal.id)} aria-label={ui(locale, "Delete")}><Trash2 size={14} /></button></div></header><h3>{goal.name}</h3><p>{goal.deadline ? `${ui(locale, "Target date")} ${localDate(goal.deadline).toLocaleDateString(LOCALE_TAGS[locale] || LOCALE_TAGS.en, { month: "short", year: "numeric" })}` : ui(locale, "No deadline")}</p><div className="tc-progress"><i style={{ width: `${pct}%`, background: goal.color }} /></div><div className="tn-goal-values"><b>{money(goal.saved, currency, hidden)}</b><span>{ui(locale, "of")} {money(goal.target, currency, hidden)} · {Math.round(pct)}%</span></div>{months && goal.saved < goal.target && <small>{money((goal.target - goal.saved) / months, currency, hidden)} {ui(locale, "per month to stay on track")}</small>}<form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.amount; onContribute(goal, Number(input.value.replace(",", "."))); input.value = ""; }}><input name="amount" inputMode="decimal" placeholder={ui(locale, "Contribution")} /><button className="tc-action">{ui(locale, "Add")}</button></form></section>;
    }) : <section className="tc-panel"><Empty icon={Target} title={ui(locale, "No goals yet")} copy={ui(locale, "Create a savings goal and Trek will calculate the required pace.")} /></section>}</div>
  </section>;
}

function AnalyticsPage({ metrics, previousMetrics, categoryBudgets, currency, hidden, locale }) {
  const comparison = previousMetrics.spending ? (metrics.spending - previousMetrics.spending) / previousMetrics.spending * 100 : 0;
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>{ui(locale, "THE BIGGER PICTURE")}</span><h2>{ui(locale, "Analytics")}</h2><p>{ui(locale, "Every chart is calculated from the selected month’s records.")}</p></div></div>
    <div className="tc-kpis"><div><span>{ui(locale, "MONTH VS PREVIOUS")}</span><b>{comparison > 0 ? "+" : ""}{Math.round(comparison)}%</b><small>{ui(locale, comparison > 0 ? "more" : "less")} {ui(locale, "spending")}</small></div><div><span>{ui(locale, "SAVINGS RATE")}</span><b>{metrics.earned > 0 ? Math.round((metrics.earned - metrics.spending) / metrics.earned * 100) : 0}%</b><small>{ui(locale, "income minus expenses")}</small></div><div><span>{ui(locale, "NO-SPEND DAYS")}</span><b>{metrics.dailySeries.filter((item) => item.amount === 0).length}</b><small>{ui(locale, "within the last 7 days")}</small></div></div>
    <div className="tc-grid analytics"><section className="tc-panel tc-spend"><header><div><span>{ui(locale, "DAILY RHYTHM")}</span><h3>{money(metrics.daily, currency, hidden)} {ui(locale, "average")}</h3></div></header><Bars values={metrics.dailySeries} currency={currency} hidden={hidden} locale={locale} /></section><section className="tc-panel tn-donut-panel"><span>{ui(locale, "WHERE IT WENT")}</span><Donut rows={metrics.byCategory} total={metrics.spending} currency={currency} hidden={hidden} locale={locale} /><h3>{money(metrics.spending, currency, hidden)}</h3></section>
      <section className="tc-panel tc-breakdown"><header><span>{ui(locale, "BUDGET VS ACTUAL")}</span></header>{metrics.byCategory.length ? metrics.byCategory.map((row, index) => { const planned = Number(categoryBudgets[row.category] || 0); return <div key={row.category}><p><span><CategoryIcon category={row.category} /> {categoryLabel(locale, row.category)}</span><b>{money(row.amount, currency, hidden)} / {money(planned, currency, hidden)}</b></p><i><em style={{ width: `${clamp(row.amount / Math.max(planned, row.amount, 1) * 100, 0, 100)}%`, background: row.amount > planned && planned > 0 ? "#ff795e" : COLORS[index] }} /></i></div>; }) : <Empty icon={BarChart3} title={ui(locale, "No analytics yet")} copy={ui(locale, "Add transactions to reveal your spending pattern.")} />}</section>
    </div>
  </section>;
}

function Empty({ icon: Icon, title, copy }) { return <div className="tc-empty"><span className="tc-empty-icon"><Icon size={21} /></span><div className="tc-empty-copy"><b>{title}</b><span>{copy}</span></div></div>; }

function OnboardingModal({ initialName, initialCurrency, initialBudget, onComplete, locale }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: initialName, currency: initialCurrency, budget: String(initialBudget || 3000), income: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const advance = () => {
    if (step === 0 && !form.name.trim()) return setError(ui(locale, "Add the name you want Trek to use."));
    if (step === 1 && !(Number(String(form.budget).replace(",", ".")) > 0)) return setError(ui(locale, "Add a monthly budget greater than zero."));
    setError(""); setStep((current) => Math.min(2, current + 1));
  };
  return <Modal onClose={() => {}} locked><div className="tn-onboarding-progress"><i style={{ width: `${(step + 1) / 3 * 100}%` }} /></div><span className="tc-kicker">{ui(locale, "WELCOME TO TREK")} · {step + 1}/3</span>
    {step === 0 && <><h2>{ui(locale, "Make it your money space.")}</h2><p className="tc-modal-copy">{ui(locale, "A few details are enough to make every forecast useful from day one.")}</p><div className="tc-form"><label>{ui(locale, "Your name")}<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label></div></>}
    {step === 1 && <><h2>{ui(locale, "Set your monthly baseline.")}</h2><p className="tc-modal-copy">{ui(locale, "Choose the currency you normally plan in and a realistic monthly spending limit.")}</p><div className="tc-form"><label>{ui(locale, "Currency")}<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>{["EUR","USD","PLN","UAH"].map((item) => <option key={item}>{item}</option>)}</select></label><label>{ui(locale, "Monthly budget")}<input autoFocus inputMode="decimal" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /></label></div></>}
    {step === 2 && <><h2>{ui(locale, "Add an opening income.")}</h2><p className="tc-modal-copy">{ui(locale, "Optional. Add this month’s income now, or leave the field empty and record it later.")}</p><div className="tc-form"><label>{ui(locale, "Income this month")}<input autoFocus inputMode="decimal" placeholder={ui(locale, "Optional")} value={form.income} onChange={(event) => setForm({ ...form, income: event.target.value })} /></label></div></>}
    {error && <p className="tc-form-error">{error}</p>}<div className="tn-onboarding-actions">{step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)}>{ui(locale, "Back")}</button>}<button className="tc-action" disabled={busy} onClick={async () => { if (step < 2) return advance(); setBusy(true); setError(""); try { await onComplete({ ...form, budget: Number(String(form.budget).replace(",", ".")), income: Number(String(form.income).replace(",", ".")) || 0 }); } catch (completeError) { setError(completeError.message || ui(locale, "Setup could not be saved.")); setBusy(false); } }}>{ui(locale, step < 2 ? "Continue" : busy ? "Preparing your dashboard…" : "Open my dashboard")}</button></div>
  </Modal>;
}

function NotificationCenter({ items, currency, hidden, onSelect, onPost, copy }) {
  return <div className="tc-notice tn-notification-center" role="dialog" aria-label={copy.title}><header><div><b>{copy.title}</b><small>{items.length ? copy.attention(items.length) : copy.calm}</small></div><Bell size={17} /></header>{items.length ? <div className="tn-notification-list">{items.map((item) => { const Icon = item.icon; return <article key={item.id}><span className={item.tone || ""}><Icon size={16} /></span><div><b>{item.title}</b><p>{item.copy}</p></div>{item.recurring ? <button onClick={() => onPost(item.recurring)}>{copy.post}</button> : <button onClick={() => onSelect(item.view)}><ChevronRight size={15} /></button>}</article>; })}</div> : <div className="tn-notification-empty"><Check size={18} /><span>{copy.empty}</span></div>}<footer>{copy.shown} {currency}{hidden ? ` · ${copy.privacy}` : ""}</footer></div>;
}

function Toast({ toast, onClose }) {
  useEffect(() => { const timer = window.setTimeout(onClose, toast.action ? 6500 : 3500); return () => window.clearTimeout(timer); }, [toast, onClose]);
  return <div className="tn-toast" role="status"><Check size={16} /><span>{toast.message}</span>{toast.action && <button onClick={toast.action}>{toast.actionLabel || "Undo"}</button>}<button onClick={onClose} aria-label="Dismiss"><X size={14} /></button></div>;
}

const VOICE_CATEGORY_WORDS = {
  Groceries: /\b(lidl|aldi|biedronka|carrefour|grocer(?:y|ies)|food|продукт(?:и|ы)?|магазин|sklep|spożywcze)\b/i,
  Transport: /\b(uber|bolt|taxi|fuel|petrol|transport|бензин|таксі|такси|paliwo)\b/i,
  Subscriptions: /\b(netflix|spotify|subscription|підписк|подписк|subskrypcj)\b/i,
  Coffee: /\b(coffee|cafe|cappuccino|latte|кава|кофе|kawa)\b/i,
  Shopping: /\b(shopping|amazon|покупк|zakupy)\b/i,
  Housing: /\b(rent|housing|utilities|оренд|аренд|czynsz|mieszkanie)\b/i,
  Health: /\b(health|doctor|pharmacy|лікар|аптек|zdrowie|lekarz)\b/i,
  Fun: /\b(cinema|game|fun|кіно|розваг|кино|rozrywk)\b/i,
};

function voiceTransactionDraft(transcript, categoryRules) {
  const numberMatches = [...transcript.matchAll(/(?:^|\s)(\d+(?:[.,]\d{1,2})?)(?=\s|$|\s?(?:€|\$|zł|грн|uah|pln|eur|usd))/gi)];
  const amountMatch = numberMatches.at(-1);
  const amount = amountMatch?.[1]?.replace(",", ".") || "";
  const income = /\b(income|salary|paycheck|дохід|зарплат|доход|виплат|przychód|pensj|wynagrodzen)\b/i.test(transcript);
  let merchant = transcript
    .replace(/\b(add|log|record|expense|income|transaction|додай|додати|запиши|витрат(?:а|у)?|дохід|добавь|запиши|расход|доход|dodaj|zapisz|wydatek|przychód)\b/gi, " ")
    .replace(/\d+(?:[.,]\d{1,2})?\s*(?:€|\$|zł|грн|uah|pln|eur|usd|euros?|dollars?|złot(?:y|ych|e)|грив(?:ня|ні|ень)|hryvnias?)?/gi, " ")
    .replace(/\s+/g, " ").trim();
  merchant = merchant.replace(/^[,.;:\-–—]+|[,.;:\-–—]+$/g, "").trim() || transcript.trim();
  const category = Object.entries(VOICE_CATEGORY_WORDS).find(([, pattern]) => pattern.test(transcript))?.[0]
    || suggestedCategory(merchant, categoryRules)
    || CATEGORIES[0];
  return { merchant, amount, type: income ? "income" : "expense", category };
}

function EntryModal({ initial, isEditing = false, month, categoryRules, accounts, onClose, onSave, onScan, copy, locale }) {
  const defaultAccountId = accounts.find((item) => item.kind === "bank" && !item.archived)?.id || accounts.find((item) => item.kind !== "crypto" && !item.archived)?.id || "";
  const [form, setForm] = useState(initial || { merchant: "", amount: "", category: CATEGORIES[0], type: "expense", date: monthKey() === month ? iso(new Date()) : month, note: "", tags: "", needsReview: false, accountId: defaultAccountId });
  const [categoryTouched, setCategoryTouched] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const receiptRef = useRef(null);
  const recognitionRef = useRef(null);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => () => recognitionRef.current?.abort(), []);
  const dictate = async () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setVoiceMessage(copy.voiceUnavailable); return; }
    try {
      const permission = await navigator.permissions?.query?.({ name: "microphone" });
      if (permission?.state === "denied") { setVoiceMessage(copy.voicePermission); return; }
    } catch {
      // Some browsers expose SpeechRecognition but not microphone permissions.
    }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = LOCALE_TAGS[locale] || LOCALE_TAGS.en;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListening(true); setVoiceMessage(copy.voiceListening); };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setVoiceMessage(copy.voicePermission);
      else if (event.error === "network") setVoiceMessage(copy.voiceNetwork);
      else setVoiceMessage(copy.voiceError);
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      const draft = voiceTransactionDraft(transcript, categoryRules);
      setForm((current) => ({ ...current, ...draft, note: current.note || transcript }));
      setCategoryTouched(true);
      setVoiceMessage(copy.voiceCaptured);
    };
    try { recognition.start(); } catch { setVoiceMessage(copy.voiceUnavailable); }
  };
  return <Modal onClose={onClose}><span className="tc-kicker">{isEditing ? copy.edit : copy.fresh}</span><h2>{isEditing ? copy.update : copy.log}</h2><form className="tc-form tn-form-grid" onSubmit={async (event) => { event.preventDefault(); const amount = Number(String(form.amount).replace(",", ".")); if (!form.merchant.trim() || amount <= 0) return; setBusy(true); const ok = await onSave({ ...form, amount, tags: typeof form.tags === "string" ? form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : form.tags }); setBusy(false); if (ok) onClose(); }}>
    {!isEditing && <div className="tn-entry-capture tn-span-2"><div className="tn-receipt-scan"><button type="button" disabled={scanning} onClick={() => receiptRef.current?.click()}>{scanning ? <LoaderCircle className="tn-spin" size={18} /> : <Camera size={18} />}<span><b>{scanning ? copy.reading : copy.scan}</b><small>{copy.scanHelp}</small></span></button><input ref={receiptRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setScanning(true); setScanMessage(""); try { const parsed = await onScan(file); setForm((current) => ({ ...current, type: "expense", merchant: parsed.merchant || current.merchant, amount: parsed.amount ? String(parsed.amount) : current.amount, date: parsed.date || current.date, category: CATEGORIES.includes(parsed.category) ? parsed.category : current.category, note: parsed.note || current.note, tags: "receipt", needsReview: parsed.confidence !== "high", originalAmount: parsed.originalAmount, originalCurrency: parsed.originalCurrency, exchangeRate: parsed.exchangeRate, exchangeRateDate: parsed.exchangeRateDate })); const conversion = parsed.originalCurrency && parsed.currency && parsed.originalCurrency !== parsed.currency ? ` Converted ${parsed.originalAmount} ${parsed.originalCurrency} to ${parsed.amount} ${parsed.currency} using the official rate.` : ""; setScanMessage(`Receipt read.${conversion} Check the details before saving.`); } catch (error) { setScanMessage(error.message || "The receipt could not be read."); } finally { setScanning(false); } }} />{scanMessage && <p>{scanMessage}</p>}</div><div className="tn-voice-entry"><button type="button" className={listening ? "listening" : ""} onClick={dictate}><Mic size={18} /><span><b>{listening ? copy.voiceListening : copy.voice}</b><small>{copy.voiceHelp}</small></span></button>{voiceMessage && <p role="status">{voiceMessage}</p>}</div></div>}
    <label>{copy.type}<select value={form.type} onChange={(event) => set("type", event.target.value)}><option value="expense">{copy.expense}</option><option value="income">{copy.income}</option></select></label>
    <label>{copy.merchant}<input autoFocus value={form.merchant} onChange={(event) => { const merchant = event.target.value; const category = !categoryTouched ? suggestedCategory(merchant, categoryRules) : null; setForm((current) => ({ ...current, merchant, ...(category ? { category } : {}) })); }} /></label>
    <label>{copy.amount}<input inputMode="decimal" value={form.amount} onChange={(event) => set("amount", event.target.value)} /></label>
    <label>{copy.date}<input className="tn-date-input" type="date" value={form.date} onChange={(event) => set("date", event.target.value)} /></label>
    <label>{ui(locale, "Account")}<select value={form.accountId || ""} onChange={(event) => set("accountId", event.target.value)}><option value="">{ui(locale, "Unassigned")}</option>{accounts.filter((item) => !item.archived && item.kind !== "crypto").map((item) => <option key={item.id} value={item.id}>{ui(locale, item.name)}</option>)}</select></label>
    {form.type === "expense" && <label>{copy.category}<select value={form.category} onChange={(event) => { setCategoryTouched(true); set("category", event.target.value); }}>{CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel(locale, item)}</option>)}</select></label>}
    <label className="tn-span-2">{copy.tags}<input placeholder="work, travel" value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags} onChange={(event) => set("tags", event.target.value)} /></label>
    <label className="tn-span-2">{copy.note}<input placeholder={copy.optional} value={form.note || ""} onChange={(event) => set("note", event.target.value)} /></label>
    <label className="tn-check tn-span-2"><input type="checkbox" checked={form.needsReview || false} onChange={(event) => set("needsReview", event.target.checked)} /> {copy.review}</label>
    <button className="tc-action tn-span-2" disabled={busy}>{busy ? copy.saving : copy.save}</button>
  </form></Modal>;
}

const ACCOUNT_ICONS = { cash: Banknote, bank: Landmark, savings: PiggyBank, crypto: Bitcoin };

function AccountsPage({ accounts, transfers, currency, hidden, onAdd, onEdit, onTransfer, onEditTransfer, onDeleteTransfer, onArchive, locale }) {
  const active = accounts.filter((item) => !item.archived);
  const archived = accounts.filter((item) => item.archived);
  const total = active.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const accountName = (id) => ui(locale, accounts.find((item) => item.id === id)?.name || "Account");
  return <section className="tc-page tn-accounts-page">
    <div className="tc-page-head"><div><span>{ui(locale, "MONEY ACCOUNTS")}</span><h2>{ui(locale, "Accounts")}</h2><p>{ui(locale, "See where your money lives and move it without creating income or expense.")}</p></div><div className="tn-account-head-actions"><button className="tn-transfer-launch" onClick={onTransfer} aria-label={ui(locale, "Transfer")} title={ui(locale, "Transfer")}><ArrowRightLeft size={18} /></button><button className="tc-action" onClick={onAdd}><Plus size={17} /> {ui(locale, "Add account")}</button></div></div>
    <section className="tn-accounts-total"><div><span>{ui(locale, "TOTAL BALANCE")}</span><h3>{money(total, currency, hidden)}</h3><p>{ui(locale, "Across all active accounts")}</p></div><Wallet size={31} /></section>
    <div className="tn-account-grid">{active.map((account) => { const Icon = ACCOUNT_ICONS[account.kind] || Wallet; return <article className={`tc-panel tn-account-card ${account.kind}`} key={account.id}><header><span><Icon size={18} /></span>{account.kind !== "crypto" && <div className="tn-card-actions"><button onClick={() => onEdit(account)} aria-label={ui(locale, "Edit")}><Pencil size={14} /></button><button className="tn-delete-icon" onClick={() => onArchive(account.id)} aria-label={ui(locale, "Archive account")}><Trash2 size={14} /></button></div>}</header><small>{ui(locale, account.kind.toUpperCase())}</small><h3>{ui(locale, account.name)}</h3><b>{money(account.balance, currency, hidden)}</b><p>{account.kind === "crypto" ? ui(locale, "Synced with your crypto portfolio") : ui(locale, "Includes entries and transfers")}</p></article>; })}</div>
    <section className="tc-panel tn-transfer-list"><header><div><span>{ui(locale, "RECENT TRANSFERS")}</span><h3>{ui(locale, "Money movement")}</h3></div></header>{transfers.length ? transfers.slice(0, 12).map((item) => <article key={item.id}><span><ArrowRightLeft size={15} /></span><div><b>{accountName(item.fromAccountId)} <ChevronRight size={13} /> {accountName(item.toAccountId)}</b><small>{item.date}{item.note ? ` · ${item.note}` : ""}</small></div><strong>{money(item.amount, currency, hidden)}</strong><div className="tn-transfer-actions"><button onClick={() => onEditTransfer(item)} aria-label={ui(locale, "Edit transfer")}><Pencil size={14} /></button><button className="tn-delete-icon" onClick={() => onDeleteTransfer(item.id)} aria-label={ui(locale, "Delete transfer")}><Trash2 size={14} /></button></div></article>) : <div className="tn-account-empty"><ArrowRightLeft size={22} /><b>{ui(locale, "No transfers yet")}</b><p>{ui(locale, "Transfers change account balances but never affect spending reports.")}</p></div>}</section>
    {archived.length > 0 && <section className="tc-panel tn-archived-accounts"><span>{ui(locale, "ARCHIVED ACCOUNTS")}</span>{archived.map((account) => <div key={account.id}><b>{ui(locale, account.name)}</b><button onClick={() => onArchive(account.id, false)} aria-label={ui(locale, "Restore")} title={ui(locale, "Restore")}><ArchiveRestore size={16} /></button></div>)}</section>}
  </section>;
}

function AccountModal({ currency, initial, onClose, onSave, locale }) {
  const [form, setForm] = useState(initial ? { ...initial, openingBalance: String(initial.openingBalance) } : { name: "", kind: "bank", openingBalance: "" });
  const [busy, setBusy] = useState(false);
  return <Modal onClose={onClose}><span className="tc-kicker">{ui(locale, initial ? "EDIT ACCOUNT" : "NEW ACCOUNT")}</span><h2>{ui(locale, initial ? "Edit your account." : "Add a place for your money.")}</h2><p className="tc-modal-copy">{ui(locale, "Use the opening balance once; future changes come from transactions and transfers.")}</p><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (!form.name.trim()) return; setBusy(true); const ok = await onSave({ ...form, openingBalance: Number(String(form.openingBalance || 0).replace(",", ".")) }); setBusy(false); if (ok) onClose(); }}><label>{ui(locale, "Account name")}<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={ui(locale, "Main card")} /></label><label>{ui(locale, "Account type")}<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}><option value="cash">{ui(locale, "Cash")}</option><option value="bank">{ui(locale, "Bank card")}</option><option value="savings">{ui(locale, "Savings")}</option></select></label><label>{ui(locale, "Opening balance")} ({currency})<input inputMode="decimal" value={form.openingBalance} onChange={(event) => setForm({ ...form, openingBalance: event.target.value })} placeholder="0" /></label><button className="tc-action" disabled={busy}>{ui(locale, busy ? "Saving…" : initial ? "Save changes" : "Create account")}</button></form></Modal>;
}

function TransferModal({ accounts, currency, initial, onClose, onSave, locale }) {
  const available = accounts.filter((item) => !item.archived && item.kind !== "crypto");
  const [form, setForm] = useState(initial ? { ...initial, amount: String(initial.amount), fee: String(initial.fee || "") } : { fromAccountId: available[0]?.id || "", toAccountId: available[1]?.id || "", amount: "", fee: "", date: iso(new Date()), note: "" });
  const [busy, setBusy] = useState(false);
  const options = (excluded) => available.filter((item) => item.id !== excluded).map((item) => <option key={item.id} value={item.id}>{ui(locale, item.name)}</option>);
  return <Modal onClose={onClose}><span className="tc-kicker">{ui(locale, initial ? "EDIT TRANSFER" : "INTERNAL TRANSFER")}</span><h2>{ui(locale, initial ? "Edit money movement." : "Move money between accounts.")}</h2><p className="tc-modal-copy">{ui(locale, "A transfer changes balances only. It is not counted as income or spending.")}</p><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); const amount = Number(String(form.amount).replace(",", ".")); if (!(amount > 0) || !form.fromAccountId || !form.toAccountId || form.fromAccountId === form.toAccountId) return; setBusy(true); const ok = await onSave({ ...form, amount, fee: Math.max(0, Number(String(form.fee || 0).replace(",", ".")) || 0) }); setBusy(false); if (ok) onClose(); }}><label>{ui(locale, "From account")}<select value={form.fromAccountId} onChange={(event) => setForm({ ...form, fromAccountId: event.target.value, toAccountId: event.target.value === form.toAccountId ? available.find((item) => item.id !== event.target.value)?.id || "" : form.toAccountId })}>{available.map((item) => <option key={item.id} value={item.id}>{ui(locale, item.name)}</option>)}</select></label><label>{ui(locale, "To account")}<select value={form.toAccountId} onChange={(event) => setForm({ ...form, toAccountId: event.target.value })}>{options(form.fromAccountId)}</select></label><label>{ui(locale, "Amount")} ({currency})<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>{ui(locale, "Transfer fee")} ({currency})<input inputMode="decimal" value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} placeholder="0" /></label><label>{ui(locale, "Date")}<input className="tn-date-input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label>{ui(locale, "Note")}<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={ui(locale, "Optional context")} /></label><button className="tc-action" disabled={busy || available.length < 2}>{ui(locale, busy ? "Saving…" : initial ? "Save changes" : "Save transfer")}</button>{available.length < 2 && <p className="tc-form-error">{ui(locale, "Add at least two non-crypto accounts first.")}</p>}</form></Modal>;
}

function GoalModal({ initial, onClose, onSave, locale }) {
  const [form, setForm] = useState(initial ? { ...initial, target: String(initial.target) } : { name: "", target: "", deadline: "", icon: "Target", color: COLORS[0] });
  return <Modal onClose={onClose}><span className="tc-kicker">{ui(locale, initial ? "EDIT GOAL" : "NEW GOAL")}</span><h2>{ui(locale, initial ? "Edit your goal." : "Give your money direction.")}</h2><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (form.name && Number(form.target) > 0 && await onSave(form)) onClose(); }}><label>{ui(locale, "Name")}<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={ui(locale, "Emergency fund")} /></label><label>{ui(locale, "Target amount")}<input inputMode="decimal" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} /></label><label>{ui(locale, "Target date")}<input className="tn-date-input" type="date" value={form.deadline || ""} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></label><label>{ui(locale, "Color")}<input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label><button className="tc-action">{ui(locale, initial ? "Save changes" : "Create goal")}</button></form></Modal>;
}

function RecurringModal({ onClose, onSave, locale }) {
  const [form, setForm] = useState({ merchant: "", amount: "", category: "Subscriptions", type: "expense", day: new Date().getDate() });
  return <Modal onClose={onClose}><span className="tc-kicker">{ui(locale, "RECURRING ITEM")}</span><h2>{ui(locale, "Plan what repeats.")}</h2><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (form.merchant && Number(form.amount) > 0 && await onSave(form)) onClose(); }}><label>{ui(locale, "Type")}<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="expense">{ui(locale, "Expense")}</option><option value="income">{ui(locale, "INCOME")}</option></select></label><label>{ui(locale, "Merchant or source")}<input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label><label>{ui(locale, "Amount")}<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>{ui(locale, "Category")}<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel(locale, item)}</option>)}</select></label><label>{ui(locale, "Day of month")}<input type="number" min="1" max="31" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })} /></label><button className="tc-action">{ui(locale, "Save recurring item")}</button></form></Modal>;
}

function AutomationModal({ initial, onClose, onSave, locale }) {
  const [form, setForm] = useState(initial ? { ...initial } : { name: "", merchantContains: "", amountAbove: "", type: "any", actionType: "keep", category: "", markReview: false });
  const [busy, setBusy] = useState(false);
  return <Modal onClose={onClose}><span className="tc-kicker">{ui(locale, initial ? "EDIT AUTOMATION" : "NEW AUTOMATION")}</span><h2>{ui(locale, initial ? "Edit automation rule." : "Create an automation rule.")}</h2><p className="tc-modal-copy">{ui(locale, "New transactions will apply every matching active rule.")}</p><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (!form.name.trim() || (!form.merchantContains.trim() && !(Number(form.amountAbove) > 0))) return; setBusy(true); const ok = await onSave({ ...form, amountAbove: Number(form.amountAbove) > 0 ? Number(form.amountAbove) : "" }); setBusy(false); if (ok) onClose(); }}>
    <label>{ui(locale, "Rule name")}<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
    <label>{ui(locale, "Merchant contains")}<input value={form.merchantContains} onChange={(event) => setForm({ ...form, merchantContains: event.target.value })} placeholder="Lidl" /></label>
    <label>{ui(locale, "Amount above")}<input inputMode="decimal" value={form.amountAbove} onChange={(event) => setForm({ ...form, amountAbove: event.target.value })} placeholder="300" /></label>
    <label>{ui(locale, "Match transaction type")}<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="any">{ui(locale, "Any type")}</option><option value="expense">{ui(locale, "Expense")}</option><option value="income">{ui(locale, "Income")}</option></select></label>
    <label>{ui(locale, "Set transaction type")}<select value={form.actionType} onChange={(event) => setForm({ ...form, actionType: event.target.value })}><option value="keep">{ui(locale, "Keep current type")}</option><option value="expense">{ui(locale, "Expense")}</option><option value="income">{ui(locale, "Income")}</option></select></label>
    <label>{ui(locale, "Category action")}<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option value="">{ui(locale, "Keep current category")}</option>{CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel(locale, item)}</option>)}</select></label>
    <label className="tn-check tn-span-2"><input type="checkbox" checked={form.markReview} onChange={(event) => setForm({ ...form, markReview: event.target.checked })} /><span>{ui(locale, "Mark matching entries for review")}</span></label>
    <button className="tc-action" disabled={busy}>{ui(locale, busy ? "Saving…" : initial ? "Save changes" : "Save rule")}</button>
  </form></Modal>;
}

const inlineCoachText = (text, key) => String(text).split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`)/g).filter(Boolean).map((part, index) => {
  const itemKey = `${key}-${index}`;
  if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) return <strong key={itemKey}>{part.slice(2, -2)}</strong>;
  if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) return <em key={itemKey}>{part.slice(1, -1)}</em>;
  if (part.startsWith("`") && part.endsWith("`")) return <code key={itemKey}>{part.slice(1, -1)}</code>;
  return part.split(/(\b\d[\d,.]*\s?(?:EUR|USD|PLN|UAH)\b|\b\d+(?:[.,]\d+)?%|(?:€|\$|₴)\s?\d[\d,.]*)/g).filter(Boolean).map((piece, pieceIndex) => /(?:EUR|USD|PLN|UAH|%|€|\$|₴)/.test(piece) ? <strong className="tc-coach-number" key={`${itemKey}-${pieceIndex}`}>{piece}</strong> : piece);
});

function CoachAnswer({ value }) {
  return <article className="tc-coach-answer" tabIndex="0" aria-label="Trek Coach answer">{parseCoachAnswer(value).map((block, index) => {
    if (block.type === "heading") return <h3 key={index}>{inlineCoachText(block.text, index)}</h3>;
    if (block.type === "list") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineCoachText(item, `${index}-${itemIndex}`)}</li>)}</ul>;
    if (block.type === "ordered-list") return <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineCoachText(item, `${index}-${itemIndex}`)}</li>)}</ol>;
    return <p key={index}>{inlineCoachText(block.text, index)}</p>;
  })}</article>;
}

function CoachModal({ onClose, onAsk, locale }) {
  const prompts = ["What should I change this month?", "Which category needs attention?", "Can I safely increase my savings goal?"].map((item) => ui(locale, item));
  const [question, setQuestion] = useState(prompts[0]); const [answer, setAnswer] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <Modal onClose={onClose} wide><span className="tc-kicker">TREK COACH · AI</span><h2>{ui(locale, "Ask about your money pace.")}</h2><div className="tn-prompt-chips">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); setAnswer(""); try { setAnswer(await onAsk(question)); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }}><label>{ui(locale, "Your question")}<textarea maxLength="600" value={question} onChange={(event) => setQuestion(event.target.value)} /></label><button className="tc-action" disabled={busy}><Sparkles size={16} /> {busy ? ui(locale, "Thinking…") : ui(locale, "Ask the coach")}</button></form>{error && <p className="tc-form-error">{error}</p>}{answer && <CoachAnswer value={answer} />}</Modal>;
}

const fileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("The statement file could not be read."));
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.readAsDataURL(file);
});

function StatementImportModal({ currency, onClose, onAnalyze, onConfirm, locale }) {
  const [file, setFile] = useState(null); const [statement, setStatement] = useState(null);
  const [selected, setSelected] = useState(new Set()); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const analyze = async () => {
    if (!file) return setError(ui(locale, "Choose a CSV or PDF bank statement."));
    if (file.size > 8 * 1024 * 1024) return setError(ui(locale, "Choose a statement under 8 MB."));
    setBusy(true); setError("");
    try { const next = await onAnalyze(file); setStatement(next); setSelected(new Set(next.transactions.map((_, index) => index))); }
    catch (requestError) { setError(requestError.message || ui(locale, "The statement could not be analyzed.")); }
    finally { setBusy(false); }
  };
  const updateRow = (index, change) => setStatement((current) => ({ ...current, transactions: current.transactions.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row) }));
  return <Modal onClose={onClose} wide><span className="tc-kicker">LIFETIME · {ui(locale, "SMART IMPORT")}</span><h2>{ui(locale, "Import a bank statement.")}</h2><p className="tc-modal-copy">{ui(locale, "Upload CSV or PDF, review the detected categories, then add the selected rows. Foreign amounts use the historical official exchange rate available for each transaction date.")}</p>
    {!statement ? <div className="tn-import-start"><label><FileText size={22} /><span><b>{file?.name || ui(locale, "Choose a statement")}</b><small>{ui(locale, "CSV or PDF · up to 8 MB")}</small></span><input type="file" accept=".csv,.pdf,text/csv,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(""); }} /></label><button className="tc-action" disabled={busy || !file} onClick={analyze}>{busy ? <LoaderCircle className="tn-spin" size={17} /> : <Banknote size={17} />} {ui(locale, busy ? "Analyzing…" : "Analyze statement")}</button><small className="tn-import-privacy">{ui(locale, "CSV is parsed deterministically. PDF content is processed by the configured Gemini service to extract transaction rows.")}</small></div>
      : <><div className="tn-import-summary"><div><b>{statement.transactions.length}</b><span>{ui(locale, "transactions found")}</span></div><div><b>{statement.months.map((item) => monthLabel(item, locale)).join(", ")}</b><span>{ui(locale, "detected period")}</span></div><div><b>{currency}</b><span>{ui(locale, "converted currency")}</span></div></div><div className="tn-import-table"><header><span /><span>{ui(locale, "Date and merchant")}</span><span>{ui(locale, "Category")}</span><span>{ui(locale, "Original")}</span><span>{ui(locale, "Import amount")}</span></header>{statement.transactions.map((row, index) => <div key={row.importHash}><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} /><span><b>{row.merchant}</b><small>{row.date} · {ui(locale, row.type === "income" ? "Income" : "Expense")}</small></span><select value={row.category} disabled={row.type === "income"} onChange={(event) => updateRow(index, { category: event.target.value })}>{CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel(locale, item)}</option>)}</select><span>{row.originalAmount.toLocaleString(LOCALE_TAGS[locale] || LOCALE_TAGS.en, { maximumFractionDigits: 2 })} {row.originalCurrency}</span><strong>{money(row.amount, currency)}</strong></div>)}</div><div className="tn-import-actions"><button onClick={() => { setStatement(null); setFile(null); }}>{ui(locale, "Choose another file")}</button><button className="tc-action" disabled={busy || selected.size === 0} onClick={async () => { setBusy(true); setError(""); try { await onConfirm(statement.transactions.filter((_, index) => selected.has(index)), statement.fileName, statement.months); onClose(); } catch (requestError) { setError(requestError.message || ui(locale, "The transactions could not be saved.")); setBusy(false); } }}>{busy ? ui(locale, "Importing…") : ui(locale, "Import {count} selected").replace("{count}", selected.size)}</button></div></>}
    {error && <p className="tc-form-error">{error}</p>}
  </Modal>;
}

function PricingModal({ plan, user, onClose, onCheckout, locale, nativeApp = false }) {
  const choices = [
    ["Start", "Free", ["Manual tracking", "Receipt recognition", "One goal", "Basic monthly plan", "Two crypto positions"]],
    ["Plus", "€6 / month", ["Recurring calendar", "Unlimited goals", "Data export", "Advanced analytics", "Trek Coach", "Unlimited crypto portfolio"]],
    ["Lifetime", "€149 once", ["Every Plus feature", "CSV and PDF bank import", "Historical exchange-rate conversion", "Crypto portfolio backup", "Lifetime access"]],
  ];
  return <Modal onClose={onClose} wide><span className="tc-kicker">{ui(locale, "MEMBERSHIP")}</span><h2>{ui(locale, "Choose your Trek mode.")}</h2><p className="tc-modal-copy">{ui(locale, nativeApp ? "Your existing Trek membership syncs automatically across web and mobile. Purchases are not offered inside the iOS app." : "Start with the essentials, or unlock deeper planning, automation and coaching.")}</p><div className="tc-prices">{choices.map(([name, price, features]) => <article key={name} className={plan === name ? "selected" : ""}><span>{name}</span><h3>{ui(locale, price)}</h3><ul>{features.map((feature) => <li key={feature}><Check size={15} /> {ui(locale, feature)}</li>)}</ul><button disabled={nativeApp || plan === name || name === "Start"} onClick={() => onCheckout(name, user)}>{ui(locale, plan === name ? "Current plan" : nativeApp ? "Synced from your account" : name === "Start" ? "Included" : "Continue to payment")}</button></article>)}</div></Modal>;
}

function AdminModal({ onClose, onLookup, onGrant, locale }) {
  const [email, setEmail] = useState(""); const [account, setAccount] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const lookup = async (event) => { event?.preventDefault(); setBusy(true); setError(""); try { setAccount(await onLookup(email)); } catch (lookupError) { setAccount(null); setError(lookupError.message); } finally { setBusy(false); } };
  return <Modal onClose={onClose}><span className="tc-kicker">TREK ADMIN</span><h2>{ui(locale, "Manage membership.")}</h2><p className="tc-modal-copy">{ui(locale, "Find a registered account and assign access without editing the database manually.")}</p><form className="tc-form tn-admin-search" onSubmit={lookup}><label>{ui(locale, "User email")}<input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@example.com" /></label><button className="tc-action" disabled={busy || !email.trim()}>{ui(locale, busy ? "Searching…" : "Find account")}</button></form>{error && <p className="tc-form-error">{error}</p>}{account && <section className="tn-admin-account"><div><span>{(account.full_name || account.email).charAt(0).toUpperCase()}</span><div><b>{account.full_name || ui(locale, "Trek member")}</b><small>{account.email}</small></div><strong>{account.plan}</strong></div><p>{ui(locale, "Choose the access level. Manual grants do not create or charge a Stripe subscription.")}</p><div>{["Start","Plus","Lifetime"].map((item) => <button key={item} className={account.plan === item ? "on" : ""} disabled={busy || account.plan === item} onClick={async () => { setBusy(true); setError(""); try { setAccount(await onGrant(account.email, item)); } catch (grantError) { setError(grantError.message); } finally { setBusy(false); } }}>{item}</button>)}</div></section>}</Modal>;
}

function DeleteAccountModal({ onClose, onDelete, locale }) {
  const [confirmation, setConfirmation] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <Modal onClose={busy ? () => {} : onClose} locked={busy}><span className="tc-kicker tn-danger">{ui(locale, "DANGER ZONE")}</span><h2>{ui(locale, "Delete your Trek account?")}</h2><p className="tc-modal-copy">{ui(locale, "This permanently removes your login and all connected Trek data. Active Stripe subscriptions must be cancelled separately in the billing portal.")}</p><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (confirmation !== "DELETE") return; setBusy(true); setError(""); try { await onDelete(confirmation); } catch (deleteError) { setError(deleteError.message || ui(locale, "Account could not be deleted.")); setBusy(false); } }}><label>{ui(locale, "Type DELETE to confirm")}<input autoFocus autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <p className="tc-form-error">{error}</p>}<div className="tn-delete-actions"><button type="button" onClick={onClose} disabled={busy}>{ui(locale, "Keep my account")}</button><button className="tn-delete-confirm" disabled={busy || confirmation !== "DELETE"}>{ui(locale, busy ? "Deleting…" : "Delete permanently")}</button></div></form></Modal>;
}

function RestoreBackupModal({ onClose, onRestore }) {
  const [file, setFile] = useState(null); const [backup, setBackup] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const choose = async (selected) => { setFile(selected || null); setBackup(null); setError(""); if (!selected) return; if (selected.size > 5 * 1024 * 1024) return setError("Choose a Trek backup smaller than 5 MB."); try { setBackup(validateBackup(JSON.parse(await selected.text()))); } catch (readError) { setError(readError.message || "The backup could not be read."); } };
  const counts = backup ? [["Transactions", backup.transactions.length], ["Plans", backup.monthlyBudgets.length + backup.categoryBudgets.length], ["Goals", backup.goals.length], ["Recurring", backup.recurring.length], ["Crypto", backup.cryptoHoldings.length]] : [];
  return <Modal onClose={busy ? () => {} : onClose} locked={busy}><span className="tc-kicker">RESTORE DATA</span><h2>Restore a Trek backup.</h2><p className="tc-modal-copy">Existing records with the same IDs will be updated. Your membership and Stripe billing will not change.</p><div className="tn-restore-picker"><label><FileUp size={18} /><span><b>{file?.name || "Choose trek-backup.json"}</b><small>JSON · maximum 5 MB</small></span><input type="file" accept="application/json,.json" onChange={(event) => choose(event.target.files?.[0])} /></label></div>{counts.length > 0 && <div className="tn-restore-counts">{counts.map(([label, count]) => <div key={label}><b>{count}</b><span>{label}</span></div>)}</div>}{error && <p className="tc-form-error">{error}</p>}<div className="tn-delete-actions"><button onClick={onClose} disabled={busy}>Cancel</button><button className="tc-action" disabled={!backup || busy} onClick={async () => { setBusy(true); setError(""); try { await onRestore(backup); } catch (restoreError) { setError(restoreError.message || "Backup could not be restored."); setBusy(false); } }}>{busy ? "Restoring…" : "Restore backup"}</button></div></Modal>;
}

function SettingsPage({ user, profileName, avatarUrl, currency, fallbackBudget, plan, privacy, notificationsEnabled, widgets, canExport, transactions, budgets, categoryBudgets, goals, recurring, cryptoHoldings, isAdmin, onProfile, onAvatar, onCurrency, onPrivacy, onNotifications, onWidgets, onPortal, onUpgrade, onAdmin, onDeleteAccount, onRestoreBackup, locale, onLocale, theme, onTheme, copy, nativeApp = false }) {
  const [name, setName] = useState(profileName); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const exportData = () => { const blob = new Blob([JSON.stringify({ format: "trek-backup", version: 1, exportedAt: new Date().toISOString(), transactions, monthlyBudgets: budgets, categoryBudgets, goals, recurring, cryptoHoldings, settings: { currency, privacy, notificationsEnabled, widgets, monthlyBudget: fallbackBudget } }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `trek-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); };
  const saveName = async (event) => { event?.preventDefault(); setBusy(true); setError(""); try { await onProfile(name); } catch (saveError) { setError(saveError.message); } finally { setBusy(false); } };
  return <section className="tc-page"><div className="tc-page-head"><div><span>{copy.eyebrow}</span><h2>{copy.title}</h2><p>{copy.intro}</p></div></div><div className="tc-settings">
    <div className="tn-settings-column">
      <section className="tc-panel"><span>{copy.profile}</span><div className="tc-profile-row">{avatarUrl ? <img className="tc-profile-avatar" src={avatarUrl} alt="Profile" /> : <span className="tc-profile-avatar">{profileName.charAt(0).toUpperCase()}</span>}<div><h3>{profileName}</h3><p>{user.email}</p></div></div><div className="tn-settings-actions"><label className="tc-upload"><Upload size={14} /> {copy.upload}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setBusy(true); await onAvatar(file); } catch (uploadError) { setError(uploadError.message); } finally { setBusy(false); } }} /></label></div><form className="tc-inline tn-profile-editor" onSubmit={saveName}><input aria-label="Profile name" value={name} onChange={(event) => setName(event.target.value)} /><button disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="tn-spin" size={15} /> : <Check size={15} />}{busy ? copy.saving : copy.save}</button></form>{error && <p className="tc-form-error">{error}</p>}</section>
      <section className="tc-panel"><span>{copy.membership}</span><h3>{plan}</h3><p>{ui(locale, nativeApp ? "Your membership and unlocked features sync automatically with your Trek account." : "Manage payments, invoices or cancellation through Stripe’s secure customer portal.")}</p>{nativeApp ? <button onClick={onUpgrade}><CreditCard size={15} /> {ui(locale, "View plan features")}</button> : <button onClick={plan === "Start" ? onUpgrade : onPortal}><CreditCard size={15} /> {ui(locale, plan === "Start" ? "See plans" : "Manage billing")}</button>}</section>
      <section className="tc-panel tn-dashboard-settings"><span>{copy.widgets}</span><h3>{copy.choose}</h3><p>{copy.focused}</p>{[["pace","Spending pace"],["signal","Trek signal"],["transactions","Recent transactions"],["goals","Top goal"]].map(([id,label]) => <label key={id}><input type="checkbox" checked={widgets.includes(id)} onChange={() => onWidgets(widgets.includes(id) ? widgets.filter((item) => item !== id) : [...widgets, id])} /> {ui(locale, label)}</label>)}</section>
      {isAdmin && <section className="tc-panel tn-admin-card"><span>{ui(locale, "ADMINISTRATION")}</span><h3>{ui(locale, "Membership access")}</h3><p>{ui(locale, "Find users and grant Start, Plus or Lifetime access from a protected server endpoint.")}</p><button onClick={onAdmin}><ShieldCheck size={15} /> {ui(locale, "Open admin tools")}</button></section>}
    </div>
    <div className="tn-settings-column">
      <section className="tc-panel"><span>{copy.display}</span><div className="tn-display-controls"><div><small className="tn-setting-label">{copy.language}</small><LanguageSwitch locale={locale} onChange={onLocale} className="tn-language-switch" /></div><div><small className="tn-setting-label">{ui(locale, "COLOR THEME")}</small><ThemeToggle theme={theme} onChange={onTheme} locale={locale} showLabel className="tn-theme-toggle" /></div></div><small className="tn-setting-label">{ui(locale, "BASE CURRENCY")}</small><h3>{currency}</h3><div className="tc-choice">{["EUR", "USD", "PLN", "UAH"].map((item) => <button key={item} className={currency === item ? "on" : ""} onClick={() => onCurrency(item)}>{item}</button>)}</div><div className="tn-setting-stack"><button onClick={() => onPrivacy(!privacy)}>{privacy ? <Eye size={15} /> : <EyeOff size={15} />} {ui(locale, privacy ? "Show amounts" : "Hide amounts")}</button><button onClick={() => onNotifications(!notificationsEnabled)}><Bell size={15} /> {ui(locale, notificationsEnabled ? "Budget alerts on" : "Budget alerts off")}</button></div></section>
      <section className="tc-panel"><span>{copy.data}</span><h3>{copy.backup}</h3><p>{ui(locale, canExport ? "Download or restore transactions, goals, recurring items and crypto positions." : "Cloud backup tools are available with Plus or Lifetime.")}</p><div className="tn-setting-stack"><button onClick={canExport ? exportData : onUpgrade}><Download size={15} /> {ui(locale, canExport ? "Export data" : "Upgrade to export")}</button>{canExport && <button onClick={onRestoreBackup}><FileUp size={15} /> {ui(locale, "Restore backup")}</button>}</div></section>
      <section className="tc-panel tn-danger-zone"><span>{copy.deleteLabel}</span><h3>{copy.deleteTitle}</h3><p>{ui(locale, "Permanently erase your Trek account and stored financial data.")}</p><button onClick={onDeleteAccount}><Trash2 size={15} /> {ui(locale, "Delete my account")}</button></section>
    </div>
  </div></section>;
}

const MOBILE_MORE_COPY = {
  en: { title: "More", done: "Done", money: "MONEY", planning: "PLANNING", insights: "INSIGHTS", account: "ACCOUNT", membership: "Membership" },
  pl: { title: "Więcej", done: "Gotowe", money: "FINANSE", planning: "PLANOWANIE", insights: "ANALIZY", account: "KONTO", membership: "Subskrypcja" },
  uk: { title: "Більше", done: "Готово", money: "ФІНАНСИ", planning: "ПЛАНУВАННЯ", insights: "АНАЛІТИКА", account: "ОБЛІКОВИЙ ЗАПИС", membership: "Підписка" },
};

function MobileMoreScreen({ user, locale, localizedNav, view, profileName, avatarUrl, plan, lockedView, onSelect, onPlans, onSettings, onSignOut, onClose, copy }) {
  const text = MOBILE_MORE_COPY[locale] || MOBILE_MORE_COPY.en;
  const nav = Object.fromEntries(localizedNav.map(([id, label, Icon]) => [id, { label, Icon }]));
  const row = (id, tone) => {
    const item = nav[id];
    if (!item) return null;
    const Icon = item.Icon;
    return <button key={id} className={`tm-more-row${view === id ? " on" : ""}`} onClick={() => onSelect(id)}>
      <i className={`tm-more-row-icon ${tone}`}><Icon size={20} /></i>
      <span>{item.label}</span>
      {lockedView(id) && <small>Plus</small>}
      <ChevronRight size={18} />
    </button>;
  };
  return createPortal(<div className="tm-more-page" role="dialog" aria-modal="true" aria-label={text.title}>
    <div className="tm-more-surface">
      <header className="tm-more-header"><span aria-hidden="true" /><h1>{text.title}</h1><button onClick={onClose}>{text.done}</button></header>
      <div className="tm-more-content">
        <section className="tm-more-profile">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : <i>{profileName.charAt(0).toUpperCase()}</i>}
          <div><strong>{profileName}</strong><small>{user.email}</small></div>
          <ChevronRight size={19} />
        </section>
        <h2>{text.money}</h2><section className="tm-more-group">{row("accounts", "mint")}</section>
        <h2>{text.planning}</h2><section className="tm-more-group">{row("calendar", "blue")}{row("recurring", "orange")}{row("automation", "violet")}{row("goals", "pink")}</section>
        <h2>{text.insights}</h2><section className="tm-more-group">{row("crypto", "gold")}{row("analytics", "cyan")}</section>
        <h2>{text.account}</h2><section className="tm-more-group">
          <button className="tm-more-row" onClick={onPlans}><i className="tm-more-row-icon mint"><CreditCard size={20} /></i><span>{text.membership}</span><small>{plan}</small><ChevronRight size={18} /></button>
          <button className={`tm-more-row${view === "settings" ? " on" : ""}`} onClick={onSettings}><i className="tm-more-row-icon gray"><Settings size={20} /></i><span>{copy.settings}</span><ChevronRight size={18} /></button>
          <button className="tm-more-row danger" onClick={onSignOut}><i className="tm-more-row-icon red"><LogOut size={20} /></i><span>{copy.signout}</span></button>
        </section>
      </div>
    </div>
  </div>, document.body);
}

export default function Cabinet({ onExit, onSignOut, user, onProfileUpdate, locale = "en", onLocale, theme = "dark", onTheme, nativeApp = false }) {
  const copy = CABINET_COPY[locale] || CABINET_COPY.en;
  const localizedNav = NAV.map(([id, Icon], index) => [id, copy.nav[index], Icon]);
  const [view, setView] = useState("overview"); const [month, setMonth] = useState(monthKey()); const [modal, setModal] = useState(null); const [editing, setEditing] = useState(null); const [entryDraft, setEntryDraft] = useState(null); const [editingAccount, setEditingAccount] = useState(null); const [editingTransfer, setEditingTransfer] = useState(null); const [editingGoal, setEditingGoal] = useState(null); const [editingRule, setEditingRule] = useState(null); const [editingCrypto, setEditingCrypto] = useState(null);
  const [transactions, setTransactions] = useState([]); const [budgets, setBudgets] = useState([]); const [categoryRows, setCategoryRows] = useState([]); const [goals, setGoals] = useState([]); const [recurring, setRecurring] = useState([]); const [merchantRules, setMerchantRules] = useState([]);
  const [accounts, setAccounts] = useState([]); const [transfers, setTransfers] = useState([]); const [automationRules, setAutomationRules] = useState([]);
  const [cryptoHoldings, setCryptoHoldings] = useState([]); const [cryptoPrices, setCryptoPrices] = useState({}); const [cryptoHistory, setCryptoHistory] = useState([]); const [cryptoPeriod, setCryptoPeriod] = useState("1M"); const [cryptoLoading, setCryptoLoading] = useState(false); const [cryptoRefresh, setCryptoRefresh] = useState(0);
  const [currency, setCurrency] = useState("EUR"); const [fallbackBudget, setFallbackBudget] = useState(0); const [privacy, setPrivacy] = useState(false); const [widgets, setWidgets] = useState(["pace", "signal", "transactions", "goals"]); const [plan, setPlan] = useState("Start"); const [avatarUrl, setAvatarUrl] = useState(""); const [profileName, setProfileName] = useState(user.user_metadata?.full_name || user.email?.split("@")[0] || "Member");
  const [onboardingCompleted, setOnboardingCompleted] = useState(true); const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true); const [dataError, setDataError] = useState(""); const [notice, setNotice] = useState(false); const [mobileNav, setMobileNav] = useState(false); const [toast, setToast] = useState(null); const [isAdmin, setIsAdmin] = useState(false); const [online, setOnline] = useState(() => navigator.onLine);
  const plus = plan !== "Start";
  useEffect(() => {
    if (!nativeApp || !mobileNav) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileNav, nativeApp]);
  const fromTransaction = (row) => ({ id: row.id, merchant: row.merchant, category: row.category, type: row.entry_type, amount: Number(row.amount), date: row.occurred_on, accountId: row.account_id || null, note: row.note || "", tags: row.tags || [], needsReview: row.needs_review || false, originalAmount: row.original_amount == null ? null : Number(row.original_amount), originalCurrency: row.original_currency, exchangeRate: row.exchange_rate == null ? null : Number(row.exchange_rate), exchangeRateDate: row.exchange_rate_date, importHash: row.import_hash, importSource: row.import_source, color: row.entry_type === "income" ? COLORS[1] : COLORS[CATEGORIES.indexOf(row.category) % COLORS.length] || COLORS[0] });
  const fromGoal = (row) => ({ id: row.id, name: row.name, target: Number(row.target_amount), saved: Number(row.saved_amount), deadline: row.deadline, icon: row.icon, color: row.color, status: row.status });
  const fromRecurring = (row) => ({ id: row.id, merchant: row.merchant, category: row.category, type: row.entry_type, amount: Number(row.amount), day: row.day_of_month, active: row.active, lastPostedMonth: row.last_posted_month });
  const fromCrypto = (row) => ({ id: row.id, coinId: row.coin_id, symbol: row.symbol, name: row.name, quantity: Number(row.quantity), averageBuyPriceUsd: Number(row.average_buy_price_usd), source: row.source });
  const fromAccount = (row) => ({ id: row.id, name: row.name, kind: row.kind, currency: row.currency, openingBalance: Number(row.opening_balance || 0), archived: Boolean(row.archived) });
  const fromTransfer = (row) => ({ id: row.id, fromAccountId: row.from_account_id, toAccountId: row.to_account_id, amount: Number(row.amount), fee: Number(row.fee || 0), date: row.occurred_on, note: row.note || "" });
  const fromAutomationRule = (row) => ({ id: row.id, name: row.name, merchantContains: row.merchant_contains || "", amountAbove: row.amount_above == null ? "" : Number(row.amount_above), type: row.entry_type || "any", actionType: row.action_entry_type || "keep", category: row.action_category || "", markReview: Boolean(row.action_needs_review), active: row.active !== false, priority: Number(row.priority || 0) });

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setDataError("");
      const verified = await supabase.auth.getUser();
      if (verified.error || !verified.data.user || verified.data.user.id !== user.id) {
        await supabase.auth.signOut({ scope: "local" });
        if (active) {
          setDataError("Your session does not belong to the configured Supabase project. Sign in again.");
          setLoading(false);
        }
        return;
      }
      const authUser = verified.data.user;
      const profile = { id: authUser.id, full_name: authUser.user_metadata?.full_name || profileName, email: authUser.email || "", updated_at: new Date().toISOString() };
      const profileWrite = await supabase.from("profiles").upsert(profile);
      if (profileWrite.error) {
        if (active) {
          const foreignKeyMismatch = profileWrite.error.message?.includes("profiles_id_fkey");
          setDataError(foreignKeyMismatch
            ? "This login belongs to another Supabase project. Sign out, clear this site's stored data, and sign in again."
            : profileWrite.error.message);
          setLoading(false);
        }
        return;
      }
      const results = await Promise.all([
        supabase.from("profiles").select("full_name, avatar_path").eq("id", user.id).single(),
        supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
        supabase.from("transactions").select("*").eq("user_id", user.id).order("occurred_on", { ascending: false }),
        supabase.from("subscriptions").select("plan,status").eq("user_id", user.id).maybeSingle(),
        supabase.from("monthly_budgets").select("*").eq("user_id", user.id),
        supabase.from("category_budgets").select("*").eq("user_id", user.id),
        supabase.from("goals").select("*").eq("user_id", user.id).neq("status", "archived").order("created_at"),
        supabase.from("recurring_items").select("*").eq("user_id", user.id).order("day_of_month"),
        supabase.from("crypto_holdings").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
        supabase.from("financial_accounts").select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("account_transfers").select("*").eq("user_id", user.id).order("occurred_on", { ascending: false }),
        supabase.from("automation_rules").select("*").eq("user_id", user.id).order("priority", { ascending: false }).order("created_at"),
      ]);
      const failed = results.find((result) => result.error);
      if (failed) { if (active) { setDataError(`${failed.error.message}. Run the latest supabase/schema.sql migration.`); setLoading(false); } return; }
      if (!active) return;
      const [profileResult, settingsResult, transactionResult, subscriptionResult, budgetResult, categoryResult, goalResult, recurringResult, cryptoResult, accountResult, transferResult, automationResult] = results;
      setProfileName(profileResult.data.full_name || user.email?.split("@")[0] || "Member"); setCurrency(settingsResult.data.currency || "EUR"); setFallbackBudget(Number(settingsResult.data.monthly_budget || 0)); setPrivacy(Boolean(settingsResult.data.privacy_mode)); setWidgets(Array.isArray(settingsResult.data.dashboard_widgets) ? settingsResult.data.dashboard_widgets : ["pace", "signal", "transactions", "goals"]); setOnboardingCompleted(settingsResult.data.onboarding_completed !== false); setNotificationsEnabled(settingsResult.data.notifications_enabled !== false);
      setTransactions(transactionResult.data.map(fromTransaction)); setPlan(subscriptionResult.data?.status === "active" ? subscriptionResult.data.plan : "Start"); setBudgets(budgetResult.data || []); setCategoryRows(categoryResult.data || []); setGoals(goalResult.data.map(fromGoal)); setRecurring(recurringResult.data.map(fromRecurring)); setCryptoHoldings((cryptoResult.data || []).map(fromCrypto)); setAccounts((accountResult.data || []).map(fromAccount)); setTransfers((transferResult.data || []).map(fromTransfer)); setAutomationRules((automationResult.data || []).map(fromAutomationRule));
      const rulesResult = await supabase.from("merchant_category_rules").select("merchant_key,display_name,category").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (!rulesResult.error) setMerchantRules(rulesResult.data || []);
      if (profileResult.data.avatar_path) { const signed = await supabase.storage.from("trek-avatars").createSignedUrl(profileResult.data.avatar_path, 3600); if (signed.data?.signedUrl) setAvatarUrl(signed.data.signedUrl); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => { const handler = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setEditing(null); setEntryDraft(null); setModal("entry"); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);

  const cryptoKey = cryptoHoldings.map((item) => item.coinId).sort().join(",");
  useEffect(() => {
    if (!cryptoKey) { setCryptoPrices({}); setCryptoHistory([]); return; }
    let active = true;
    setCryptoLoading(true);
    Promise.all([
      fetch(apiUrl(`/api/crypto-prices?ids=${encodeURIComponent(cryptoKey)}&currency=${currency}`)).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body.prices || {}; }),
      fetch(apiUrl(`/api/crypto-history?ids=${encodeURIComponent(cryptoKey)}&currency=${currency}&period=${cryptoPeriod}`)).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body.series || {}; }),
    ]).then(([quotes, series]) => {
      if (!active) return;
      setCryptoPrices(quotes);
      const reference = Object.values(series).sort((a, b) => b.length - a.length)[0] || [];
      setCryptoHistory(reference.map(([time], index) => ({ time, value: cryptoHoldings.reduce((total, holding) => {
        const coinSeries = series[holding.coinId] || [];
        const point = coinSeries[Math.min(coinSeries.length - 1, Math.round(index / Math.max(1, reference.length - 1) * Math.max(0, coinSeries.length - 1)))];
        return total + holding.quantity * Number(point?.[1] || 0);
      }, 0) })));
    }).catch((error) => active && setDataError(error.message || "Crypto market data is unavailable.")).finally(() => active && setCryptoLoading(false));
    return () => { active = false; };
  }, [cryptoKey, currency, cryptoPeriod, cryptoRefresh]);

  const monthTransactions = useMemo(() => transactions.filter((item) => inMonth(item, month)), [transactions, month]);
  const previousTransactions = useMemo(() => transactions.filter((item) => inMonth(item, shiftMonth(month, -1))), [transactions, month]);
  const budget = Number(budgets.find((row) => row.month_start === month)?.total ?? (month === monthKey() ? fallbackBudget : 0));
  const categoryBudgets = Object.fromEntries(categoryRows.filter((row) => row.month_start === month).map((row) => [row.category, Number(row.amount)]));
  const metrics = useMemo(() => calculateMetrics(monthTransactions, budget, month, recurring, locale), [monthTransactions, budget, month, recurring, locale]);
  const previousMetrics = useMemo(() => calculateMetrics(previousTransactions, Number(budgets.find((row) => row.month_start === shiftMonth(month, -1))?.total || 0), shiftMonth(month, -1), [], locale), [previousTransactions, budgets, month, locale]);
  const recurringCandidates = useMemo(() => detectRecurringCandidates(transactions, recurring), [transactions, recurring]);
  const cryptoPortfolioValue = useMemo(() => cryptoHoldings.reduce((sum, item) => sum + item.quantity * Number(cryptoPrices[item.coinId]?.price || 0), 0), [cryptoHoldings, cryptoPrices]);
  const accountBalances = useMemo(() => calculateAccountBalances(accounts, transactions, transfers, cryptoPortfolioValue), [accounts, transactions, transfers, cryptoPortfolioValue]);
  const defaultAccountId = accounts.find((item) => item.kind === "bank" && !item.archived)?.id || accounts.find((item) => item.kind !== "crypto" && !item.archived)?.id || null;
  const notificationItems = useMemo(() => {
    if (!notificationsEnabled || month !== monthKey()) return [];
    const today = new Date().getDate();
    const items = recurring.filter((item) => item.active && item.lastPostedMonth !== month && item.day <= today + 3).slice(0, 3).map((item) => ({ id: `recurring-${item.id}`, icon: CalendarClock, title: `${item.merchant} ${ui(locale, item.day < today ? "is overdue" : "is coming up")}`, copy: `${money(item.amount, currency, privacy)} · ${ui(locale, "day")} ${item.day}`, tone: item.day < today ? "danger" : "", recurring: item }));
    if (budget > 0 && metrics.spending >= budget * .85) items.push({ id: "budget", icon: AlertTriangle, title: ui(locale, metrics.spending > budget ? "Monthly budget exceeded" : "Budget is nearly used"), copy: `${Math.round(metrics.spending / budget * 100)}% ${ui(locale, "of this month’s budget has been spent.")}`, tone: "danger", view: "plan" });
    const overCategory = metrics.byCategory.find((row) => Number(categoryBudgets[row.category] || 0) > 0 && row.amount > Number(categoryBudgets[row.category]));
    if (overCategory) items.push({ id: `category-${overCategory.category}`, icon: BarChart3, title: `${categoryLabel(locale, overCategory.category)} ${ui(locale, "is over plan")}`, copy: `${money(overCategory.amount - Number(categoryBudgets[overCategory.category]), currency, privacy)} ${ui(locale, "above its envelope.")}`, tone: "danger", view: "plan" });
    const reviews = monthTransactions.filter((item) => item.needsReview).length;
    if (reviews) items.push({ id: "review", icon: ReceiptText, title: `${reviews} ${ui(locale, reviews === 1 ? "transaction needs review" : "transactions need review")}`, copy: ui(locale, "Check imported or scanned details before relying on the forecast."), view: "transactions" });
    return items.slice(0, 6);
  }, [notificationsEnabled, month, recurring, budget, metrics.spending, metrics.byCategory, categoryBudgets, monthTransactions, currency, privacy]);
  const setError = (error) => { setDataError(error?.message || String(error)); return false; };
  const showToast = (message, options = {}) => setToast({ message, ...options });
  const saveSettings = async (change) => { const result = await supabase.from("user_settings").update({ ...change, updated_at: new Date().toISOString() }).eq("user_id", user.id); if (result.error) return setError(result.error); if (change.currency) setCurrency(change.currency); if (change.privacy_mode !== undefined) setPrivacy(change.privacy_mode); if (change.dashboard_widgets) setWidgets(change.dashboard_widgets); if (change.notifications_enabled !== undefined) setNotificationsEnabled(change.notifications_enabled); if (change.onboarding_completed !== undefined) setOnboardingCompleted(change.onboarding_completed); return true; };
  const saveBudget = async (total, quiet = false) => { const row = { user_id: user.id, month_start: month, total: Math.max(0, total), updated_at: new Date().toISOString() }; const result = await supabase.from("monthly_budgets").upsert(row); if (result.error) return setError(result.error); setBudgets((current) => [...current.filter((item) => item.month_start !== month), row]); if (!quiet) showToast("Monthly budget updated."); return true; };
  const saveCategory = async (category, value, persist) => { const amount = Math.max(0, Number(String(value).replace(",", ".")) || 0); const row = { user_id: user.id, month_start: month, category, amount, updated_at: new Date().toISOString() }; setCategoryRows((current) => [...current.filter((item) => !(item.month_start === month && item.category === category)), row]); if (persist) { const result = await supabase.from("category_budgets").upsert(row); if (result.error) setError(result.error); } };
  const copyPrevious = async () => { const previous = shiftMonth(month, -1); const sourceBudget = budgets.find((row) => row.month_start === previous); const sourceCategories = categoryRows.filter((row) => row.month_start === previous); if (!sourceBudget && !sourceCategories.length) return setDataError("The previous month has no plan to copy."); if (sourceBudget) await saveBudget(Number(sourceBudget.total)); for (const row of sourceCategories) await saveCategory(row.category, row.amount, true); };

  const saveTransaction = async (form, quiet = false) => { const automated = form.id ? form : applyAutomationRules(form, automationRules); const payload = { user_id: user.id, merchant: automated.merchant.trim(), category: automated.type === "income" ? "Other" : automated.category, entry_type: automated.type, amount: automated.amount, occurred_on: automated.date, account_id: automated.accountId || defaultAccountId, note: automated.note || "", tags: automated.tags || [], needs_review: Boolean(automated.needsReview), original_amount: automated.originalAmount || null, original_currency: automated.originalCurrency || null, exchange_rate: automated.exchangeRate || null, exchange_rate_date: automated.exchangeRateDate || null, import_hash: automated.importHash || null, import_source: automated.importSource || null }; const result = form.id ? await supabase.from("transactions").update(payload).eq("id", form.id).select().single() : await supabase.from("transactions").insert(payload).select().single(); if (result.error) return setError(result.error); const next = fromTransaction(result.data); setTransactions((current) => form.id ? current.map((item) => item.id === form.id ? next : item) : [next, ...current]); if (automated.type === "expense") { const rule = { user_id: user.id, merchant_key: normalizeMerchant(automated.merchant), display_name: automated.merchant.trim(), category: automated.category, updated_at: new Date().toISOString() }; const ruleResult = await supabase.from("merchant_category_rules").upsert(rule); if (!ruleResult.error) setMerchantRules((current) => [rule, ...current.filter((item) => item.merchant_key !== rule.merchant_key)]); } if (!quiet) showToast(ui(locale, form.id ? "Transaction updated." : "Transaction saved.")); return true; };
  const removeTransaction = async (id) => { const removed = transactions.find((item) => item.id === id); if (!removed) return false; const result = await supabase.from("transactions").delete().eq("id", id); if (result.error) return setError(result.error); setTransactions((current) => current.filter((item) => item.id !== id)); showToast(ui(locale, "Transaction deleted."), { actionLabel: ui(locale, "Undo"), action: async () => { const payload = { id: removed.id, user_id: user.id, merchant: removed.merchant, category: removed.category, entry_type: removed.type, amount: removed.amount, occurred_on: removed.date, account_id: removed.accountId, note: removed.note, tags: removed.tags, needs_review: removed.needsReview, original_amount: removed.originalAmount, original_currency: removed.originalCurrency, exchange_rate: removed.exchangeRate, exchange_rate_date: removed.exchangeRateDate, import_hash: removed.importHash, import_source: removed.importSource }; const restored = await supabase.from("transactions").insert(payload).select().single(); if (restored.error) return setError(restored.error); setTransactions((current) => [fromTransaction(restored.data), ...current]); setToast(null); } }); return true; };
  const removeMany = async (ids) => { const result = await supabase.from("transactions").delete().in("id", ids); if (result.error) return setError(result.error); setTransactions((current) => current.filter((item) => !ids.includes(item.id))); return true; };
  const createGoal = async (form) => { const payload = { user_id: user.id, name: form.name.trim(), target_amount: Number(form.target), deadline: form.deadline || null, icon: form.icon, color: form.color, updated_at: new Date().toISOString() }; const result = form.id ? await supabase.from("goals").update(payload).eq("id", form.id).select().single() : await supabase.from("goals").insert(payload).select().single(); if (result.error) return setError(result.error); const next = fromGoal(result.data); setGoals((current) => form.id ? current.map((item) => item.id === form.id ? next : item) : [...current, next]); showToast(ui(locale, form.id ? "Goal updated." : "Goal created.")); return true; };
  const contribute = async (goal, amount) => { if (!(amount > 0)) return; const saved = Math.min(goal.target, goal.saved + amount); const status = saved >= goal.target ? "completed" : "active"; const result = await supabase.from("goals").update({ saved_amount: saved, status, updated_at: new Date().toISOString() }).eq("id", goal.id); if (result.error) return setError(result.error); setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, saved, status } : item)); };
  const archiveGoal = async (id) => { const result = await supabase.from("goals").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id); if (result.error) return setError(result.error); setGoals((current) => current.filter((item) => item.id !== id)); };
  const createAccount = async (form) => { const payload = { user_id: user.id, name: form.name.trim(), kind: form.kind, currency, opening_balance: form.openingBalance, updated_at: new Date().toISOString() }; const result = form.id ? await supabase.from("financial_accounts").update(payload).eq("id", form.id).select().single() : await supabase.from("financial_accounts").insert(payload).select().single(); if (result.error) return setError(result.error); const next = fromAccount(result.data); setAccounts((current) => form.id ? current.map((item) => item.id === form.id ? next : item) : [...current, next]); showToast(ui(locale, form.id ? "Account updated." : "Account created.")); return true; };
  const archiveAccount = async (id, archived = true) => { const account = accounts.find((item) => item.id === id); if (!account || account.kind === "crypto") return false; const result = await supabase.from("financial_accounts").update({ archived, updated_at: new Date().toISOString() }).eq("id", id); if (result.error) return setError(result.error); setAccounts((current) => current.map((item) => item.id === id ? { ...item, archived } : item)); showToast(ui(locale, archived ? "Account archived." : "Account restored.")); return true; };
  const saveTransfer = async (form) => { const payload = { user_id: user.id, from_account_id: form.fromAccountId, to_account_id: form.toAccountId, amount: form.amount, fee: form.fee, occurred_on: form.date, note: form.note || "" }; const result = form.id ? await supabase.from("account_transfers").update(payload).eq("id", form.id).select().single() : await supabase.from("account_transfers").insert(payload).select().single(); if (result.error) return setError(result.error); const next = fromTransfer(result.data); setTransfers((current) => form.id ? current.map((item) => item.id === form.id ? next : item) : [next, ...current]); showToast(ui(locale, form.id ? "Transfer updated." : "Transfer saved.")); return true; };
  const deleteTransfer = async (id) => { const removed = transfers.find((item) => item.id === id); if (!removed) return false; const result = await supabase.from("account_transfers").delete().eq("id", id); if (result.error) return setError(result.error); setTransfers((current) => current.filter((item) => item.id !== id)); showToast(ui(locale, "Transfer deleted."), { actionLabel: ui(locale, "Undo"), action: async () => { const restored = await supabase.from("account_transfers").insert({ id: removed.id, user_id: user.id, from_account_id: removed.fromAccountId, to_account_id: removed.toAccountId, amount: removed.amount, fee: removed.fee, occurred_on: removed.date, note: removed.note || "" }).select().single(); if (restored.error) return setError(restored.error); setTransfers((current) => [fromTransfer(restored.data), ...current]); setToast(null); } }); return true; };
  const createRecurring = async (form) => { const result = await supabase.from("recurring_items").insert({ user_id: user.id, merchant: form.merchant, category: form.category, entry_type: form.type, amount: Number(form.amount), day_of_month: Number(form.day) }).select().single(); if (result.error) return setError(result.error); setRecurring((current) => [...current, fromRecurring(result.data)]); showToast(`${form.merchant} added to recurring payments.`); return true; };
  const deleteRecurring = async (id) => { const result = await supabase.from("recurring_items").delete().eq("id", id); if (result.error) return setError(result.error); setRecurring((current) => current.filter((item) => item.id !== id)); };
  const saveAutomationRule = async (form) => { const payload = { user_id: user.id, name: form.name.trim(), merchant_contains: form.merchantContains.trim() || null, amount_above: form.amountAbove === "" ? null : Number(form.amountAbove), entry_type: form.type || "any", action_entry_type: form.actionType || "keep", action_category: form.category || null, action_needs_review: Boolean(form.markReview), active: form.id ? form.active !== false : true, priority: form.id ? form.priority : automationRules.length + 1, updated_at: new Date().toISOString() }; const result = form.id ? await supabase.from("automation_rules").update(payload).eq("id", form.id).select().single() : await supabase.from("automation_rules").insert(payload).select().single(); if (result.error) return setError(result.error); const next = fromAutomationRule(result.data); setAutomationRules((current) => form.id ? current.map((item) => item.id === form.id ? next : item) : [next, ...current]); showToast(ui(locale, form.id ? "Rule updated." : "Rule saved.")); return true; };
  const toggleAutomationRule = async (rule) => { const active = !rule.active; const result = await supabase.from("automation_rules").update({ active, updated_at: new Date().toISOString() }).eq("id", rule.id); if (result.error) return setError(result.error); setAutomationRules((current) => current.map((item) => item.id === rule.id ? { ...item, active } : item)); return true; };
  const deleteAutomationRule = async (id) => { const result = await supabase.from("automation_rules").delete().eq("id", id); if (result.error) return setError(result.error); setAutomationRules((current) => current.filter((item) => item.id !== id)); showToast(ui(locale, "Rule deleted.")); return true; };
  const postRecurring = async (item) => { if (item.lastPostedMonth === month) return setDataError("This recurring item is already posted for the selected month."); const day = Math.min(item.day, localDate(monthEnd(month)).getDate()); const ok = await saveTransaction({ merchant: item.merchant, category: item.category, type: item.type, amount: item.amount, date: `${month.slice(0, 8)}${String(day).padStart(2, "0")}`, note: "Recurring item", tags: ["recurring"], needsReview: false }, true); if (!ok) return; const result = await supabase.from("recurring_items").update({ last_posted_month: month, updated_at: new Date().toISOString() }).eq("id", item.id); if (!result.error) { setRecurring((current) => current.map((row) => row.id === item.id ? { ...row, lastPostedMonth: month } : row)); setNotice(false); showToast(`${item.merchant} posted for ${monthLabel(month)}.`); } };

  const completeOnboarding = async (form) => {
    const profileResult = await supabase.from("profiles").update({ full_name: form.name.trim(), updated_at: new Date().toISOString() }).eq("id", user.id);
    if (profileResult.error) throw profileResult.error;
    const settingsResult = await supabase.from("user_settings").update({ currency: form.currency, monthly_budget: form.budget, onboarding_completed: true, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    if (settingsResult.error) throw settingsResult.error;
    const budgetRow = { user_id: user.id, month_start: monthKey(), total: form.budget, updated_at: new Date().toISOString() };
    const budgetResult = await supabase.from("monthly_budgets").upsert(budgetRow);
    if (budgetResult.error) throw budgetResult.error;
    if (form.income > 0) {
      const incomeResult = await supabase.from("transactions").insert({ user_id: user.id, merchant: "Opening income", category: "Other", entry_type: "income", amount: form.income, occurred_on: iso(new Date()), account_id: defaultAccountId, note: "Added during Trek setup", tags: ["onboarding"], needs_review: false }).select().single();
      if (incomeResult.error) throw incomeResult.error;
      setTransactions((current) => [fromTransaction(incomeResult.data), ...current]);
    }
    setProfileName(form.name.trim()); setCurrency(form.currency); setFallbackBudget(form.budget); setBudgets((current) => [...current.filter((item) => item.month_start !== monthKey()), budgetRow]); setOnboardingCompleted(true); await onProfileUpdate(form.name.trim()); showToast("Your Trek dashboard is ready.");
  };

  const uploadAvatar = async (file) => { if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) throw new Error("Choose a PNG, JPG or WebP image under 2 MB."); const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`; const upload = await supabase.storage.from("trek-avatars").upload(path, file, { contentType: file.type }); if (upload.error) throw upload.error; const profile = await supabase.from("profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", user.id); if (profile.error) throw profile.error; const signed = await supabase.storage.from("trek-avatars").createSignedUrl(path, 3600); if (signed.error) throw signed.error; setAvatarUrl(signed.data.signedUrl); };
  const updateProfile = async (name) => { const next = name.trim() || profileName; const result = await supabase.from("profiles").update({ full_name: next, updated_at: new Date().toISOString() }).eq("id", user.id); if (result.error) return setError(result.error); await onProfileUpdate(next); setProfileName(next); return true; };
  const authenticatedFetch = async (url, options = {}) => { const session = await supabase.auth.getSession(); return fetch(apiUrl(url), { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}`, ...(options.headers || {}) } }); };
  useEffect(() => {
    let active = true;
    authenticatedFetch("/api/admin/status").then((response) => response.ok ? response.json() : { admin: false }).then((body) => active && setIsAdmin(Boolean(body.admin))).catch(() => active && setIsAdmin(false));
    return () => { active = false; };
  }, [user.id]);
  const lookupAdminUser = async (email) => { const response = await authenticatedFetch(`/api/admin/users?email=${encodeURIComponent(email)}`); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Account lookup failed."); return body.user; };
  const grantMembership = async (email, nextPlan) => { const response = await authenticatedFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ email, plan: nextPlan }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Membership update failed."); showToast(`${body.user.email} now has ${body.user.plan} access.`); return body.user; };
  const saveCrypto = async (form) => {
    if (!(form.quantity > 0) || form.averagePrice < 0) return setError("Enter a valid quantity and average purchase price.");
    const existing = cryptoHoldings.find((item) => item.coinId === form.coinId);
    if (!existing && plan === "Start" && cryptoHoldings.length >= 2) { setModal("pricing"); return false; }
    try {
      const response = await fetch(apiUrl(`/api/crypto-prices?ids=${encodeURIComponent(form.coinId)}&currency=${currency}`));
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not convert the purchase price.");
      const quote = body.prices?.[form.coinId];
      if (!quote?.price || !quote?.usdPrice) throw new Error("No current quote is available for this asset.");
      const payload = { user_id: user.id, coin_id: form.coinId, symbol: form.symbol, name: form.name, quantity: form.quantity, average_buy_price_usd: form.averagePrice * quote.usdPrice / quote.price, source: "manual", updated_at: new Date().toISOString() };
      const result = await supabase.from("crypto_holdings").upsert(payload, { onConflict: "user_id,coin_id" }).select().single();
      if (result.error) return setError(result.error);
      const next = fromCrypto(result.data);
      setCryptoHoldings((current) => [next, ...current.filter((item) => item.coinId !== next.coinId && item.id !== form.id)]);
      setCryptoRefresh((value) => value + 1);
      return true;
    } catch (error) { return setError(error); }
  };
  const deleteCrypto = async (id) => { const result = await supabase.from("crypto_holdings").delete().eq("id", id); if (result.error) return setError(result.error); setCryptoHoldings((current) => current.filter((item) => item.id !== id)); setCryptoRefresh((value) => value + 1); return true; };
  const analyzeStatement = async (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const mimeType = extension === "pdf" ? "application/pdf" : "text/csv";
    const response = await authenticatedFetch("/api/import-statement", { method: "POST", body: JSON.stringify({ file: { name: file.name, mimeType, data: await fileAsBase64(file) }, targetCurrency: currency }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Statement analysis is unavailable.");
    return body.statement;
  };
  const confirmStatement = async (rows, fileName, months) => {
    const source = fileName.toLowerCase().endsWith(".pdf") ? "PDF statement" : "CSV statement";
    const payload = rows.map((row) => applyAutomationRules({ ...row, needsReview: false }, automationRules)).map((row) => ({ user_id: user.id, merchant: row.merchant, category: row.type === "income" ? "Other" : row.category, entry_type: row.type, amount: row.amount, occurred_on: row.date, account_id: defaultAccountId,
      note: row.originalCurrency === currency ? `Imported from ${source}` : `Imported from ${source} · ${row.originalAmount} ${row.originalCurrency} at the historical official rate`, tags: ["imported", "bank-statement"], needs_review: Boolean(row.needsReview),
      original_amount: row.originalAmount, original_currency: row.originalCurrency, exchange_rate: row.exchangeRate, exchange_rate_date: row.exchangeRateDate, import_hash: row.importHash, import_source: source }));
    const result = await supabase.from("transactions").upsert(payload, { onConflict: "user_id,import_hash", ignoreDuplicates: true }).select();
    if (result.error) throw new Error(`${result.error.message}. Run the latest supabase/schema.sql migration first.`);
    const imported = (result.data || []).map(fromTransaction);
    setTransactions((current) => [...imported, ...current]);
    if (months?.length) setMonth(months[months.length - 1]);
    setDataError(imported.length < rows.length ? `${imported.length} imported; ${rows.length - imported.length} duplicate rows skipped.` : "");
  };
  const restoreBackup = async (backup) => {
    const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "")) ? value : crypto.randomUUID();
    const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
    const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
    const transactionsToRestore = backup.transactions.filter((row) => row && String(row.merchant || "").trim() && positive(row.amount) && validDate(row.date)).map((row) => ({
      id: uuid(row.id), user_id: user.id, merchant: String(row.merchant).trim().slice(0, 120), category: row.type === "income" ? "Other" : CATEGORIES.includes(row.category) ? row.category : "Other", entry_type: row.type === "income" ? "income" : "expense", amount: Number(row.amount), occurred_on: row.date,
      account_id: accounts.some((account) => account.id === row.accountId) ? row.accountId : defaultAccountId, note: String(row.note || "").slice(0, 1000), tags: Array.isArray(row.tags) ? row.tags.map(String).slice(0, 20) : [], needs_review: Boolean(row.needsReview), original_amount: positive(row.originalAmount) ? Number(row.originalAmount) : null, original_currency: row.originalCurrency ? String(row.originalCurrency).slice(0, 12) : null, exchange_rate: positive(row.exchangeRate) ? Number(row.exchangeRate) : null, exchange_rate_date: validDate(row.exchangeRateDate) ? row.exchangeRateDate : null, import_hash: row.importHash ? String(row.importHash).slice(0, 200) : null, import_source: row.importSource ? String(row.importSource).slice(0, 120) : "Trek backup",
    }));
    const goalsToRestore = backup.goals.filter((row) => row && String(row.name || "").trim() && positive(row.target)).map((row) => ({ id: uuid(row.id), user_id: user.id, name: String(row.name).trim().slice(0, 100), target_amount: Number(row.target), saved_amount: Math.max(0, Number(row.saved) || 0), deadline: validDate(row.deadline) ? row.deadline : null, icon: String(row.icon || "Target").slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(String(row.color || "")) ? row.color : "#00e5a0", status: ["active", "completed", "archived"].includes(row.status) ? row.status : "active", updated_at: new Date().toISOString() }));
    const recurringToRestore = backup.recurring.filter((row) => row && String(row.merchant || "").trim() && positive(row.amount)).map((row) => ({ id: uuid(row.id), user_id: user.id, merchant: String(row.merchant).trim().slice(0, 120), category: CATEGORIES.includes(row.category) ? row.category : "Other", entry_type: row.type === "income" ? "income" : "expense", amount: Number(row.amount), day_of_month: clamp(Math.round(Number(row.day) || 1), 1, 31), active: row.active !== false, last_posted_month: validDate(row.lastPostedMonth) ? row.lastPostedMonth : null, updated_at: new Date().toISOString() }));
    const cryptoToRestore = backup.cryptoHoldings.filter((row) => row && String(row.coinId || "").trim() && positive(row.quantity)).map((row) => ({ id: uuid(row.id), user_id: user.id, coin_id: String(row.coinId).trim().slice(0, 80), symbol: String(row.symbol || row.coinId).trim().slice(0, 12), name: String(row.name || row.symbol || row.coinId).trim().slice(0, 80), quantity: Number(row.quantity), average_buy_price_usd: Math.max(0, Number(row.averageBuyPriceUsd) || 0), source: ["manual", "binance_csv", "wallet"].includes(row.source) ? row.source : "manual", updated_at: new Date().toISOString() }));
    const monthlyBudgetsToRestore = backup.monthlyBudgets.filter((row) => row && validDate(row.month_start) && Number(row.total) >= 0).map((row) => ({ user_id: user.id, month_start: row.month_start, total: Number(row.total), updated_at: new Date().toISOString() }));
    const categoryBudgetsToRestore = backup.categoryBudgets.filter((row) => row && validDate(row.month_start) && CATEGORIES.includes(row.category) && Number(row.amount) >= 0).map((row) => ({ user_id: user.id, month_start: row.month_start, category: row.category, amount: Number(row.amount), updated_at: new Date().toISOString() }));
    const batches = [["transactions", transactionsToRestore], ["monthly_budgets", monthlyBudgetsToRestore], ["category_budgets", categoryBudgetsToRestore], ["goals", goalsToRestore], ["recurring_items", recurringToRestore], ["crypto_holdings", cryptoToRestore]];
    if (!batches.some(([, rows]) => rows.length)) throw new Error("The backup does not contain any valid Trek records.");
    for (const [table, rows] of batches) {
      if (!rows.length) continue;
      const result = await supabase.from(table).upsert(rows);
      if (result.error) throw new Error(`${result.error.message} (${table})`);
    }
    const restoredCurrency = ["UAH", "PLN", "EUR", "USD"].includes(backup.settings.currency) ? backup.settings.currency : null;
    const settingsChange = { updated_at: new Date().toISOString() };
    if (restoredCurrency) settingsChange.currency = restoredCurrency;
    if (typeof backup.settings.privacy === "boolean") settingsChange.privacy_mode = backup.settings.privacy;
    if (typeof backup.settings.notificationsEnabled === "boolean") settingsChange.notifications_enabled = backup.settings.notificationsEnabled;
    if (Array.isArray(backup.settings.widgets)) settingsChange.dashboard_widgets = backup.settings.widgets.filter((item) => ["pace", "signal", "transactions", "goals"].includes(item));
    if (Number(backup.settings.monthlyBudget) >= 0) settingsChange.monthly_budget = Number(backup.settings.monthlyBudget);
    if (Object.keys(settingsChange).length > 1) {
      const settingsResult = await supabase.from("user_settings").update(settingsChange).eq("user_id", user.id);
      if (settingsResult.error) throw settingsResult.error;
    }
    window.location.reload();
  };
  const scanReceipt = async (file) => {
    const image = await prepareReceiptImage(file);
    const response = await authenticatedFetch("/api/receipt", { method: "POST", body: JSON.stringify({ image, targetCurrency: currency }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Receipt scanning is unavailable.");
    return body.receipt;
  };
  const checkout = async (choice) => { const response = await authenticatedFetch("/api/checkout", { method: "POST", body: JSON.stringify({ plan: choice }) }); const body = await response.json().catch(() => ({})); if (response.ok && body.url) return window.location.assign(body.url); const key = choice === "Plus" ? "VITE_CHECKOUT_PLUS_URL" : "VITE_CHECKOUT_LIFETIME_URL"; const fallback = window.__TREK_ENV__?.[key]; if (!fallback) return setDataError(body.error || "Checkout is not configured."); const url = new URL(fallback); url.searchParams.set("client_reference_id", user.id); if (user.email) url.searchParams.set("prefilled_email", user.email); window.location.assign(url.toString()); };
  const billingPortal = async () => { const response = await authenticatedFetch("/api/billing-portal", { method: "POST" }); const body = await response.json().catch(() => ({})); if (!response.ok) return setDataError(body.error || "Billing portal is unavailable."); window.location.assign(body.url); };
  const deleteAccount = async (confirmation) => { const response = await authenticatedFetch("/api/account", { method: "DELETE", body: JSON.stringify({ confirmation }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Account could not be deleted."); await supabase.auth.signOut({ scope: "local" }); onSignOut(); };
  const askCoach = async (question) => { const response = await authenticatedFetch("/api/coach", { method: "POST", body: JSON.stringify({ question, locale, summary: { month, currency, budget, spent: metrics.spending, income: metrics.earned, remaining: metrics.remaining, safe_to_spend: metrics.safeToSpend, upcoming_bills: metrics.upcoming, daily_pace: metrics.daily, month_end_forecast: metrics.forecast, pulse_score: metrics.score, category_budgets: categoryBudgets, top_categories: metrics.byCategory.slice(0, 5), goals: goals.map((goal) => ({ name: goal.name, target: goal.target, saved: goal.saved, deadline: goal.deadline })) } }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || ui(locale, "Coach is unavailable.")); return body.answer; };

  const lockedView = (id) => ["calendar", "recurring", "automation", "analytics"].includes(id) && !plus;
  const changeView = (id) => lockedView(id) ? setModal("pricing") : setView(id);
  let page;
  if (view === "overview") page = <Overview transactions={monthTransactions} allTransactions={transactions} previousMetrics={previousMetrics} recurring={recurring} metrics={metrics} budget={budget} goals={goals} currency={currency} hidden={privacy} categoryBudgets={categoryBudgets} widgets={widgets} locale={locale} onAdd={() => { setEditing(null); setEntryDraft(null); setModal("entry"); }} onRepeat={(item) => { setEditing(null); setEntryDraft({ merchant: item.merchant, amount: String(item.amount), category: item.category, type: item.type, date: month === monthKey() ? iso(new Date()) : month, note: "", tags: item.tags || [], needsReview: false }); setModal("entry"); }} onView={changeView} onCoach={() => plus ? setModal("coach") : setModal("pricing")} />;
  else if (view === "accounts") page = <AccountsPage accounts={accountBalances} transfers={transfers} currency={currency} hidden={privacy} locale={locale} onAdd={() => { setEditingAccount(null); setModal("account"); }} onEdit={(account) => { setEditingAccount(account); setModal("account"); }} onTransfer={() => { setEditingTransfer(null); setModal("transfer"); }} onEditTransfer={(transfer) => { setEditingTransfer(transfer); setModal("transfer"); }} onDeleteTransfer={deleteTransfer} onArchive={archiveAccount} />;
  else if (view === "transactions") page = <TransactionsPage items={monthTransactions} currency={currency} hidden={privacy} canImport={plan === "Lifetime"} locale={locale} onAdd={() => { setEditing(null); setEntryDraft(null); setModal("entry"); }} onEdit={(item) => { setEntryDraft(null); setEditing(item); setModal("entry"); }} onDelete={removeTransaction} onDeleteMany={removeMany} onImport={() => setModal(plan === "Lifetime" ? "statement" : "pricing")} />;
  else if (view === "calendar") page = <CalendarPage month={month} transactions={monthTransactions} recurring={recurring} goals={goals} metrics={metrics} currency={currency} hidden={privacy} locale={locale} onPost={postRecurring} />;
  else if (view === "plan") page = <PlanPage budget={budget} categoryBudgets={categoryBudgets} metrics={metrics} currency={currency} hidden={privacy} locale={locale} onBudgetSave={saveBudget} onCategorySave={saveCategory} onCopyPrevious={copyPrevious} />;
  else if (view === "recurring") page = <RecurringPage items={recurring} suggestions={recurringCandidates} currency={currency} hidden={privacy} canUse={plus} locale={locale} onAdd={() => setModal("recurring")} onAcceptSuggestion={createRecurring} onPost={postRecurring} onDelete={deleteRecurring} onUpgrade={() => setModal("pricing")} />;
  else if (view === "automation") page = <AutomationPage rules={automationRules} canUse={plus} locale={locale} onAddPreset={saveAutomationRule} onNew={() => { setEditingRule(null); setModal("automation"); }} onEdit={(rule) => { setEditingRule(rule); setModal("automation"); }} onToggle={toggleAutomationRule} onDelete={deleteAutomationRule} onUpgrade={() => setModal("pricing")} />;
  else if (view === "goals") page = <GoalsPage goals={goals} currency={currency} hidden={privacy} canAddMore={plus || goals.length === 0} locale={locale} onAdd={() => { setEditingGoal(null); setModal("goal"); }} onEdit={(goal) => { setEditingGoal(goal); setModal("goal"); }} onContribute={contribute} onArchive={archiveGoal} onUpgrade={() => setModal("pricing")} />;
  else if (view === "crypto") page = <CryptoPage holdings={cryptoHoldings} prices={cryptoPrices} history={cryptoHistory} period={cryptoPeriod} loading={cryptoLoading} currency={currency} hidden={privacy} plan={plan} locale={locale} onPeriod={setCryptoPeriod} onAdd={() => { setEditingCrypto(null); setModal("crypto"); }} onEdit={(holding) => { setEditingCrypto(holding); setModal("crypto"); }} onDelete={deleteCrypto} onUpgrade={() => setModal("pricing")} onRefresh={() => setCryptoRefresh((value) => value + 1)} />;
  else if (view === "analytics") page = <AnalyticsPage metrics={metrics} previousMetrics={previousMetrics} categoryBudgets={categoryBudgets} currency={currency} hidden={privacy} locale={locale} />;
  else page = <SettingsPage user={user} profileName={profileName} avatarUrl={avatarUrl} currency={currency} fallbackBudget={fallbackBudget} plan={plan} privacy={privacy} notificationsEnabled={notificationsEnabled} widgets={widgets} canExport={plus} transactions={transactions} budgets={budgets} categoryBudgets={categoryRows} goals={goals} recurring={recurring} cryptoHoldings={cryptoHoldings} isAdmin={isAdmin} onProfile={updateProfile} onAvatar={uploadAvatar} onCurrency={(value) => saveSettings({ currency: value })} onPrivacy={(value) => saveSettings({ privacy_mode: value })} onNotifications={(value) => saveSettings({ notifications_enabled: value })} onWidgets={(value) => saveSettings({ dashboard_widgets: value })} onPortal={billingPortal} onUpgrade={() => setModal("pricing")} onAdmin={() => setModal("admin")} onDeleteAccount={() => setModal("delete-account")} onRestoreBackup={() => setModal("restore-backup")} locale={locale} onLocale={onLocale} theme={theme} onTheme={onTheme} copy={copy.settings} nativeApp={nativeApp} />;

  if (loading) return <LoadingScreen locale={locale} />;
  return <div className={`tc-app${nativeApp ? " tc-native" : ""}`}><aside className="tc-side"><button className="tc-brand" onClick={onExit}><i><ArrowUpRight size={17} /></i> Trek</button><small>{copy.shell.personal}</small>{localizedNav.map(([id, label, Icon]) => <button key={id} className={`${view === id ? "on" : ""}${lockedView(id) ? " locked" : ""}`} onClick={() => changeView(id)}><Icon size={17} /> {label}{lockedView(id) ? " · Plus" : ""}</button>)}<div className="tc-side-bottom"><button onClick={() => setModal("pricing")}><CreditCard size={17} /> {plan} {copy.shell.plan}</button><button onClick={() => setView("settings")}><Settings size={17} /> {copy.shell.settings}</button>{!nativeApp && <button onClick={onExit}><ArrowLeft size={16} /> {copy.shell.back}</button>}<button onClick={onSignOut}><LogOut size={17} /> {copy.shell.signout}</button></div></aside>
    <main className="tc-main"><header className="tc-top"><div className="tc-mobile-brand"><button onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Menu size={19} /></button><span className="tc-mobile-mark" aria-hidden="true"><ArrowUpRight size={16} /></span><b>Trek</b></div><div className="tn-top-center">{!["settings", "crypto", "accounts"].includes(view) && <MonthControl value={month} onChange={setMonth} locale={locale} />}</div><div className="tc-top-actions"><ThemeToggle theme={theme} onChange={onTheme} locale={locale} /><button className="tn-notification-button" onClick={() => setNotice(!notice)} aria-label={`Open notifications${notificationItems.length ? `, ${notificationItems.length} unread` : ""}`}><Bell size={18} />{notificationItems.length > 0 && <i>{notificationItems.length}</i>}</button><button onClick={() => setPrivacy(!privacy)} title="Temporarily hide amounts" aria-label={privacy ? "Show amounts" : "Hide amounts"}>{privacy ? <Eye size={17} /> : <EyeOff size={17} />}</button>{avatarUrl ? <img className="tc-top-avatar" src={avatarUrl} alt="Profile" /> : <span>{profileName.charAt(0).toUpperCase()}</span>}</div>{notice && <NotificationCenter items={notificationItems} currency={currency} hidden={privacy} copy={copy.notices} onPost={postRecurring} onSelect={(nextView) => { setView(nextView); setNotice(false); }} />}</header>{!online && <div className="tn-offline" role="status"><WifiOff size={15} /><span>{copy.shell.offline}</span></div>}{dataError && <div className="tn-error"><AlertTriangle size={16} /> <span>{dataError}</span><button onClick={() => setDataError("")}><X size={15} /></button></div>}{page}</main>
    {nativeApp && <nav className="tm-bottom-nav" aria-label="Main navigation"><button className={view === "overview" ? "on" : ""} onClick={() => changeView("overview")}><LayoutDashboard size={20} /><span>{copy.nav[0]}</span></button><button className={view === "transactions" ? "on" : ""} onClick={() => changeView("transactions")}><ReceiptText size={20} /><span>{copy.shell.activity}</span></button><button className="tm-add" onClick={() => { setEditing(null); setEntryDraft(null); setModal("entry"); }} aria-label="Add transaction"><Plus size={25} /></button><button className={view === "plan" ? "on" : ""} onClick={() => changeView("plan")}><CalendarDays size={20} /><span>{copy.shell.shortPlan}</span></button><button className={mobileNav || ["accounts", "calendar", "recurring", "automation", "goals", "crypto", "analytics", "settings"].includes(view) ? "on" : ""} onClick={() => setMobileNav((current) => !current)}><Menu size={20} /><span>{copy.shell.more}</span></button></nav>}
    {mobileNav && <MobileMoreScreen user={user} locale={locale} localizedNav={localizedNav} view={view} profileName={profileName} avatarUrl={avatarUrl} plan={plan} lockedView={lockedView} copy={copy.shell} onSelect={(id) => { changeView(id); setMobileNav(false); }} onPlans={() => { setModal("pricing"); setMobileNav(false); }} onSettings={() => { setView("settings"); setMobileNav(false); }} onSignOut={onSignOut} onClose={() => setMobileNav(false)} />}
    {modal === "entry" && <EntryModal initial={editing ? { ...editing, amount: String(editing.amount), tags: editing.tags || [] } : entryDraft} isEditing={Boolean(editing?.id)} month={month} categoryRules={merchantRules} accounts={accounts} copy={copy.entry} locale={locale} onClose={() => { setModal(null); setEntryDraft(null); }} onSave={saveTransaction} onScan={scanReceipt} />}
    {modal === "account" && <AccountModal currency={currency} initial={editingAccount} locale={locale} onClose={() => { setEditingAccount(null); setModal(null); }} onSave={createAccount} />}
    {modal === "transfer" && <TransferModal accounts={accounts} currency={currency} initial={editingTransfer} locale={locale} onClose={() => { setEditingTransfer(null); setModal(null); }} onSave={saveTransfer} />}
    {modal === "goal" && <GoalModal initial={editingGoal} locale={locale} onClose={() => { setEditingGoal(null); setModal(null); }} onSave={createGoal} />}
    {modal === "recurring" && <RecurringModal locale={locale} onClose={() => setModal(null)} onSave={createRecurring} />}
    {modal === "automation" && <AutomationModal initial={editingRule} locale={locale} onClose={() => { setEditingRule(null); setModal(null); }} onSave={saveAutomationRule} />}
    {modal === "coach" && <CoachModal locale={locale} onClose={() => setModal(null)} onAsk={askCoach} />}
    {modal === "statement" && <StatementImportModal currency={currency} locale={locale} onClose={() => setModal(null)} onAnalyze={analyzeStatement} onConfirm={confirmStatement} />}
    {modal === "crypto" && <CryptoModal currency={currency} initial={editingCrypto} locale={locale} onClose={() => { setEditingCrypto(null); setModal(null); }} onSave={saveCrypto} />}
    {modal === "pricing" && <PricingModal plan={plan} user={user} locale={locale} onClose={() => setModal(null)} onCheckout={checkout} nativeApp={nativeApp} />}
    {modal === "admin" && <AdminModal onClose={() => setModal(null)} onLookup={lookupAdminUser} onGrant={grantMembership} locale={locale} />}
    {modal === "delete-account" && <DeleteAccountModal locale={locale} onClose={() => setModal(null)} onDelete={deleteAccount} />}
    {modal === "restore-backup" && <RestoreBackupModal onClose={() => setModal(null)} onRestore={restoreBackup} />}
    {!onboardingCompleted && <OnboardingModal locale={locale} initialName={profileName} initialCurrency={currency} initialBudget={fallbackBudget || 3000} onComplete={completeOnboarding} />}
    {toast && createPortal(<Toast toast={toast} onClose={() => setToast(null)} />, document.body)}
  </div>;
}
