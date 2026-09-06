import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BarChart3, Bell, Camera, CalendarClock, CalendarDays, Check, ChevronLeft,
  ChevronRight, CircleDollarSign, Coffee, CreditCard, Download, Eye, EyeOff,
  FileUp, HeartPulse, Home, LayoutDashboard, LoaderCircle, LogOut, Menu, Music2, Pencil,
  Plus, ReceiptText, RefreshCw, Search, Settings, ShoppingBag, Sparkles, Target,
  Trash2, Upload, UserRound, Wallet, X, Car,
} from "lucide-react";
import "./cabinet.css";
import "./cabinet-extra.css";
import "./profile.css";
import "./coach.css";
import "./cabinet-next.css";
import { supabase } from "./supabase.js";

const CATEGORIES = ["Groceries", "Transport", "Subscriptions", "Coffee", "Shopping", "Housing", "Health", "Fun", "Other"];
const COLORS = ["#00e5a0", "#59a9ff", "#ffcc66", "#ff795e", "#b883ff", "#35d0ba", "#f58ac5", "#9aa7ff", "#aab5af"];
const SYMBOLS = { UAH: "₴", PLN: "zł", EUR: "€", USD: "$" };
const ICONS = { Groceries: ShoppingBag, Transport: Car, Subscriptions: Music2, Coffee, Shopping: ShoppingBag, Housing: Home, Health: HeartPulse, Fun: Sparkles, Other: CircleDollarSign };
const NAV = [
  ["overview", "Overview", LayoutDashboard], ["transactions", "Transactions", ReceiptText],
  ["plan", "Monthly plan", CalendarDays], ["recurring", "Recurring", CalendarClock],
  ["goals", "Goals", Target], ["analytics", "Analytics", BarChart3],
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
  ? "••••"
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

function Modal({ children, onClose, wide = false }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return <div className="tc-modal" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`tc-modal-card${wide ? " tc-modal-wide" : ""}`} role="dialog" aria-modal="true">
      <button className="tc-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
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

function Bars({ values, currency, hidden }) {
  const max = Math.max(...values.map((item) => item.amount), 1);
  return <div className="tc-chart tn-bars">
    {values.map((item, index) => <div className="tc-bar" key={item.key || item.label} title={`${item.label}: ${money(item.amount, currency, hidden)}`}>
      <i className={index === values.length - 1 ? "active" : ""} style={{ height: `${Math.max(5, item.amount / max * 100)}%` }} />
      <small>{item.label}</small>
    </div>)}
  </div>;
}

function Donut({ rows, total }) {
  let cursor = 0;
  const stops = rows.map((row, index) => {
    const end = cursor + (row.amount / Math.max(total, 1)) * 100;
    const stop = `${COLORS[index % COLORS.length]} ${cursor}% ${end}%`;
    cursor = end;
    return stop;
  });
  return <div className="tn-donut" style={{ background: rows.length ? `conic-gradient(${stops.join(",")})` : "#263038" }}><span>{Math.round(total)}</span></div>;
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
  const fileRef = useRef(null);
  const filtered = items.filter((item) => {
    const text = `${item.merchant} ${item.category} ${item.note || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (category === "All" || item.category === category) && (kind === "All" || item.type === kind);
  });
  const toggle = (id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (file) await onImport(file);
    event.target.value = "";
  };
  return <section className="tc-page">
    <div className="tc-page-head"><div><span>YOUR RECORDS</span><h2>Transactions</h2><p>{filtered.length} visible entries · edit, filter or review your records.</p></div><button className="tc-action" onClick={onAdd}><Plus size={17} /> Add transaction</button></div>
    <section className="tc-panel tn-toolbar">
      <label className="tn-search"><Search size={16} /><input placeholder="Search merchant, note or tag" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select value={category} onChange={(event) => setCategory(event.target.value)}><option>All</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={kind} onChange={(event) => setKind(event.target.value)}><option>All</option><option value="expense">Expenses</option><option value="income">Income</option></select>
      <button onClick={() => canImport ? fileRef.current?.click() : onImport(null)}><FileUp size={16} /> Import CSV{!canImport && " · Plus"}</button>
      <input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={importFile} />
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
    <div className="tc-grid analytics"><section className="tc-panel tc-spend"><header><div><span>DAILY RHYTHM</span><h3>{money(metrics.daily, currency, hidden)} average</h3></div></header><Bars values={metrics.dailySeries} currency={currency} hidden={hidden} /></section><section className="tc-panel tn-donut-panel"><span>WHERE IT WENT</span><Donut rows={metrics.byCategory} total={metrics.spending} /><h3>{money(metrics.spending, currency, hidden)}</h3></section>
      <section className="tc-panel tc-breakdown"><header><span>BUDGET VS ACTUAL</span></header>{metrics.byCategory.length ? metrics.byCategory.map((row, index) => { const planned = Number(categoryBudgets[row.category] || 0); return <div key={row.category}><p><span><CategoryIcon category={row.category} /> {row.category}</span><b>{money(row.amount, currency, hidden)} / {money(planned, currency, hidden)}</b></p><i><em style={{ width: `${clamp(row.amount / Math.max(planned, row.amount, 1) * 100, 0, 100)}%`, background: row.amount > planned && planned > 0 ? "#ff795e" : COLORS[index] }} /></i></div>; }) : <Empty icon={BarChart3} title="No analytics yet" copy="Add transactions to reveal your spending pattern." />}</section>
    </div>
  </section>;
}

function Empty({ icon: Icon, title, copy }) { return <div className="tc-empty"><span className="tc-empty-icon"><Icon size={21} /></span><div className="tc-empty-copy"><b>{title}</b><span>{copy}</span></div></div>; }

function EntryModal({ initial, month, onClose, onSave, onScan }) {
  const [form, setForm] = useState(initial || { merchant: "", amount: "", category: CATEGORIES[0], type: "expense", date: monthKey() === month ? iso(new Date()) : month, note: "", tags: "", needsReview: false });
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const receiptRef = useRef(null);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <Modal onClose={onClose}><span className="tc-kicker">{initial ? "EDIT TRANSACTION" : "NEW TRANSACTION"}</span><h2>{initial ? "Update entry" : "Log an entry"}</h2><form className="tc-form tn-form-grid" onSubmit={async (event) => { event.preventDefault(); const amount = Number(String(form.amount).replace(",", ".")); if (!form.merchant.trim() || amount <= 0) return; setBusy(true); const ok = await onSave({ ...form, amount, tags: typeof form.tags === "string" ? form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : form.tags }); setBusy(false); if (ok) onClose(); }}>
    {!initial && <div className="tn-receipt-scan tn-span-2"><button type="button" disabled={scanning} onClick={() => receiptRef.current?.click()}>{scanning ? <LoaderCircle className="tn-spin" size={18} /> : <Camera size={18} />}<span><b>{scanning ? "Reading receipt…" : "Scan a receipt"}</b><small>Take a photo or choose one from your library</small></span></button><input ref={receiptRef} hidden type="file" accept="image/png,image/jpeg,image/webp" capture="environment" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; setScanning(true); setScanMessage(""); try { const parsed = await onScan(file); setForm((current) => ({ ...current, type: "expense", merchant: parsed.merchant || current.merchant, amount: parsed.amount ? String(parsed.amount) : current.amount, date: parsed.date || current.date, category: CATEGORIES.includes(parsed.category) ? parsed.category : current.category, note: parsed.note || current.note, tags: "receipt", needsReview: parsed.confidence !== "high" })); setScanMessage(parsed.currency ? `Receipt read in ${parsed.currency}. Check the details before saving.` : "Receipt read. Check the details before saving."); } catch (error) { setScanMessage(error.message || "The receipt could not be read."); } finally { setScanning(false); } }} />{scanMessage && <p>{scanMessage}</p>}</div>}
    <label>Type<select value={form.type} onChange={(event) => set("type", event.target.value)}><option value="expense">Expense</option><option value="income">Income</option></select></label>
    <label>Merchant or source<input autoFocus value={form.merchant} onChange={(event) => set("merchant", event.target.value)} /></label>
    <label>Amount<input inputMode="decimal" value={form.amount} onChange={(event) => set("amount", event.target.value)} /></label>
    <label>Date<input type="date" value={form.date} onChange={(event) => set("date", event.target.value)} /></label>
    {form.type === "expense" && <label>Category<select value={form.category} onChange={(event) => set("category", event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>}
    <label>Tags<input placeholder="work, travel" value={Array.isArray(form.tags) ? form.tags.join(", ") : form.tags} onChange={(event) => set("tags", event.target.value)} /></label>
    <label className="tn-span-2">Note<input placeholder="Optional context" value={form.note || ""} onChange={(event) => set("note", event.target.value)} /></label>
    <label className="tn-check tn-span-2"><input type="checkbox" checked={form.needsReview || false} onChange={(event) => set("needsReview", event.target.checked)} /> Mark as needing review</label>
    <button className="tc-action tn-span-2" disabled={busy}>{busy ? "Saving…" : "Save transaction"}</button>
  </form></Modal>;
}

function GoalModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", target: "", deadline: "", icon: "Target", color: COLORS[0] });
  return <Modal onClose={onClose}><span className="tc-kicker">NEW GOAL</span><h2>Give your money direction.</h2><form className="tc-form" onSubmit={async (event) => { event.preventDefault(); if (form.name && Number(form.target) > 0 && await onSave(form)) onClose(); }}><label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Emergency fund" /></label><label>Target amount<input inputMode="decimal" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} /></label><label>Target date<input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></label><label>Color<input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label><button className="tc-action">Create goal</button></form></Modal>;
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

function PricingModal({ plan, user, onClose, onCheckout, nativeApp = false }) {
  const choices = [
    ["Start", "Free", ["Manual tracking", "Receipt recognition", "One goal", "Basic monthly plan"]],
    ["Plus", "€6 / month", ["Recurring calendar", "Unlimited goals", "CSV import and export", "Advanced analytics", "Trek Coach"]],
    ["Lifetime", "€149 once", ["Every Plus feature", "Lifetime access", "Priority new features"]],
  ];
  return <Modal onClose={onClose} wide><span className="tc-kicker">MEMBERSHIP</span><h2>Choose your Trek mode.</h2><p className="tc-modal-copy">{nativeApp ? "Your existing Trek membership syncs automatically across web and mobile. Purchases are not offered inside the iOS app." : "Start with the essentials, or unlock deeper planning, automation and coaching."}</p><div className="tc-prices">{choices.map(([name, price, features]) => <article key={name} className={plan === name ? "selected" : ""}><span>{name}</span><h3>{price}</h3><ul>{features.map((feature) => <li key={feature}><Check size={15} /> {feature}</li>)}</ul><button disabled={nativeApp || plan === name || name === "Start"} onClick={() => onCheckout(name, user)}>{plan === name ? "Current plan" : nativeApp ? "Synced from your account" : name === "Start" ? "Included" : "Continue to payment"}</button></article>)}</div></Modal>;
}

function SettingsPage({ user, profileName, avatarUrl, currency, plan, privacy, widgets, canExport, transactions, goals, recurring, onProfile, onAvatar, onCurrency, onPrivacy, onWidgets, onPortal, onUpgrade, nativeApp = false }) {
  const [name, setName] = useState(profileName); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const exportData = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), transactions, goals, recurring, settings: { currency, privacy } }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "trek-backup.json"; a.click(); URL.revokeObjectURL(url); };
  return <section className="tc-page"><div className="tc-page-head"><div><span>ACCOUNT</span><h2>Settings</h2><p>Control your profile, privacy, currency and membership.</p></div></div><div className="tc-settings">
    <section className="tc-panel"><span>PROFILE</span><div className="tc-profile-row">{avatarUrl ? <img className="tc-profile-avatar" src={avatarUrl} alt="Profile" /> : <span className="tc-profile-avatar">{profileName.charAt(0).toUpperCase()}</span>}<div><h3>{profileName}</h3><p>{user.email}</p></div></div><div className="tn-settings-actions"><label className="tc-upload"><Upload size={14} /> Upload photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setBusy(true); await onAvatar(file); } catch (uploadError) { setError(uploadError.message); } finally { setBusy(false); } }} /></label></div><div className="tc-inline"><input value={name} onChange={(event) => setName(event.target.value)} /><button disabled={busy} onClick={async () => { setBusy(true); await onProfile(name); setBusy(false); }}>Save name</button></div>{error && <p className="tc-form-error">{error}</p>}</section>
    <section className="tc-panel"><span>DISPLAY</span><h3>{currency}</h3><div className="tc-choice">{["EUR", "USD", "PLN", "UAH"].map((item) => <button key={item} className={currency === item ? "on" : ""} onClick={() => onCurrency(item)}>{item}</button>)}</div><button onClick={() => onPrivacy(!privacy)}>{privacy ? <Eye size={15} /> : <EyeOff size={15} />} {privacy ? "Show amounts" : "Hide amounts"}</button></section>
    <section className="tc-panel"><span>MEMBERSHIP</span><h3>{plan}</h3><p>{nativeApp ? "Your membership and unlocked features sync automatically with your Trek account." : "Manage payments, invoices or cancellation through Stripe’s secure customer portal."}</p>{nativeApp ? <button onClick={onUpgrade}><CreditCard size={15} /> View plan features</button> : <button onClick={plan === "Start" ? onUpgrade : onPortal}><CreditCard size={15} /> {plan === "Start" ? "See plans" : "Manage billing"}</button>}</section>
    <section className="tc-panel"><span>YOUR DATA</span><h3>Export a backup</h3><p>{canExport ? "Download your transactions, goals and recurring items." : "Cloud export is available with Plus or Lifetime."}</p><button onClick={canExport ? exportData : onUpgrade}><Download size={15} /> {canExport ? "Export my data" : "Upgrade to export"}</button></section>
    <section className="tc-panel tn-dashboard-settings"><span>DASHBOARD WIDGETS</span><h3>Choose what matters</h3><p>Keep the overview focused on the information you use most.</p>{[["pace","Spending pace"],["signal","Trek signal"],["transactions","Recent transactions"],["goals","Top goal"]].map(([id,label]) => <label key={id}><input type="checkbox" checked={widgets.includes(id)} onChange={() => onWidgets(widgets.includes(id) ? widgets.filter((item) => item !== id) : [...widgets, id])} /> {label}</label>)}</section>
  </div></section>;
}

const parseCsv = (text) => {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const char = text[index]; const next = text[index + 1]; if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { row.push(cell); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell); if (row.some(Boolean)) rows.push(row); return rows;
};

export default function Cabinet({ onExit, onSignOut, user, onProfileUpdate, nativeApp = false }) {
  const [view, setView] = useState("overview"); const [month, setMonth] = useState(monthKey()); const [modal, setModal] = useState(null); const [editing, setEditing] = useState(null);
  const [transactions, setTransactions] = useState([]); const [budgets, setBudgets] = useState([]); const [categoryRows, setCategoryRows] = useState([]); const [goals, setGoals] = useState([]); const [recurring, setRecurring] = useState([]);
  const [currency, setCurrency] = useState("EUR"); const [fallbackBudget, setFallbackBudget] = useState(0); const [privacy, setPrivacy] = useState(false); const [widgets, setWidgets] = useState(["pace", "signal", "transactions", "goals"]); const [plan, setPlan] = useState("Start"); const [avatarUrl, setAvatarUrl] = useState(""); const [profileName, setProfileName] = useState(user.user_metadata?.full_name || user.email?.split("@")[0] || "Member");
  const [loading, setLoading] = useState(true); const [dataError, setDataError] = useState(""); const [notice, setNotice] = useState(false); const [mobileNav, setMobileNav] = useState(false);
  const plus = plan !== "Start";
  const fromTransaction = (row) => ({ id: row.id, merchant: row.merchant, category: row.category, type: row.entry_type, amount: Number(row.amount), date: row.occurred_on, note: row.note || "", tags: row.tags || [], needsReview: row.needs_review || false, color: row.entry_type === "income" ? COLORS[1] : COLORS[CATEGORIES.indexOf(row.category) % COLORS.length] || COLORS[0] });
  const fromGoal = (row) => ({ id: row.id, name: row.name, target: Number(row.target_amount), saved: Number(row.saved_amount), deadline: row.deadline, icon: row.icon, color: row.color, status: row.status });
  const fromRecurring = (row) => ({ id: row.id, merchant: row.merchant, category: row.category, type: row.entry_type, amount: Number(row.amount), day: row.day_of_month, active: row.active, lastPostedMonth: row.last_posted_month });

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
      ]);
      const failed = results.find((result) => result.error);
      if (failed) { if (active) { setDataError(`${failed.error.message}. Run the latest supabase/schema.sql migration.`); setLoading(false); } return; }
      if (!active) return;
      const [profileResult, settingsResult, transactionResult, subscriptionResult, budgetResult, categoryResult, goalResult, recurringResult] = results;
      setProfileName(profileResult.data.full_name || user.email?.split("@")[0] || "Member"); setCurrency(settingsResult.data.currency || "EUR"); setFallbackBudget(Number(settingsResult.data.monthly_budget || 0)); setPrivacy(Boolean(settingsResult.data.privacy_mode)); setWidgets(Array.isArray(settingsResult.data.dashboard_widgets) ? settingsResult.data.dashboard_widgets : ["pace", "signal", "transactions", "goals"]);
      setTransactions(transactionResult.data.map(fromTransaction)); setPlan(subscriptionResult.data?.status === "active" ? subscriptionResult.data.plan : "Start"); setBudgets(budgetResult.data || []); setCategoryRows(categoryResult.data || []); setGoals(goalResult.data.map(fromGoal)); setRecurring(recurringResult.data.map(fromRecurring));
      if (profileResult.data.avatar_path) { const signed = await supabase.storage.from("trek-avatars").createSignedUrl(profileResult.data.avatar_path, 3600); if (signed.data?.signedUrl) setAvatarUrl(signed.data.signedUrl); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => { const handler = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setEditing(null); setModal("entry"); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);

  const monthTransactions = useMemo(() => transactions.filter((item) => inMonth(item, month)), [transactions, month]);
  const previousTransactions = useMemo(() => transactions.filter((item) => inMonth(item, shiftMonth(month, -1))), [transactions, month]);
  const budget = Number(budgets.find((row) => row.month_start === month)?.total ?? (month === monthKey() ? fallbackBudget : 0));
  const categoryBudgets = Object.fromEntries(categoryRows.filter((row) => row.month_start === month).map((row) => [row.category, Number(row.amount)]));
  const metrics = useMemo(() => calculateMetrics(monthTransactions, budget, month, recurring), [monthTransactions, budget, month, recurring]);
  const previousMetrics = useMemo(() => calculateMetrics(previousTransactions, Number(budgets.find((row) => row.month_start === shiftMonth(month, -1))?.total || 0), shiftMonth(month, -1), []), [previousTransactions, budgets, month]);
  const setError = (error) => { setDataError(error?.message || String(error)); return false; };
  const saveSettings = async (change) => { const result = await supabase.from("user_settings").update({ ...change, updated_at: new Date().toISOString() }).eq("user_id", user.id); if (result.error) return setError(result.error); if (change.currency) setCurrency(change.currency); if (change.privacy_mode !== undefined) setPrivacy(change.privacy_mode); if (change.dashboard_widgets) setWidgets(change.dashboard_widgets); return true; };
  const saveBudget = async (total) => { const row = { user_id: user.id, month_start: month, total: Math.max(0, total), updated_at: new Date().toISOString() }; const result = await supabase.from("monthly_budgets").upsert(row); if (result.error) return setError(result.error); setBudgets((current) => [...current.filter((item) => item.month_start !== month), row]); return true; };
  const saveCategory = async (category, value, persist) => { const amount = Math.max(0, Number(String(value).replace(",", ".")) || 0); const row = { user_id: user.id, month_start: month, category, amount, updated_at: new Date().toISOString() }; setCategoryRows((current) => [...current.filter((item) => !(item.month_start === month && item.category === category)), row]); if (persist) { const result = await supabase.from("category_budgets").upsert(row); if (result.error) setError(result.error); } };
  const copyPrevious = async () => { const previous = shiftMonth(month, -1); const sourceBudget = budgets.find((row) => row.month_start === previous); const sourceCategories = categoryRows.filter((row) => row.month_start === previous); if (!sourceBudget && !sourceCategories.length) return setDataError("The previous month has no plan to copy."); if (sourceBudget) await saveBudget(Number(sourceBudget.total)); for (const row of sourceCategories) await saveCategory(row.category, row.amount, true); };

  const saveTransaction = async (form) => { const payload = { user_id: user.id, merchant: form.merchant.trim(), category: form.type === "income" ? "Other" : form.category, entry_type: form.type, amount: form.amount, occurred_on: form.date, note: form.note || "", tags: form.tags || [], needs_review: Boolean(form.needsReview) }; const result = form.id ? await supabase.from("transactions").update(payload).eq("id", form.id).select().single() : await supabase.from("transactions").insert(payload).select().single(); if (result.error) return setError(result.error); const next = fromTransaction(result.data); setTransactions((current) => form.id ? current.map((item) => item.id === form.id ? next : item) : [next, ...current]); return true; };
  const removeTransaction = async (id) => { const result = await supabase.from("transactions").delete().eq("id", id); if (result.error) return setError(result.error); setTransactions((current) => current.filter((item) => item.id !== id)); return true; };
  const removeMany = async (ids) => { const result = await supabase.from("transactions").delete().in("id", ids); if (result.error) return setError(result.error); setTransactions((current) => current.filter((item) => !ids.includes(item.id))); return true; };
  const importCsv = async (file) => { if (!plus || !file) { setModal("pricing"); return; } const rows = parseCsv(await file.text()); if (rows.length < 2) return setDataError("The CSV file has no data rows."); const headers = rows[0].map((header) => header.trim().toLowerCase()); const at = (...names) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0); const dateIndex = at("date", "occurred_on"); const merchantIndex = at("merchant", "description", "name"); const amountIndex = at("amount", "value"); const categoryIndex = at("category"); const typeIndex = at("type", "entry_type"); if ([dateIndex, merchantIndex, amountIndex].some((index) => index === undefined)) return setDataError("CSV needs Date, Merchant (or Description), and Amount columns."); const payload = rows.slice(1).map((row) => { const raw = Number(String(row[amountIndex]).replace(/[^0-9,.-]/g, "").replace(",", ".")); return { user_id: user.id, occurred_on: row[dateIndex], merchant: row[merchantIndex] || "Imported", amount: Math.abs(raw), entry_type: row[typeIndex] || (raw < 0 ? "expense" : "income"), category: CATEGORIES.includes(row[categoryIndex]) ? row[categoryIndex] : "Other", note: "Imported from CSV", tags: ["imported"], needs_review: true }; }).filter((row) => row.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.occurred_on)); if (!payload.length) return setDataError("No valid rows found. Dates must use YYYY-MM-DD."); const result = await supabase.from("transactions").insert(payload).select(); if (result.error) return setError(result.error); setTransactions((current) => [...result.data.map(fromTransaction), ...current]); setDataError(""); };

  const createGoal = async (form) => { const result = await supabase.from("goals").insert({ user_id: user.id, name: form.name, target_amount: Number(form.target), deadline: form.deadline || null, icon: form.icon, color: form.color }).select().single(); if (result.error) return setError(result.error); setGoals((current) => [...current, fromGoal(result.data)]); return true; };
  const contribute = async (goal, amount) => { if (!(amount > 0)) return; const saved = Math.min(goal.target, goal.saved + amount); const status = saved >= goal.target ? "completed" : "active"; const result = await supabase.from("goals").update({ saved_amount: saved, status, updated_at: new Date().toISOString() }).eq("id", goal.id); if (result.error) return setError(result.error); setGoals((current) => current.map((item) => item.id === goal.id ? { ...item, saved, status } : item)); };
  const archiveGoal = async (id) => { const result = await supabase.from("goals").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id); if (result.error) return setError(result.error); setGoals((current) => current.filter((item) => item.id !== id)); };
  const createRecurring = async (form) => { const result = await supabase.from("recurring_items").insert({ user_id: user.id, merchant: form.merchant, category: form.category, entry_type: form.type, amount: Number(form.amount), day_of_month: Number(form.day) }).select().single(); if (result.error) return setError(result.error); setRecurring((current) => [...current, fromRecurring(result.data)]); return true; };
  const deleteRecurring = async (id) => { const result = await supabase.from("recurring_items").delete().eq("id", id); if (result.error) return setError(result.error); setRecurring((current) => current.filter((item) => item.id !== id)); };
  const postRecurring = async (item) => { if (item.lastPostedMonth === month) return setDataError("This recurring item is already posted for the selected month."); const day = Math.min(item.day, localDate(monthEnd(month)).getDate()); const ok = await saveTransaction({ merchant: item.merchant, category: item.category, type: item.type, amount: item.amount, date: `${month.slice(0, 8)}${String(day).padStart(2, "0")}`, note: "Recurring item", tags: ["recurring"], needsReview: false }); if (!ok) return; const result = await supabase.from("recurring_items").update({ last_posted_month: month, updated_at: new Date().toISOString() }).eq("id", item.id); if (!result.error) setRecurring((current) => current.map((row) => row.id === item.id ? { ...row, lastPostedMonth: month } : row)); };

  const uploadAvatar = async (file) => { if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) throw new Error("Choose a PNG, JPG or WebP image under 2 MB."); const path = `${user.id}/${Date.now()}.${file.name.split(".").pop()?.toLowerCase() || "jpg"}`; const upload = await supabase.storage.from("trek-avatars").upload(path, file, { contentType: file.type }); if (upload.error) throw upload.error; const profile = await supabase.from("profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", user.id); if (profile.error) throw profile.error; const signed = await supabase.storage.from("trek-avatars").createSignedUrl(path, 3600); if (signed.error) throw signed.error; setAvatarUrl(signed.data.signedUrl); };
  const updateProfile = async (name) => { const next = name.trim() || profileName; const result = await supabase.from("profiles").update({ full_name: next, updated_at: new Date().toISOString() }).eq("id", user.id); if (result.error) return setError(result.error); await onProfileUpdate(next); setProfileName(next); return true; };
  const authenticatedFetch = async (url, options = {}) => { const session = await supabase.auth.getSession(); return fetch(apiUrl(url), { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.data.session?.access_token || ""}`, ...(options.headers || {}) } }); };
  const scanReceipt = async (file) => {
    const image = await prepareReceiptImage(file);
    const response = await authenticatedFetch("/api/receipt", { method: "POST", body: JSON.stringify({ image }) });
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
  else if (view === "transactions") page = <TransactionsPage items={monthTransactions} currency={currency} hidden={privacy} canImport={plus} onAdd={() => { setEditing(null); setModal("entry"); }} onEdit={(item) => { setEditing(item); setModal("entry"); }} onDelete={removeTransaction} onDeleteMany={removeMany} onImport={importCsv} />;
  else if (view === "plan") page = <PlanPage budget={budget} categoryBudgets={categoryBudgets} metrics={metrics} currency={currency} hidden={privacy} onBudgetSave={saveBudget} onCategorySave={saveCategory} onCopyPrevious={copyPrevious} />;
  else if (view === "recurring") page = <RecurringPage items={recurring} currency={currency} hidden={privacy} canUse={plus} onAdd={() => setModal("recurring")} onPost={postRecurring} onDelete={deleteRecurring} onUpgrade={() => setModal("pricing")} />;
  else if (view === "goals") page = <GoalsPage goals={goals} currency={currency} hidden={privacy} canAddMore={plus || goals.length === 0} onAdd={() => setModal("goal")} onContribute={contribute} onArchive={archiveGoal} onUpgrade={() => setModal("pricing")} />;
  else if (view === "analytics") page = <AnalyticsPage metrics={metrics} previousMetrics={previousMetrics} categoryBudgets={categoryBudgets} currency={currency} hidden={privacy} />;
  else page = <SettingsPage user={user} profileName={profileName} avatarUrl={avatarUrl} currency={currency} plan={plan} privacy={privacy} widgets={widgets} canExport={plus} transactions={transactions} goals={goals} recurring={recurring} onProfile={updateProfile} onAvatar={uploadAvatar} onCurrency={(value) => saveSettings({ currency: value })} onPrivacy={(value) => saveSettings({ privacy_mode: value })} onWidgets={(value) => saveSettings({ dashboard_widgets: value })} onPortal={billingPortal} onUpgrade={() => setModal("pricing")} nativeApp={nativeApp} />;

  if (loading) return <div className="tw-loading">Loading your money space…</div>;
  return <div className={`tc-app${nativeApp ? " tc-native" : ""}`}><aside className="tc-side"><button className="tc-brand" onClick={onExit}><i>↗</i> Trek</button><small>PERSONAL SPACE</small>{NAV.map(([id, label, Icon]) => <button key={id} className={`${view === id ? "on" : ""}${lockedView(id) ? " locked" : ""}`} onClick={() => changeView(id)}><Icon size={17} /> {label}{lockedView(id) ? " · Plus" : ""}</button>)}<div className="tc-side-bottom"><button onClick={() => setModal("pricing")}><CreditCard size={17} /> {plan} plan</button><button onClick={() => setView("settings")}><Settings size={17} /> Settings</button>{!nativeApp && <button onClick={onExit}>← Back to home</button>}<button onClick={onSignOut}><LogOut size={17} /> Sign out</button></div></aside>
    <main className="tc-main"><header className="tc-top"><div className="tc-mobile-brand"><button onClick={() => setMobileNav(!mobileNav)} aria-label="Open navigation"><Menu size={19} /></button><span className="tc-mobile-mark" aria-hidden="true">↗</span><b>Trek</b></div><div className="tn-top-center">{view !== "settings" && <MonthControl value={month} onChange={setMonth} />}</div><div className="tc-top-actions"><button onClick={() => setNotice(!notice)} aria-label="Open notifications"><Bell size={18} /></button><button onClick={() => setPrivacy(!privacy)} title="Temporarily hide amounts" aria-label={privacy ? "Show amounts" : "Hide amounts"}>{privacy ? <Eye size={17} /> : <EyeOff size={17} />}</button>{avatarUrl ? <img className="tc-top-avatar" src={avatarUrl} alt="Profile" /> : <span>{profileName.charAt(0).toUpperCase()}</span>}</div>{notice && <div className="tc-notice"><b>{metrics.score >= 70 ? "Your pace looks healthy" : "Your plan needs attention"}</b><p>{money(metrics.upcoming, currency, privacy)} in upcoming recurring expenses.</p></div>}{mobileNav && <div className="tc-mobile-menu">{NAV.map(([id, label, Icon]) => <button key={id} onClick={() => { changeView(id); setMobileNav(false); }}><Icon size={16} /> {label}</button>)}<button onClick={() => { setView("settings"); setMobileNav(false); }}><Settings size={16} /> Settings</button></div>}</header>{dataError && <div className="tn-error"><AlertTriangle size={16} /> <span>{dataError}</span><button onClick={() => setDataError("")}><X size={15} /></button></div>}{page}</main>
    {nativeApp && <nav className="tm-bottom-nav" aria-label="Main navigation"><button className={view === "overview" ? "on" : ""} onClick={() => changeView("overview")}><LayoutDashboard size={20} /><span>Overview</span></button><button className={view === "transactions" ? "on" : ""} onClick={() => changeView("transactions")}><ReceiptText size={20} /><span>Activity</span></button><button className="tm-add" onClick={() => { setEditing(null); setModal("entry"); }} aria-label="Add transaction"><Plus size={25} /></button><button className={view === "plan" ? "on" : ""} onClick={() => changeView("plan")}><CalendarDays size={20} /><span>Plan</span></button><button className={mobileNav || ["recurring", "goals", "analytics", "settings"].includes(view) ? "on" : ""} onClick={() => setMobileNav((current) => !current)}><Menu size={20} /><span>More</span></button></nav>}
    {modal === "entry" && <EntryModal initial={editing ? { ...editing, amount: String(editing.amount), tags: editing.tags || [] } : null} month={month} onClose={() => setModal(null)} onSave={saveTransaction} onScan={scanReceipt} />}
    {modal === "goal" && <GoalModal onClose={() => setModal(null)} onSave={createGoal} />}
    {modal === "recurring" && <RecurringModal onClose={() => setModal(null)} onSave={createRecurring} />}
    {modal === "coach" && <CoachModal onClose={() => setModal(null)} onAsk={askCoach} />}
    {modal === "pricing" && <PricingModal plan={plan} user={user} onClose={() => setModal(null)} onCheckout={checkout} nativeApp={nativeApp} />}
  </div>;
}
