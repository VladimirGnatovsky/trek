import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowLeft, ArrowUpRight, Banknote, BarChart3, Bell, Bitcoin, Camera, CalendarClock, CalendarDays, Check, ChevronLeft,
  ChevronRight, CircleDollarSign, Coffee, CreditCard, Download, Eye, EyeOff,
  FileText, FileUp, HeartPulse, Home, LayoutDashboard, LoaderCircle, LogOut, Menu, Music2, Pencil,
  Plus, ReceiptText, RefreshCw, Search, Settings, ShoppingBag, Sparkles, Target,
  Trash2, Upload, UserRound, Wallet, X, Car,
} from "lucide-react";
import "./cabinet.css";
import "./cabinet-extra.css";
import "./profile.css";
import "./coach.css";
import "./cabinet-next.css";
import { supabase } from "./supabase.js";
import { CryptoModal, CryptoPage } from "./crypto.jsx";

const CATEGORIES = ["Groceries", "Transport", "Subscriptions", "Coffee", "Shopping", "Housing", "Health", "Fun", "Other"];
const COLORS = ["#00e5a0", "#59a9ff", "#ffcc66", "#ff795e", "#b883ff", "#35d0ba", "#f58ac5", "#9aa7ff", "#aab5af"];
const SYMBOLS = { UAH: "₴", PLN: "zł", EUR: "€", USD: "$" };
const ICONS = { Groceries: ShoppingBag, Transport: Car, Subscriptions: Music2, Coffee, Shopping: ShoppingBag, Housing: Home, Health: HeartPulse, Fun: Sparkles, Other: CircleDollarSign };
const NAV = [
  ["overview", "Overview", LayoutDashboard], ["transactions", "Transactions", ReceiptText],
  ["plan", "Monthly plan", CalendarDays], ["recurring", "Recurring", CalendarClock],
  ["goals", "Goals", Target], ["crypto", "Crypto", Bitcoin], ["analytics", "Analytics", BarChart3],
];

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
const monthLabel = (key) => localDate(key).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const inMonth = (item, key) => item.date >= key && item.date <= monthEnd(key);
const money = (value, currency, hidden = false) => hidden
  ? "*****"
  : `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0)} ${SYMBOLS[currency] || currency}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const apiUrl = (path) => {
  const configured = window.__TREK_ENV__?.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL;
  const nativeOrigin = window.location.protocol === "capacitor:" ? "https://trekapp.up.railway.app" : "";
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

function calculateMetrics(items, budget, selectedMonth, recurring = []) {
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
      label: date.toLocaleDateString("en-US", { weekday: "narrow" }),
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

function MonthControl({ value, onChange }) {
  const current = monthKey();
  return <div className="tn-month-control" aria-label="Selected month">
    <button onClick={() => onChange(shiftMonth(value, -1))} aria-label="Previous month"><ChevronLeft size={17} /></button>
    <strong>{monthLabel(value)}</strong>
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

function Bars({ values, currency, hidden }) {
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
      <small>{selected.key ? localDate(selected.key).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : selected.label}</small>
      <strong>{money(selected.amount, currency, hidden)}</strong>
    </output>}
    {values.map((item, index) => <button type="button" className={`tc-bar${index === active ? " selected" : ""}`} key={item.key || item.label} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)} aria-label={`${item.label}: ${money(item.amount, currency, hidden)}`}>
      <i className={index === values.length - 1 ? "active" : ""} style={{ height: `${Math.max(5, item.amount / max * 100)}%` }} />
      <small>{item.label}</small>
    </button>)}
  </div>;
}

function Donut({ rows, total, currency, hidden }) {
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
      <span><b>{selected?.category || "Total"}</b><small>{money(selected?.amount ?? total, currency, hidden)}</small></span>
    </div>
    <div className="tn-donut-legend">
      {rows.slice(0, 5).map((row, index) => <button type="button" className={index === active ? "active" : ""} key={row.category} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)}>
        <i style={{ background: COLORS[index % COLORS.length] }} />{row.category}
      </button>)}
    </div>
  </div>;
}

function Overview({ transactions, metrics, budget, goals, currency, hidden, categoryBudgets, widgets, onAdd, onView, onCoach }) {
  const primaryGoal = goals.find((goal) => goal.status === "active");
  const planned = Object.values(categoryBudgets).reduce((sum, value) => sum + Number(value || 0), 0);
  return <>
    <section className="tc-hero">
      <div><span>SAFE TO SPEND · DAY {metrics.elapsedDays}</span><h2>{money(metrics.safeToSpend, currency, hidden)}</h2><p><i /> {money(metrics.upcoming, currency, hidden)} reserved for upcoming bills</p></div>
      <Score value={metrics.score} />
      <button className="tc-action" onClick={onAdd}><Plus size={17} /> Add transaction</button>
    </section>
    <div className="tc-kpis">
      <div><span>SPENT</span><b>{money(metrics.spending, currency, hidden)}</b><small>of {money(budget, currency, hidden)} budget</small></div>
      <div><span>MONTH-END FORECAST</span><b>{money(metrics.forecast, currency, hidden)}</b><small>{metrics.forecast > budget ? "above" : "within"} current plan</small></div>
      <div><span>INCOME</span><b>{money(metrics.earned, currency, hidden)}</b><small>logged this month</small></div>
      <div><span>PLANNED</span><b>{money(planned, currency, hidden)}</b><small>across category envelopes</small></div>
    </div>
    <div className="tc-grid">
      {widgets.includes("pace") && <section className="tc-panel tc-spend"><header><div><span>LAST 7 DAYS</span><h3>Daily spending rhythm</h3></div><button onClick={() => onView("analytics")}>View analytics <ChevronRight size={14} /></button></header><Bars values={metrics.dailySeries} currency={currency} hidden={hidden} /></section>}
      {widgets.includes("signal") && <section className="tc-panel tc-signal"><span className="tc-signal-icon"><Sparkles size={20} /></span><span>TREK SIGNAL</span><h3>{metrics.forecast > budget ? "Your current pace is above plan" : "Your current pace is inside plan"}</h3><p>{metrics.forecast > budget ? `Reduce the remaining daily pace by ${money((metrics.forecast - budget) / Math.max(1, metrics.daysInMonth - metrics.elapsedDays), currency, hidden)}.` : `At this pace, ${money(Math.max(0, budget - metrics.forecast), currency, hidden)} should remain at month end.`}</p><div className="tc-signal-actions"><button onClick={() => onView("plan")}>Review plan <ChevronRight size={14} /></button><button onClick={onCoach}>Ask the coach <Sparkles size={14} /></button></div></section>}
      {widgets.includes("transactions") && <section className="tc-panel tc-list"><header><div><span>RECENT TRANSACTIONS</span><h3>{transactions.length ? "Latest activity" : "No activity yet"}</h3></div><button onClick={() => onView("transactions")}>All transactions <ChevronRight size={14} /></button></header>{transactions.slice(0, 4).map((item) => <TransactionRow key={item.id} item={item} currency={currency} hidden={hidden} />)}</section>}
      {widgets.includes("goals") && <section className="tc-panel tc-goal"><span className="tc-goal-big"><Target size={21} /></span><span>TOP GOAL</span>{primaryGoal ? <><h3>{primaryGoal.name}</h3><div className="tc-progress"><i style={{ width: `${clamp(primaryGoal.saved / primaryGoal.target * 100, 0, 100)}%` }} /></div><p><b>{money(primaryGoal.saved, currency, hidden)}</b> of {money(primaryGoal.target, currency, hidden)} <em>{Math.round(primaryGoal.saved / primaryGoal.target * 100)}%</em></p></> : <><h3>Create your first goal</h3><p>Give your monthly plan a direction.</p></>}<button onClick={() => onView("goals")}>Open goals <ChevronRight size={14} /></button></section>}
    </div>
  </>;
}

function TransactionRow({ item, currency, hidden, checked, onCheck, onEdit, onDelete }) {
  return <div className="tc-transaction">
    {onCheck && <input type="checkbox" checked={checked} onChange={() => onCheck(item.id)} aria-label={`Select ${item.merchant}`} />}
    <span className="tc-txn-icon" style={{ background: `${item.color}20`, color: item.color }}><CategoryIcon category={item.category} /></span>
    <div><b>{item.merchant}</b><small>{item.type === "income" ? "Income" : item.category} · {item.date}{item.note ? ` · ${item.note}` : ""}</small></div>
    <em className={item.type === "income" ? "tc-income" : ""}>{item.type === "income" ? "+" : "−"} {money(item.amount, currency, hidden)}</em>
    {item.needsReview && <AlertTriangle size={15} className="tn-review" aria-label="Needs review" />}
    {onEdit && <button onClick={() => onEdit(item)} aria-label="Edit transaction"><Pencil size={14} /></button>}
    {onDelete && <button onClick={() => onDelete(item.id)} aria-label="Delete transaction"><Trash2 size={14} /></button>}
  </div>;
}

function TransactionsPage({ items, currency, hidden, canImport, onAdd, onEdit, onDelete, onDeleteMany, onImport }) {
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
    <div className="tc-page-head"><div><span>YOUR RECORDS</span><h2>Transactions</h2><p>{filtered.length} visible entries · edit, filter or review your records.</p></div><button className="tc-action" onClick={onAdd}><Plus size={17} /> Add transaction</button></div>
    <section className="tc-panel tn-toolbar">
      <label className="tn-search"><Search size={16} /><input placeholder="Search merchant, note or tag" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option>All</option><option value="expense">Expenses</option><option value="income">Income</option></select>
      <button onClick={onImport}><FileUp size={16} /> Import statement{!canImport && " · Lifetime"}</button>
      {selected.size > 0 && <button className="tn-danger" onClick={async () => { await onDeleteMany([...selected]); setSelected(new Set()); }}><Trash2 size={15} /> Delete {selected.size}</button>}
    </section>
    <section className="tc-panel tn-transaction-table">{filtered.length ? filtered.map((item) => <TransactionRow key={item.id} item={item} currency={currency} hidden={hidden} checked={selected.has(item.id)} onCheck={toggle} onEdit={onEdit} onDelete={onDelete} />) : <Empty icon={ReceiptText} title="No matching transactions" copy="Change the filters or log a new entry." />}</section>
  </section>;
}

function PlanPage({ budget, categoryBudgets, metrics, currency, hidden, onBudgetSave, onCategorySave, onCopyPrevious }) {
  const [total, setTotal] = useState(String(budget));
  useEffect(() => setTotal(String(budget)), [budget]);
  const planned = Object.values(categoryBudgets).reduce((sum, value) => sum + Number(value || 0), 0);
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>YOUR SPENDING PLAN</span><h2>Monthly plan</h2><p>Assign a job to your money and compare the plan with actual spending.</p></div><button className="tc-action tn-secondary" onClick={onCopyPrevious}><RefreshCw size={16} /> Copy previous month</button></div>
    <section className="tc-plan-total"><div><span>MONTHLY BUDGET</span><div className="tn-budget-edit"><input inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} /><button onClick={() => onBudgetSave(Number(total.replace(",", ".")) || 0)}>Save</button></div><p>{money(metrics.spending, currency, hidden)} spent · {money(metrics.remaining, currency, hidden)} remaining</p></div><div className="tn-plan-summary"><b>{money(planned, currency, hidden)}</b><small>assigned to categories</small></div></section>
    <section className="tc-panel tc-budget-list"><header><span>CATEGORY ENVELOPES</span><span>{money(Math.max(0, budget - planned), currency, hidden)} unassigned</span></header>{CATEGORIES.map((category, index) => {
      const spent = metrics.byCategory.find((item) => item.category === category)?.amount || 0;
      const amount = Number(categoryBudgets[category] || 0);
      return <div className="tc-budget-row tn-budget-row" key={category}><div><CategoryIcon category={category} /><b>{category}</b><small>{money(spent, currency, hidden)} spent</small></div><div><span><i style={{ width: `${clamp(spent / Math.max(amount, 1) * 100, 0, 100)}%`, background: spent > amount && amount > 0 ? "#ff795e" : COLORS[index] }} /></span><input inputMode="decimal" value={categoryBudgets[category] ?? ""} placeholder="0" onChange={(event) => onCategorySave(category, event.target.value, false)} onBlur={(event) => onCategorySave(category, event.target.value, true)} /></div></div>;
    })}</section>
  </section>;
}

function RecurringPage({ items, currency, hidden, canUse, onAdd, onPost, onDelete, onUpgrade }) {
  const expenses = items.filter((item) => item.type !== "income" && item.active);
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>WHAT IS COMING</span><h2>Recurring</h2><p>Plan around subscriptions, bills and regular income.</p></div><button className="tc-action" onClick={canUse ? onAdd : onUpgrade}><Plus size={17} /> {canUse ? "Add recurring" : "Unlock with Plus"}</button></div>
    <div className="tc-kpis"><div><span>MONTHLY COMMITMENTS</span><b>{money(total, currency, hidden)}</b><small>active recurring expenses</small></div><div><span>ACTIVE ITEMS</span><b>{items.filter((item) => item.active).length}</b><small>bills and income</small></div><div><span>ANNUALIZED</span><b>{money(total * 12, currency, hidden)}</b><small>estimated recurring spend</small></div></div>
    <section className="tc-panel tn-recurring-list">{items.length ? items.sort((a, b) => a.day - b.day).map((item) => <article key={item.id}><time>{item.day}</time><span className="tc-txn-icon"><CategoryIcon category={item.category} /></span><div><b>{item.merchant}</b><small>{item.category} · every month</small></div><strong>{item.type === "income" ? "+" : "−"} {money(item.amount, currency, hidden)}</strong><button onClick={() => onPost(item)} title="Post this month"><Check size={16} /></button><button onClick={() => onDelete(item.id)} title="Delete"><Trash2 size={15} /></button></article>) : <Empty icon={CalendarClock} title="No recurring items yet" copy="Add rent, subscriptions, salary or other repeating entries." />}</section>
  </section>;
}

function GoalsPage({ goals, currency, hidden, canAddMore, onAdd, onContribute, onArchive, onUpgrade }) {
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>MAKE ROOM FOR WHAT MATTERS</span><h2>Goals</h2><p>Track several goals and see the monthly contribution needed to stay on time.</p></div><button className="tc-action" onClick={canAddMore ? onAdd : onUpgrade}><Plus size={17} /> {canAddMore ? "New goal" : "More goals · Plus"}</button></div>
    <div className="tn-goals-grid">{goals.length ? goals.map((goal) => {
      const pct = clamp(goal.saved / goal.target * 100, 0, 100);
      const deadline = goal.deadline ? localDate(goal.deadline) : null;
      const months = deadline ? Math.max(1, (deadline.getFullYear() - new Date().getFullYear()) * 12 + deadline.getMonth() - new Date().getMonth()) : null;
      return <section className="tc-panel tn-goal-card" key={goal.id}><header><span style={{ color: goal.color }}>{goal.icon || "Target"}</span><button onClick={() => onArchive(goal.id)}><Trash2 size={14} /></button></header><h3>{goal.name}</h3><p>{goal.deadline ? `Target date ${localDate(goal.deadline).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : "No deadline"}</p><div className="tc-progress"><i style={{ width: `${pct}%`, background: goal.color }} /></div><div className="tn-goal-values"><b>{money(goal.saved, currency, hidden)}</b><span>of {money(goal.target, currency, hidden)} · {Math.round(pct)}%</span></div>{months && goal.saved < goal.target && <small>{money((goal.target - goal.saved) / months, currency, hidden)} per month to stay on track</small>}<form onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.amount; onContribute(goal, Number(input.value.replace(",", "."))); input.value = ""; }}><input name="amount" inputMode="decimal" placeholder="Contribution" /><button className="tc-action">Add</button></form></section>;
    }) : <section className="tc-panel"><Empty icon={Target} title="No goals yet" copy="Create a savings goal and Trek will calculate the required pace." /></section>}</div>
  </section>;
}

function AnalyticsPage({ metrics, previousMetrics, categoryBudgets, currency, hidden }) {
  const comparison = previousMetrics.spending ? (metrics.spending - previousMetrics.spending) / previousMetrics.spending * 100 : 0;
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>THE BIGGER PICTURE</span><h2>Analytics</h2><p>Every chart is calculated from the selected month’s records.</p></div></div>
    <div className="tc-kpis"><div><span>MONTH VS PREVIOUS</span><b>{comparison > 0 ? "+" : ""}{Math.round(comparison)}%</b><small>{comparison > 0 ? "more" : "less"} spending</small></div><div><span>SAVINGS RATE</span><b>{metrics.earned > 0 ? Math.round((metrics.earned - metrics.spending) / metrics.earned * 100) : 0}%</b><small>income minus expenses</small></div><div><span>NO-SPEND DAYS</span><b>{metrics.dailySeries.filter((item) => item.amount === 0).length}</b><small>within the last 7 days</small></div></div>
    <div className="tc-grid analytics"><section className="tc-panel tc-spend"><header><div><span>DAILY RHYTHM</span><h3>{money(metrics.daily, currency, hidden)} average</h3></div></header><Bars values={metrics.dailySeries} currency={currency} hidden={hidden} /></section><section className="tc-panel tn-donut-panel"><span>WHERE IT WENT</span><Donut rows={metrics.byCategory} total={metrics.spending} currency={currency} hidden={hidden} /><h3>{money(metrics.spending, currency, hidden)}</h3></section>
      <section className="tc-panel tc-breakdown"><header><span>BUDGET VS ACTUAL</span></header>{metrics.byCategory.length ? metrics.byCategory.map((row, index) => { const planned = Number(categoryBudgets[row.category] || 0); return <div key={row.category}><p><span><CategoryIcon category={row.category} /> {row.category}</span><b>{money(row.amount, currency, hidden)} / {money(planned, currency, hidden)}</b></p><i><em style={{ width: `${clamp(row.amount / Math.max(planned, row.amount, 1) * 100, 0, 100)}%`, background: row.amount > planned && planned > 0 ? "#ff795e" : COLORS[index] }} /></i></div>; }) : <Empty icon={BarChart3} title="No analytics yet" copy="Add transactions to reveal your spending pattern." />}</section>
    </div>
  </section>;
}

function Empty({ icon: Icon, title, copy }) { return <div className="tc-empty"><span className="tc-empty-icon"><Icon size={21} /></span><div className="tc-empty-copy"><b>{title}</b><span>{copy}</span></div></div>; }

function OnboardingModal({ initialName, initialCurrency, initialBudget, onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: initialName, currency: initialCurrency, budget: String(initialBudget || 3000), income: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const advance = () => {
    if (step === 0 && !form.name.trim()) return setError("Add the name you want Trek to use.");
    if (step === 1 && !(Number(String(form.budget).replace(",", ".")) > 0)) return setError("Add a monthly budget greater than zero.");
    setError(""); setStep((current) => Math.min(2, current + 1));
  };
  return <Modal onClose={() => {}} locked><div className="tn-onboarding-progress"><i style={{ width: `${(step + 1) / 3 * 100}%` }} /></div><span className="tc-kicker">WELCOME TO TREK · {step + 1}/3</span>
    {step === 0 && <><h2>Make it your money space.</h2><p className="tc-modal-copy">A few details are enough to make every forecast useful from day one.</p><div className="tc-form"><label>Your name<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label></div></>}
    {step === 1 && <><h2>Set your monthly baseline.</h2><p className="tc-modal-copy">Choose the currency you normally plan in and a realistic monthly spending limit.</p><div className="tc-form"><label>Currency<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>{["EUR","USD","PLN","UAH"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Monthly budget<input autoFocus inputMode="decimal" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /></label></div></>}
    {step === 2 && <><h2>Add an opening income.</h2><p className="tc-modal-copy">Optional. Add this month’s income now, or leave the field empty and record it later.</p><div className="tc-form"><label>Income this month<input autoFocus inputMode="decimal" placeholder="Optional" value={form.income} onChange={(event) => setForm({ ...form, income: event.target.value })} /></label></div></>}
    {error && <p className="tc-form-error">{error}</p>}<div className="tn-onboarding-actions">{step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}<button className="tc-action" disabled={busy} onClick={async () => { if (step < 2) return advance(); setBusy(true); setError(""); try { await onComplete({ ...form, budget: Number(String(form.budget).replace(",", ".")), income: Number(String(form.income).replace(",", ".")) || 0 }); } catch (completeError) { setError(completeError.message || "Setup could not be saved."); setBusy(false); } }}>{step < 2 ? "Continue" : busy ? "Preparing your dashboard…" : "Open my dashboard"}</button></div>
  </Modal>;
}

function NotificationCenter({ items, currency, hidden, onSelect, onPost }) {
  return <div className="tc-notice tn-notification-center" role="dialog" aria-label="Notifications"><header><div><b>Notifications</b><small>{items.length ? `${items.length} item${items.length === 1 ? "" : "s"} need attention` : "Everything looks calm"}</small></div><Bell size={17} /></header>{items.length ? <div className="tn-notification-list">{items.map((item) => { const Icon = item.icon; return <article key={item.id}><span className={item.tone || ""}><Icon size={16} /></span><div><b>{item.title}</b><p>{item.copy}</p></div>{item.recurring ? <button onClick={() => onPost(item.recurring)}>Post</button> : <button onClick={() => onSelect(item.view)}><ChevronRight size={15} /></button>}</article>; })}</div> : <div className="tn-notification-empty"><Check size={18} /><span>No overdue bills or budget warnings.</span></div>}<footer>Amounts shown in {currency}{hidden ? " · privacy mode is on" : ""}</footer></div>;
}

function Toast({ toast, onClose }) {
  useEffect(() => { const timer = window.setTimeout(onClose, toast.action ? 6500 : 3500); return () => window.clearTimeout(timer); }, [toast, onClose]);
  return <div className="tn-toast" role="status"><Check size={16} /><span>{toast.message}</span>{toast.action && <button onClick={toast.action}>{toast.actionLabel || "Undo"}</button>}<button onClick={onClose} aria-label="Dismiss"><X size={14} /></button></div>;
}

function EntryModal({ initial, month, onClose, onSave, onScan }) {
  const [form, setForm] = useState(initial || { merchant: "", amount: "", category: CATEGORIES[0], type: "expense", date: monthKey() === month ? iso(new Date()) : month, note: "", tags: "", needsReview: false });
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const receiptRef = useRef(null);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <Modal onClose={onClose}><span className="tc-kicker">{initial ? "EDIT TRANSACTION" : "NEW TRANSACTION"}</span><h2>{initial ? "Update entry" : "Log an entry"}</h2><form className="tc-form tn-form-grid" onSubmit={async (event) => { event.preventDefault(); const amount = Number(String(form.amount).replace(",", ".")); if (!form.merchant.trim() || amount <= 0) return; setBusy(true); const ok = await onSave({ ...form, amount, tags: typeof form.tags === "string" ? form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : form.tags }); setBusy(false); if (ok) onClose(); }}>
    {!initial && <div className="tn-receipt-scan tn-span-2"><button type="button" disabled={scanning} onClick={() => receiptRef.current?.click()}>{scanning ? <LoaderCircle className="tn-spin" size={18} /> : <Camera size={18} />}<span><b>{scanning ? "Reading receipt…" : "Scan a receipt"}</b><small>Take a photo or choose one from your library</small></span></button><input ref={receiptRef} hidden type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setScanning(true); setScanMessage(""); try { const parsed = await onScan(file); setForm((current) => ({ ...current, type: "expense", merchant: parsed.merchant || current.merchant, amount: parsed.amount ? String(parsed.amount) : current.amount, date: parsed.date || current.date, category: CATEGORIES.includes(parsed.category) ? parsed.category : current.category, note: parsed.note || current.note, tags: "receipt", needsReview: parsed.confidence !== "high", originalAmount: parsed.originalAmount, originalCurrency: parsed.originalCurrency, exchangeRate: parsed.exchangeRate, exchangeRateDate: parsed.exchangeRateDate })); const conversion = parsed.originalCurrency && parsed.currency && parsed.originalCurrency !== parsed.currency ? ` Converted ${parsed.originalAmount} ${parsed.originalCurrency} to ${parsed.amount} ${parsed.currency} using the official rate.` : ""; setScanMessage(`Receipt read.${conversion} Check the details before saving.`); } catch (error) { setScanMessage(error.message || "The receipt could not be read."); } finally { setScanning(false); } }} />{scanMessage && <p>{scanMessage}</p>}</div>}
    <label>Type<select value={form.type} onChange={(event) => set("type", event.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></label>
    <label>Merchant or source<input autoFocus value={form.merchant} onChange={(event) => set("merchant", event.target.value)} /></label>
    <label>Amount<input inputMode="decimal" value={form.amount} onChange={(event) => set("amount", event.target.value)} /></label>
    <label>Date<input className="tn-date-input" type="date" value={form.date} onChange={(event) => set("date", event.target.value)} /></label>
    {form.type === "expense" && <label>Category<select value={form.category} onChange={(event) => set("category", event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>}
    <label>Tags<input placeholder="work, travel" value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags} onChange={(event) => set("tags", event.target.value)} /></label>
    <label className="tn-span-2">Note<input placeholder="Optional context" value={form.note || ""} onChange={(event) => set("note", event.target.value)} /></label>
    <label className="tn-check tn-span-2"><input type="checkbox" checked={form.needsReview || false} onChange={(event) => set("needsReview", event.target.checked)} /> Mark as needing review</label>
    <button className="tc-action tn-span-2" disabled={busy}>{busy ? "Saving…" : "Save transaction"}</button>
  </form></Modal>;
}

function GoalModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", target: "", deadline: "", icon: "Target", color: COLORS[0] });
  return <Modal onClose={onClose}><span className="tc-kicker">NEW GOAL</span><h2>Give your money direction.</h2><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (form.name && Number(form.target) > 0 && await onSave(form)) onClose(); }}><label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Emergency fund" /></label><label>Target amount<input inputMode="decimal" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} /></label><label>Target date<input className="tn-date-input" type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></label><label>Color<input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label><button className="tc-action">Create goal</button></form></Modal>;
}

function RecurringModal({ onClose, onSave }) {
  const [form, setForm] = useState({ merchant: "", amount: "", category: "Subscriptions", type: "expense", day: new Date().getDate() });
  return <Modal onClose={onClose}><span className="tc-kicker">RECURRING ITEM</span><h2>Plan what repeats.</h2><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (form.merchant && Number(form.amount) > 0 && await onSave(form)) onClose(); }}><label>Type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Merchant or source<input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} /></label><label>Amount<input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label><label>Category<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>Day of month<input type="number" min="1" max="31" value={form.day} onChange={(event) => setForm({ ...form, day: event.target.value })} /></label><button className="tc-action">Save recurring item</button></form></Modal>;
}

function CoachModal({ onClose, onAsk }) {
  const prompts = ["What should I change this month?", "Which category needs attention?", "Can I safely increase my savings goal?"];
  const [question, setQuestion] = useState(prompts[0]); const [answer, setAnswer] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <Modal onClose={onClose} wide><span className="tc-kicker">TREK COACH · AI</span><h2>Ask about your money pace.</h2><div className="tn-prompt-chips">{prompts.map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); setAnswer(""); try { setAnswer(await onAsk(question)); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }}><label>Your question<textarea maxLength="600" value={question} onChange={(event) => setQuestion(event.target.value)} /></label><button className="tc-action" disabled={busy}><Sparkles size={16} /> {busy ? "Thinking…" : "Ask the coach"}</button></form>{error && <p className="tc-form-error">{error}</p>}{answer && <article className="tc-coach-answer">{answer}</article>}</Modal>;
}

const fileAsBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("The statement file could not be read."));
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.readAsDataURL(file);
});

function StatementImportModal({ currency, onClose, onAnalyze, onConfirm }) {
  const [file, setFile] = useState(null); const [statement, setStatement] = useState(null);
  const [selected, setSelected] = useState(new Set()); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const analyze = async () => {
    if (!file) return setError("Choose a CSV or PDF bank statement.");
    if (file.size > 8 * 1024 * 1024) return setError("Choose a statement under 8 MB.");
    setBusy(true); setError("");
    try { const next = await onAnalyze(file); setStatement(next); setSelected(new Set(next.transactions.map((_, index) => index))); }
    catch (requestError) { setError(requestError.message || "The statement could not be analyzed."); }
    finally { setBusy(false); }
  };
  const updateRow = (index, change) => setStatement((current) => ({ ...current, transactions: current.transactions.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row) }));
  return <Modal onClose={onClose} wide><span className="tc-kicker">LIFETIME · SMART IMPORT</span><h2>Import a bank statement.</h2><p className="tc-modal-copy">Upload CSV or PDF, review the detected categories, then add the selected rows. Foreign amounts use the official NBU rate for each transaction date.</p>
    {!statement ? <div className="tn-import-start"><label><FileText size={22} /><span><b>{file?.name || "Choose a statement"}</b><small>CSV or PDF · up to 8 MB</small></span><input type="file" accept=".csv,.pdf,text/csv,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); setError(""); }} /></label><button className="tc-action" disabled={busy || !file} onClick={analyze}>{busy ? <LoaderCircle className="tn-spin" size={17} /> : <Banknote size={17} />} {busy ? "Analyzing…" : "Analyze statement"}</button><small className="tn-import-privacy">CSV is parsed deterministically. PDF content is processed by the configured Gemini service to extract transaction rows.</small></div>
      : <><div className="tn-import-summary"><div><b>{statement.transactions.length}</b><span>transactions found</span></div><div><b>{statement.months.map((item) => monthLabel(item)).join(", ")}</b><span>detected period</span></div><div><b>{currency}</b><span>converted currency</span></div></div><div className="tn-import-table"><header><span /><span>Date and merchant</span><span>Category</span><span>Original</span><span>Import amount</span></header>{statement.transactions.map((row, index) => <div key={row.importHash}><input type="checkbox" checked={selected.has(index)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} /><span><b>{row.merchant}</b><small>{row.date} · {row.type}</small></span><select value={row.category} disabled={row.type === "income"} onChange={(event) => updateRow(index, { category: event.target.value })}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><span>{row.originalAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })} {row.originalCurrency}</span><strong>{money(row.amount, currency)}</strong></div>)}</div><div className="tn-import-actions"><button onClick={() => { setStatement(null); setFile(null); }}>Choose another file</button><button className="tc-action" disabled={busy || selected.size === 0} onClick={async () => { setBusy(true); setError(""); try { await onConfirm(statement.transactions.filter((_, index) => selected.has(index)), statement.fileName, statement.months); onClose(); } catch (requestError) { setError(requestError.message || "The transactions could not be saved."); setBusy(false); } }}>{busy ? "Importing…" : `Import ${selected.size} selected`}</button></div></>}
    {error && <p className="tc-form-error">{error}</p>}
  </Modal>;
}

function PricingModal({ plan, user, onClose, onCheckout, nativeApp = false }) {
  const choices = [
    ["Start", "Free", ["Manual tracking", "Receipt recognition", "One goal", "Basic monthly plan", "Two crypto positions"]],
    ["Plus", "€6 / month", ["Recurring calendar", "Unlimited goals", "Data export", "Advanced analytics", "Trek Coach", "Unlimited crypto portfolio"]],
    ["Lifetime", "€149 once", ["Every Plus feature", "CSV and PDF bank import", "Historical NBU conversion", "Crypto portfolio backup", "Lifetime access"]],
  ];
  return <Modal onClose={onClose} wide><span className="tc-kicker">MEMBERSHIP</span><h2>Choose your Trek mode.</h2><p className="tc-modal-copy">{nativeApp ? "Your existing Trek membership syncs automatically across web and mobile. Purchases are not offered inside the iOS app." : "Start with the essentials, or unlock deeper planning, automation and coaching."}</p><div className="tc-prices">{choices.map(([name, price, features]) => <article key={name} className={plan === name ? "selected" : ""}><span>{name}</span><h3>{price}</h3><ul>{features.map((feature) => <li key={feature}><Check size={15} /> {feature}</li>)}</ul><button disabled={nativeApp || plan === name || name === "Start"} onClick={() => onCheckout(name, user)}>{plan === name ? "Current plan" : nativeApp ? "Synced from your account" : name === "Start" ? "Included" : "Continue to payment"}</button></article>)}</div></Modal>;
}

function SettingsPage({ user, profileName, avatarUrl, currency, plan, privacy, notificationsEnabled, widgets, canExport, transactions, goals, recurring, cryptoHoldings, onProfile, onAvatar, onCurrency, onPrivacy, onNotifications, onWidgets, onPortal, onUpgrade, nativeApp = false }) {
  const [name, setName] = useState(profileName); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const exportData = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), transactions, goals, recurring, cryptoHoldings, settings: { currency, privacy } }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "trek-backup.json"; a.click(); URL.revokeObjectURL(url); };
  return <section className="tc-page"><div className="tc-page-head"><div><span>ACCOUNT</span><h2>Settings</h2><p>Control your profile, privacy, currency and membership.</p></div></div><div className="tc-settings">
    <section className="tc-panel"><span>PROFILE</span><div className="tc-profile-row">{avatarUrl ? <img className="tc-profile-avatar" src={avatarUrl} alt="Profile" /> : <span className="tc-profile-avatar">{profileName.charAt(0).toUpperCase()}</span>}<div><h3>{profileName}</h3><p>{user.email}</p></div></div><div className="tn-settings-actions"><label className="tc-upload"><Upload size={14} /> Upload photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setBusy(true); await onAvatar(file); } catch (uploadError) { setError(uploadError.message); } finally { setBusy(false); } }} /></label></div><div className="tc-inline"><input value={name} onChange={(event) => setName(event.target.value)} /><button disabled={busy} onClick={async () => { setBusy(true); await onProfile(name); setBusy(false); }}>Save name</button></div>{error && <p className="tc-form-error">{error}</p>}</section>
    <section className="tc-panel"><span>DISPLAY & ALERTS</span><h3>{currency}</h3><div className="tc-choice">{["EUR", "USD", "PLN", "UAH"].map((item) => <button key={item} className={currency === item ? "on" : ""} onClick={() => onCurrency(item)}>{item}</button>)}</div><button onClick={() => onPrivacy(!privacy)}>{privacy ? <Eye size={15} /> : <EyeOff size={15} />} {privacy ? "Show amounts" : "Hide amounts"}</button><button onClick={() => onNotifications(!notificationsEnabled)}>{notificationsEnabled ? <Bell size={15} /> : <Bell size={15} />} {notificationsEnabled ? "Budget alerts on" : "Budget alerts off"}</button></section>
    <section className="tc-panel"><span>MEMBERSHIP</span><h3>{plan}</h3><p>{nativeApp ? "Your membership and unlocked features sync automatically with your Trek account." : "Manage payments, invoices or cancellation through Stripe’s secure customer portal."}</p>{nativeApp ? <button onClick={onUpgrade}><CreditCard size={15} /> View plan features</button> : <button onClick={plan === "Start" ? onUpgrade : onPortal}><CreditCard size={15} /> {plan === "Start" ? "See plans" : "Manage billing"}</button>}</section>
    <section className="tc-panel"><span>YOUR DATA</span><h3>Export a backup</h3><p>{canExport ? "Download your transactions, goals, recurring items and crypto positions." : "Cloud export is available with Plus or Lifetime."}</p><button onClick={canExport ? exportData : onUpgrade}><Download size={15} /> {canExport ? "Export my data" : "Upgrade to export"}</button></section>
    <section className="tc-panel tn-dashboard-settings"><span>DASHBOARD WIDGETS</span><h3>Choose what matters</h3><p>Keep the overview focused on the information you use most.</p>{[["pace","Spending pace"],["signal","Trek signal"],["transactions","Recent transactions"],["goals","Top goal"]].map(([id,label]) => <label key={id}><input type="checkbox" checked={widgets.includes(id)} onChange={() => onWidgets(widgets.includes(id) ? widgets.filter((item) => item !== id) : [...widgets, id])} /> {label}</label>)}</section>
  </div></section>;
}

export default function Cabinet({ onExit, onSignOut, user, onProfileUpdate, nativeApp = false }) {
  const [view, setView] = useState("overview"); const [month, setMonth] = useState(monthKey()); const [modal, setModal] = useState(null); const [editing, setEditing] = useState(null);
  const [transactions, setTransactions] = useState([]); const [budgets, setBudgets] = useState([]); const [categoryRows, setCategoryRows] = useState([]); const [goals, setGoals] = useState([]); const [recurring, setRecurring] = useState([]);
  const [cryptoHoldings, setCryptoHoldings] = useState([]); const [cryptoPrices, setCryptoPrices] = useState({}); const [cryptoHistory, setCryptoHistory] = useState([]); const [cryptoPeriod, setCryptoPeriod] = useState("1M"); const [cryptoLoading, setCryptoLoading] = useState(false); const [cryptoRefresh, setCryptoRefresh] = useState(0);
  const [currency, setCurrency] = useState("EUR"); const [fallbackBudget, setFallbackBudget] = useState(0); const [privacy, setPrivacy] = useState(false); const [widgets, setWidgets] = useState(["pace", "signal", "transactions", "goals"]); const [plan, setPlan] = useState("Start"); const [avatarUrl, setAvatarUrl] = useState(""); const [profileName, setProfileName] = useState(user.user_metadata?.full_name || user.email?.split("@")[0] || "Member");
  const [onboardingCompleted, setOnboardingCompleted] = useState(true); const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [loading, setLoading] = useState(true); const [dataError, setDataError] = useState(""); const [notice, setNotice] = useState(false); const [mobileNav, setMobileNav] = useState(false); const [toast, setToast] = useState(null);
  const plus = plan !== "Start";
  const fromTransaction = (row) => ({ id: row.id, merchant: row.merchant, category: row.category, type: row.entry_type, amount: Number(row.amount), date: row.occurred_on, note: row.note || "", tags: row.tags || [], needsReview: row.needs_review || false, originalAmount: row.original_amount == null ? null : Number(row.original_amount), originalCurrency: row.original_currency, exchangeRate: row.exchange_rate == null ? null : Number(row.exchange_rate), exchangeRateDate: row.exchange_rate_date, importHash: row.import_hash, importSource: row.import_source, color: row.entry_type === "income" ? COLORS[1] : COLORS[CATEGORIES.indexOf(row.category) % COLORS.length] || COLORS[0] });
  const fromGoal = (row) => ({ id: row.id, name: row.name, target: Number(row.target_amount), saved: Number(row.saved_amount), deadline: row.deadline, icon: row.icon, color: row.color, status: row.status });
  const fromRecurring = (row) => ({ id: row.id, merchant: row.merchant, category: row.category, type: row.entry_type, amount: Number(row.amount), day: row.day_of_month, active: row.active, lastPostedMonth: row.last_posted_month });
  const fromCrypto = (row) => ({ id: row.id, coinId: row.coin_id, symbol: row.symbol, name: row.name, quantity: Number(row.quantity), averageBuyPriceUsd: Number(row.average_buy_price_usd), source: row.source });

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
      ]);
      const failed = results.find((result) => result.error);
      if (failed) { if (active) { setDataError(`${failed.error.message}. Run the latest supabase/schema.sql migration.`); setLoading(false); } return; }
      if (!active) return;
      const [profileResult, settingsResult, transactionResult, subscriptionResult, budgetResult, categoryResult, goalResult, recurringResult, cryptoResult] = results;
      setProfileName(profileResult.data.full_name || user.email?.split("@")[0] || "Member"); setCurrency(settingsResult.data.currency || "EUR"); setFallbackBudget(Number(settingsResult.data.monthly_budget || 0)); setPrivacy(Boolean(settingsResult.data.privacy_mode)); setWidgets(Array.isArray(settingsResult.data.dashboard_widgets) ? settingsResult.data.dashboard_widgets : ["pace", "signal", "transactions", "goals"]); setOnboardingCompleted(settingsResult.data.onboarding_completed !== false); setNotificationsEnabled(settingsResult.data.notifications_enabled !== false);
      setTransactions(transactionResult.data.map(fromTransaction)); setPlan(subscriptionResult.data?.status === "active" ? subscriptionResult.data.plan : "Start"); setBudgets(budgetResult.data || []); setCategoryRows(categoryResult.data || []); setGoals(goalResult.data.map(fromGoal)); setRecurring(recurringResult.data.map(fromRecurring)); setCryptoHoldings((cryptoResult.data || []).map(fromCrypto));
      if (profileResult.data.avatar_path) { const signed = await supabase.storage.from("trek-avatars").createSignedUrl(profileResult.data.avatar_path, 3600); if (signed.data?.signedUrl) setAvatarUrl(signed.data.signedUrl); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => { const handler = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setEditing(null); setModal("entry"); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);

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
  const metrics = useMemo(() => calculateMetrics(monthTransactions, budget, month, recurring), [monthTransactions, budget, month, recurring]);
  const previousMetrics = useMemo(() => calculateMetrics(previousTransactions, Number(budgets.find((row) => row.month_start === shiftMonth(month, -1))?.total || 0), shiftMonth(month, -1), []), [previousTransactions, budgets, month]);
  const notificationItems = useMemo(() => {
    if (!notificationsEnabled || month !== monthKey()) return [];
    const today = new Date().getDate();
    const items = recurring.filter((item) => item.active && item.lastPostedMonth !== month && item.day <= today + 3).slice(0, 3).map((item) => ({ id: `recurring-${item.id}`, icon: CalendarClock, title: item.day < today ? `${item.merchant} is overdue` : `${item.merchant} is coming up`, copy: `${money(item.amount, currency, privacy)} · day ${item.day}`, tone: item.day < today ? "danger" : "", recurring: item }));
    if (budget > 0 && metrics.spending >= budget * .85) items.push({ id: "budget", icon: AlertTriangle, title: metrics.spending > budget ? "Monthly budget exceeded" : "Budget is nearly used", copy: `${Math.round(metrics.spending / budget * 100)}% of this month’s budget has been spent.`, tone: "danger", view: "plan" });
    const overCategory = metrics.byCategory.find((row) => Number(categoryBudgets[row.category] || 0) > 0 && row.amount > Number(categoryBudgets[row.category]));
    if (overCategory) items.push({ id: `category-${overCategory.category}`, icon: BarChart3, title: `${overCategory.category} is over plan`, copy: `${money(overCategory.amount - Number(categoryBudgets[overCategory.category]), currency, privacy)} above its envelope.`, tone: "danger", view: "plan" });
    const reviews = monthTransactions.filter((item) => item.needsReview).length;
    if (reviews) items.push({ id: "review", icon: ReceiptText, title: `${reviews} transaction${reviews === 1 ? "" : "s"} need review`, copy: "Check imported or scanned details before relying on the forecast.", view: "transactions" });
    return items.slice(0, 6);
  }, [notificationsEnabled, month, recurring, budget, metrics.spending, metrics.byCategory, categoryBudgets, monthTransactions, currency, privacy]);
  const setError = (error) => { setDataError(error?.message || String(error)); return false; };
  const showToast = (message, options = {}) => setToast({ message, ...options });
  const saveSettings = async (change) => { const result = await supabase.from("user_settings").update({ ...change, updated_at: new Date().toISOString() }).eq("user_id", user.id); if (result.error) return setError(result.error); if (change.currency) setCurrency(change.currency); if (change.privacy_mode !== undefined) setPrivacy(change.privacy_mode); if (change.dashboard_widgets) setWidgets(change.dashboard_widgets); if (change.notifications_enabled !== undefined) setNotificationsEnabled(change.notifications_enabled); if (change.onboarding_completed !== undefined) setOnboardingCompleted(change.onboarding_completed); return true; };
  const saveBudget = async (total, quiet = false) => { const row = { user_id: user.id, month_start: month, total: Math.max(0, total), updated_at: new Date().toISOString() }; const result = await supabase.from("monthly_budgets").upsert(row); if (result.error) return setError(result.error); setBudgets((current) => [...current.filter((item) => item.month_start !== month), row]); if (!quiet) showToast("Monthly budget updated."); return true; };
  const saveCategory = async (category, value, persist) => { const amount = Math.max(0, Number(String(value).replace(",", ".")) || 0); const row = { user_id: user.id, month_start: month, category, amount, updated_at: new Date().toISOString() }; setCategoryRows((current) => [...current.filter((item) => !(item.month_start === month && item.category === category)), row]); if (persist) { const result = await supabase.from("category_budgets").upsert(row); if (result.error) setError(result.error); } };
  const copyPrevious = async () => { const previous = shiftMonth(month, -1); const sourceBudget = budgets.find((row) => row.month_start === previous); const sourceCategories = categoryRows.filter((row) => row.month_start === previous); if (!sourceBudget && !sourceCategories.length) return setDataError("The previous month has no plan to copy."); if (sourceBudget) await saveBudget(Number(sourceBudget.total)); for (const row of sourceCategories) await saveCategory(row.category, row.amount, true); };

  const saveTransaction = async (form, quiet = false) => { const payload = { user_id: user.id, merchant: form.merchant.trim(), category: form.type === "income" ? "Other" : form.category, entry_type: form.type, amount: form.amount, occurred_on: form.date, note: form.note || "", tags: form.tags || [], needs_review: Boolean(form.needsReview), original_amount: form.originalAmount || null, original_currency: form.originalCurrency || null, exchange_rate: form.exchangeRate || null, exchange_rate_date: form.exchangeRateDate || null, import_hash: form.importHash || null, import_source: form.importSource || null }; const result = form.id ? await supabase.from("transactions").update(payload).eq("id", form.id).select().single() : await supabase.from("transactions").insert(payload).select().single(); if (result.error) return setError(result.error); const next = fromTransaction(result.data); setTransactions((current) => form.id ? current.map((item) => item.id === form.id ? next : item) : [next, ...current]); if (!quiet) showToast(form.id ? "Transaction updated." : "Transaction saved."); return true; };
  const removeTransaction = async (id) => { const removed = transactions.find((item) => item.id === id); if (!removed) return false; const result = await supabase.from("transactions").delete().eq("id", id); if (result.error) return setError(result.error); setTransactions((current) => current.filter((item) => item.id !== id)); showToast("Transaction deleted.", { actionLabel: "Undo", action: async () => { const payload = { id: removed.id, user_id: user.id, merchant: removed.merchant, category: removed.category, entry_type: removed.type, amount: removed.amount, occurred_on: removed.date, note: removed.note, tags: removed.tags, needs_review: removed.needsReview, original_amount: removed.originalAmount, original_currency: removed.originalCurrency, exchange_rate: removed.exchangeRate, exchange_rate_date: removed.exchangeRateDate, import_hash: removed.importHash, import_source: removed.importSource }; const restored = await supabase.from("transactions").insert(payload).select().single(); if (restored.error) return setError(restored.error); setTransactions((current) => [fromTransaction(restored.data), ...current]); setToast(null); } }); return true; };
  const removeMany = async (ids) => { const result = await supabase.from("transactions").delete().in("id", ids); if (result.error) return setError(result.error); setTransactions((current) => current.filter((item) => !ids.includes(item.id))); return true; };
  const createGoal = async (form) => { const result = await supabase.from("goals").insert({ user_id: user.id, name: form.name, target_amount: Number(form.target), deadline: form.deadline || null, icon: form.icon, color: form.color }).select().single(); if (result.error) return setError(result.error); setGoals((current) => [...current, fromGoal(result.data)]); return true; };
  const contribute = async (goal, amount) => { if (!(amount > 0)) return; const saved = Math.min(goal.target, goal.saved + amount); const status = saved >= goal.target ? "completed" : "active"; const result = await supabase.from("goals").update({ saved_amount: saved, status, updated_at: new Date().toISOString() }).eq("id", goal.id); if (result.error) return setError(result.error); setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, saved, status } : item)); };
  const archiveGoal = async (id) => { const result = await supabase.from("goals").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id); if (result.error) return setError(result.error); setGoals((current) => current.filter((item) => item.id !== id)); };
  const createRecurring = async (form) => { const result = await supabase.from("recurring_items").insert({ user_id: user.id, merchant: form.merchant, category: form.category, entry_type: form.type, amount: Number(form.amount), day_of_month: Number(form.day) }).select().single(); if (result.error) return setError(result.error); setRecurring((current) => [...current, fromRecurring(result.data)]); return true; };
  const deleteRecurring = async (id) => { const result = await supabase.from("recurring_items").delete().eq("id", id); if (result.error) return setError(result.error); setRecurring((current) => current.filter((item) => item.id !== id)); };
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
      const incomeResult = await supabase.from("transactions").insert({ user_id: user.id, merchant: "Opening income", category: "Other", entry_type: "income", amount: form.income, occurred_on: iso(new Date()), note: "Added during Trek setup", tags: ["onboarding"], needs_review: false }).select().single();
      if (incomeResult.error) throw incomeResult.error;
      setTransactions((current) => [fromTransaction(incomeResult.data), ...current]);
    }
    setProfileName(form.name.trim()); setCurrency(form.currency); setFallbackBudget(form.budget); setBudgets((current) => [...current.filter((item) => item.month_start !== monthKey()), budgetRow]); setOnboardingCompleted(true); await onProfileUpdate(form.name.trim()); showToast("Your Trek dashboard is ready.");
  };

  const uploadAvatar = async (file) => { if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) throw new Error("Choose a PNG, JPG or WebP image under 2 MB."); const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`; const upload = await supabase.storage.from("trek-avatars").upload(path, file, { contentType: file.type }); if (upload.error) throw upload.error; const profile = await supabase.from("profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", user.id); if (profile.error) throw profile.error; const signed = await supabase.storage.from("trek-avatars").createSignedUrl(path, 3600); if (signed.error) throw signed.error; setAvatarUrl(signed.data.signedUrl); };
  const updateProfile = async (name) => { const next = name.trim() || profileName; const result = await supabase.from("profiles").update({ full_name: next, updated_at: new Date().toISOString() }).eq("id", user.id); if (result.error) return setError(result.error); await onProfileUpdate(next); setProfileName(next); return true; };
  const authenticatedFetch = async (url, options = {}) => { const session = await supabase.auth.getSession(); return fetch(apiUrl(url), { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}`, ...(options.headers || {}) } }); };
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
      setCryptoHoldings((current) => [next, ...current.filter((item) => item.coinId !== next.coinId)]);
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
    const payload = rows.map((row) => ({ user_id: user.id, merchant: row.merchant, category: row.type === "income" ? "Other" : row.category, entry_type: row.type, amount: row.amount, occurred_on: row.date,
      note: row.originalCurrency === currency ? `Imported from ${source}` : `Imported from ${source} · ${row.originalAmount} ${row.originalCurrency} at official NBU rate`, tags: ["imported", "bank-statement"], needs_review: false,
      original_amount: row.originalAmount, original_currency: row.originalCurrency, exchange_rate: row.exchangeRate, exchange_rate_date: row.exchangeRateDate, import_hash: row.importHash, import_source: source }));
    const result = await supabase.from("transactions").upsert(payload, { onConflict: "user_id,import_hash", ignoreDuplicates: true }).select();
    if (result.error) throw new Error(`${result.error.message}. Run the latest supabase/schema.sql migration first.`);
    const imported = (result.data || []).map(fromTransaction);
    setTransactions((current) => [...imported, ...current]);
    if (months?.length) setMonth(months[months.length - 1]);
    setDataError(imported.length < rows.length ? `${imported.length} imported; ${rows.length - imported.length} duplicate rows skipped.` : "");
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
  const askCoach = async (question) => { const response = await authenticatedFetch("/api/coach", { method: "POST", body: JSON.stringify({ question, summary: { month, currency, budget, spent: metrics.spending, income: metrics.earned, remaining: metrics.remaining, safe_to_spend: metrics.safeToSpend, upcoming_bills: metrics.upcoming, daily_pace: metrics.daily, month_end_forecast: metrics.forecast, pulse_score: metrics.score, category_budgets: categoryBudgets, top_categories: metrics.byCategory.slice(0, 5), goals: goals.map((goal) => ({ name: goal.name, target: goal.target, saved: goal.saved, deadline: goal.deadline })) } }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Coach is unavailable."); return body.answer; };

  const lockedView = (id) => ["recurring", "analytics"].includes(id) && !plus;
  const changeView = (id) => lockedView(id) ? setModal("pricing") : setView(id);
  let page;
  if (view === "overview") page = <Overview transactions={monthTransactions} metrics={metrics} budget={budget} goals={goals} currency={currency} hidden={privacy} categoryBudgets={categoryBudgets} widgets={widgets} onAdd={() => { setEditing(null); setModal("entry"); }} onView={changeView} onCoach={() => plus ? setModal("coach") : setModal("pricing")} />;
  else if (view === "transactions") page = <TransactionsPage items={monthTransactions} currency={currency} hidden={privacy} canImport={plan === "Lifetime"} onAdd={() => { setEditing(null); setModal("entry"); }} onEdit={(item) => { setEditing(item); setModal("entry"); }} onDelete={removeTransaction} onDeleteMany={removeMany} onImport={() => setModal(plan === "Lifetime" ? "statement" : "pricing")} />;
  else if (view === "plan") page = <PlanPage budget={budget} categoryBudgets={categoryBudgets} metrics={metrics} currency={currency} hidden={privacy} onBudgetSave={saveBudget} onCategorySave={saveCategory} onCopyPrevious={copyPrevious} />;
  else if (view === "recurring") page = <RecurringPage items={recurring} currency={currency} hidden={privacy} canUse={plus} onAdd={() => setModal("recurring")} onPost={postRecurring} onDelete={deleteRecurring} onUpgrade={() => setModal("pricing")} />;
  else if (view === "goals") page = <GoalsPage goals={goals} currency={currency} hidden={privacy} canAddMore={plus || goals.length === 0} onAdd={() => setModal("goal")} onContribute={contribute} onArchive={archiveGoal} onUpgrade={() => setModal("pricing")} />;
  else if (view === "crypto") page = <CryptoPage holdings={cryptoHoldings} prices={cryptoPrices} history={cryptoHistory} period={cryptoPeriod} loading={cryptoLoading} currency={currency} hidden={privacy} plan={plan} onPeriod={setCryptoPeriod} onAdd={() => setModal("crypto")} onDelete={deleteCrypto} onUpgrade={() => setModal("pricing")} onRefresh={() => setCryptoRefresh((value) => value + 1)} />;
  else if (view === "analytics") page = <AnalyticsPage metrics={metrics} previousMetrics={previousMetrics} categoryBudgets={categoryBudgets} currency={currency} hidden={privacy} />;
  else page = <SettingsPage user={user} profileName={profileName} avatarUrl={avatarUrl} currency={currency} plan={plan} privacy={privacy} notificationsEnabled={notificationsEnabled} widgets={widgets} canExport={plus} transactions={transactions} goals={goals} recurring={recurring} cryptoHoldings={cryptoHoldings} onProfile={updateProfile} onAvatar={uploadAvatar} onCurrency={(value) => saveSettings({ currency: value })} onPrivacy={(value) => saveSettings({ privacy_mode: value })} onNotifications={(value) => saveSettings({ notifications_enabled: value })} onWidgets={(value) => saveSettings({ dashboard_widgets: value })} onPortal={billingPortal} onUpgrade={() => setModal("pricing")} nativeApp={nativeApp} />;

  if (loading) return <div className="tw-loading">Loading your money space…</div>;
  return <div className={`tc-app${nativeApp ? " tc-native" : ""}`}><aside className="tc-side"><button className="tc-brand" onClick={onExit}><i><ArrowUpRight size={17} /></i> Trek</button><small>PERSONAL SPACE</small>{NAV.map(([id, label, Icon]) => <button key={id} className={`${view === id ? "on" : ""}${lockedView(id) ? " locked" : ""}`} onClick={() => changeView(id)}><Icon size={17} /> {label}{lockedView(id) ? " · Plus" : ""}</button>)}<div className="tc-side-bottom"><button onClick={() => setModal("pricing")}><CreditCard size={17} /> {plan} plan</button><button onClick={() => setView("settings")}><Settings size={17} /> Settings</button>{!nativeApp && <button onClick={onExit}><ArrowLeft size={16} /> Back to home</button>}<button onClick={onSignOut}><LogOut size={17} /> Sign out</button></div></aside>
    <main className="tc-main"><header className="tc-top"><div className="tc-mobile-brand"><button onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Menu size={19} /></button><span className="tc-mobile-mark" aria-hidden="true"><ArrowUpRight size={16} /></span><b>Trek</b></div><div className="tn-top-center">{!["settings", "crypto"].includes(view) && <MonthControl value={month} onChange={setMonth} />}</div><div className="tc-top-actions"><button className="tn-notification-button" onClick={() => setNotice(!notice)} aria-label={`Open notifications${notificationItems.length ? `, ${notificationItems.length} unread` : ""}`}><Bell size={18} />{notificationItems.length > 0 && <i>{notificationItems.length}</i>}</button><button onClick={() => setPrivacy(!privacy)} title="Temporarily hide amounts" aria-label={privacy ? "Show amounts" : "Hide amounts"}>{privacy ? <Eye size={17} /> : <EyeOff size={17} />}</button>{avatarUrl ? <img className="tc-top-avatar" src={avatarUrl} alt="Profile" /> : <span>{profileName.charAt(0).toUpperCase()}</span>}</div>{notice && <NotificationCenter items={notificationItems} currency={currency} hidden={privacy} onPost={postRecurring} onSelect={(nextView) => { setView(nextView); setNotice(false); }} />}</header>{dataError && <div className="tn-error"><AlertTriangle size={16} /> <span>{dataError}</span><button onClick={() => setDataError("")}><X size={15} /></button></div>}{page}</main>
    {nativeApp && <nav className="tm-bottom-nav" aria-label="Main navigation"><button className={view === "overview" ? "on" : ""} onClick={() => changeView("overview")}><LayoutDashboard size={20} /><span>Overview</span></button><button className={view === "transactions" ? "on" : ""} onClick={() => changeView("transactions")}><ReceiptText size={20} /><span>Activity</span></button><button className="tm-add" onClick={() => { setEditing(null); setModal("entry"); }} aria-label="Add transaction"><Plus size={25} /></button><button className={view === "plan" ? "on" : ""} onClick={() => changeView("plan")}><CalendarDays size={20} /><span>Plan</span></button><button className={mobileNav || ["recurring", "goals", "crypto", "analytics", "settings"].includes(view) ? "on" : ""} onClick={() => setMobileNav((current) => !current)}><Menu size={20} /><span>More</span></button></nav>}
    {mobileNav && createPortal(<div className="tm-menu-layer" role="presentation"><button className="tm-menu-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" /><div className="tc-mobile-menu tm-menu-sheet" role="dialog" aria-label="More navigation">{NAV.map(([id, label, Icon]) => <button key={id} className={view === id ? "on" : ""} onClick={() => { changeView(id); setMobileNav(false); }}><Icon size={17} /> {label}{lockedView(id) ? " · Plus" : ""}</button>)}<button className={view === "settings" ? "on" : ""} onClick={() => { setView("settings"); setMobileNav(false); }}><Settings size={17} /> Settings</button></div></div>, document.body)}
    {modal === "entry" && <EntryModal initial={editing ? { ...editing, amount: String(editing.amount), tags: editing.tags || [] } : null} month={month} onClose={() => setModal(null)} onSave={saveTransaction} onScan={scanReceipt} />}
    {modal === "goal" && <GoalModal onClose={() => setModal(null)} onSave={createGoal} />}
    {modal === "recurring" && <RecurringModal onClose={() => setModal(null)} onSave={createRecurring} />}
    {modal === "coach" && <CoachModal onClose={() => setModal(null)} onAsk={askCoach} />}
    {modal === "statement" && <StatementImportModal currency={currency} onClose={() => setModal(null)} onAnalyze={analyzeStatement} onConfirm={confirmStatement} />}
    {modal === "crypto" && <CryptoModal currency={currency} onClose={() => setModal(null)} onSave={saveCrypto} />}
    {modal === "pricing" && <PricingModal plan={plan} user={user} onClose={() => setModal(null)} onCheckout={checkout} nativeApp={nativeApp} />}
    {!onboardingCompleted && <OnboardingModal initialName={profileName} initialCurrency={currency} initialBudget={fallbackBudget || 3000} onComplete={completeOnboarding} />}
    {toast && createPortal(<Toast toast={toast} onClose={() => setToast(null)} />, document.body)}
  </div>;
}
