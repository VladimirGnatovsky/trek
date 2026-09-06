import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Coffee,
  CreditCard,
  Download,
  HeartPulse,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Music2,
  Plus,
  ReceiptText,
  Settings,
  ShoppingBag,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  Car,
  Wallet,
  X,
} from "lucide-react";
import "./cabinet.css";
import "./cabinet-extra.css";
import "./profile.css";
import "./coach.css";
import { supabase } from "./supabase.js";

const seed = [
  {
    id: 1,
    merchant: "Whole Foods",
    category: "Groceries",
    amount: 842,
    date: "2026-09-04",
    icon: "W",
    color: "#00e5a0",
  },
  {
    id: 2,
    merchant: "Uber",
    category: "Transport",
    amount: 286,
    date: "2026-09-04",
    icon: "U",
    color: "#ff795e",
  },
  {
    id: 3,
    merchant: "Spotify",
    category: "Subscriptions",
    amount: 89,
    date: "2026-09-03",
    icon: "S",
    color: "#00e5a0",
  },
  {
    id: 4,
    merchant: "Coffee Room",
    category: "Coffee",
    amount: 164,
    date: "2026-09-03",
    icon: "C",
    color: "#ffcc66",
  },
];
const categories = [
  "Groceries",
  "Transport",
  "Subscriptions",
  "Coffee",
  "Shopping",
  "Housing",
  "Health",
  "Fun",
  "Other",
];
const currencySymbols = { UAH: "₴", PLN: "zł", EUR: "€", USD: "$" };
let activeCurrency = "EUR";
const money = (n) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} ${currencySymbols[activeCurrency] || activeCurrency}`;
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["transactions", "Transactions", ReceiptText],
  ["plan", "Monthly plan", CalendarDays],
  ["goals", "Goals", Target],
  ["analytics", "Analytics", BarChart3],
];
const categoryIcons = {
  Groceries: ShoppingBag,
  Transport: Car,
  Subscriptions: Music2,
  Coffee: Coffee,
  Shopping: ShoppingBag,
  Housing: Home,
  Health: HeartPulse,
  Fun: Sparkles,
  Other: CircleDollarSign,
};
function CategoryIcon({ category, size = 16 }) {
  const Icon = categoryIcons[category] || CircleDollarSign;
  return <Icon size={size} aria-hidden="true" />;
}
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
function getMetrics(items, budget, goalSaved) {
  const expenses = items.filter((x) => x.type !== "income"),
    income = items.filter((x) => x.type === "income");
  const spending = expenses.reduce((s, x) => s + x.amount, 0),
    earned = income.reduce((s, x) => s + x.amount, 0);
  const dates = expenses
    .map((x) => new Date(x.date))
    .filter((x) => !Number.isNaN(+x));
  const asOf = dates.length ? new Date(Math.max(...dates)) : new Date();
  const day = Math.max(1, asOf.getDate());
  const daily = spending / day,
    forecast = daily * 30,
    remaining = Math.max(0, budget - spending),
    over = Math.max(0, forecast - budget);
  const score = clamp(
    Math.round(100 - (over / Math.max(budget, 1)) * 100),
    0,
    100
  );
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(asOf);
    d.setDate(asOf.getDate() - 6 + i);
    const key = d.toISOString().slice(0, 10);
    return {
      label: d.toLocaleDateString("en-US", { weekday: "narrow" }),
      value: expenses
        .filter((x) => x.date === key)
        .reduce((s, x) => s + x.amount, 0),
    };
  });
  const max = Math.max(...days.map((x) => x.value), 1);
  return {
    spending,
    earned,
    budget,
    remaining,
    forecast,
    daily,
    score,
    asOf,
    day,
    days: days.map((x) => ({
      ...x,
      height: Math.max(8, Math.round((x.value / max) * 100)),
    })),
    goalSaved,
  };
}

function Chart({ days = [] }) {
  return (
    <div className="tc-chart">
      {days.map((day, i) => (
        <div className="tc-bar" key={i}>
          <i
            style={{ height: day.height + "%" }}
            className={i === days.length - 1 ? "active" : ""}
          />
          <small>{day.label}</small>
        </div>
      ))}
    </div>
  );
}
function SpendDonut({ items, total }) {
  const colors = ["#00e5a0", "#59a9ff", "#ffcc66", "#ff795e", "#b883ff"];
  let start = 0;
  const stops = items.map(([name, value], i) => {
    const end = start + (value / total) * 100;
    const segment = `${colors[i % colors.length]} ${start}% ${end}%`;
    start = end;
    return segment;
  });
  return (
    <div className="tc-donut-wrap">
      <div
        className="tc-donut"
        style={{ background: `conic-gradient(${stops.join(",")})` }}
      >
        <div>
          <b>{items.length}</b>
          <span>
            active
            <br />
            categories
          </span>
        </div>
      </div>
      <div className="tc-donut-key">
        {items.slice(0, 4).map(([name, value], i) => (
          <span key={name}>
            <i style={{ background: colors[i] }} />
            {name} <b>{Math.round((value / total) * 100)}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}
function Modal({ children, onClose }) {
  return (
    <div className="tc-modal" onMouseDown={onClose}>
      <div className="tc-modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <button className="tc-close" onClick={onClose}>
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  );
}
function Score({ value = 78 }) {
  return (
    <div className="tc-score" style={{ "--score": `${value * 3.6}deg` }}>
      <div>
        <b>{value}</b>
        <span>
          pulse
          <br />
          score
        </span>
      </div>
    </div>
  );
}

function Overview({ transactions, metrics, onAdd, setView, onPlan, onGoal, onCoach }) {
  const pace =
    metrics.forecast > metrics.budget
      ? `${money(metrics.forecast - metrics.budget)} over plan at this pace`
      : `${money(metrics.budget - metrics.forecast)} below plan at this pace`;
  return (
    <>
      <section className="tc-hero">
        <div>
          <span>BUDGET REMAINING · DAY {metrics.day}</span>
          <h2>{money(metrics.remaining)}</h2>
          <p>
            <i /> {pace}
          </p>
        </div>
        <Score value={metrics.score} />
        <button className="tc-action" onClick={onAdd}>
          <Plus size={17} /> Add transaction
        </button>
      </section>
      <div className="tc-kpis">
        <div>
          <span>SPENT</span>
          <b>{money(metrics.spending)}</b>
          <small>of {money(metrics.budget)} budget</small>
        </div>
        <div>
          <span>DAILY PACE</span>
          <b>{money(metrics.daily)}</b>
          <small>projected {money(metrics.forecast)}</small>
        </div>
        <div>
          <span>INCOME LOGGED</span>
          <b>{money(metrics.earned)}</b>
          <small>this month</small>
        </div>
      </div>
      <div className="tc-grid">
        <section className="tc-panel tc-spend">
          <header>
            <div>
              <span>LAST 7 DAYS</span>
              <h3>{money(metrics.spending)} spent</h3>
            </div>
            <button onClick={() => setView("analytics")}>
              View analytics <ChevronRight size={14} />
            </button>
          </header>
          <Chart days={metrics.days} />
          <footer>
            <span>
              <i /> Daily spending
            </span>
            <span>Based on logged transactions</span>
          </footer>
        </section>
        <section className="tc-panel tc-signal">
          <div className="tc-signal-icon">
            <Sparkles size={18} />
          </div>
          <span>TREK SIGNAL</span>
          <h3>
            {metrics.forecast > metrics.budget
              ? "Your current pace will exceed the budget"
              : "Your current pace is inside the budget"}
          </h3>
          <p>
            {metrics.forecast > metrics.budget
              ? `To finish inside plan, reduce the remaining pace by ${money(
                  (metrics.forecast - metrics.budget) /
                    Math.max(1, 30 - metrics.day)
                )} per day.`
              : `You are projected to keep ${money(
                  metrics.budget - metrics.forecast
                )} unspent by month end.`}
          </p>
          <div className="tc-signal-actions">
            <button onClick={onPlan}>
              Review the plan <ChevronRight size={15} />
            </button>
            <button onClick={onCoach}>
              Ask the coach <Sparkles size={14} />
            </button>
          </div>
        </section>
        <section className="tc-panel tc-list">
          <header>
            <div>
              <span>RECENT TRANSACTIONS</span>
              <h3>
                {transactions.length ? "Latest activity" : "No activity yet"}
              </h3>
            </div>
            <button onClick={() => setView("transactions")}>
              All transactions <ChevronRight size={14} />
            </button>
          </header>
          {transactions.slice(0, 4).map((t) => (
            <Transaction key={t.id} item={t} />
          ))}
        </section>
        <section className="tc-panel tc-goal">
          <div className="tc-goal-icon">✈</div>
          <span>GOAL</span>
          <h3>Italy summer trip</h3>
          <div className="tc-progress">
            <i style={{ width: `${metrics.goalSaved / 400}%` }} />
          </div>
          <p>
            <b>{money(metrics.goalSaved)}</b> of {money(40000)}{" "}
            <em>{Math.round(metrics.goalSaved / 400)}%</em>
          </p>
          <button onClick={onGoal}>
            Open goal <ChevronRight size={15} />
          </button>
        </section>
      </div>
    </>
  );
}
function Transaction({ item, onDelete }) {
  const income = item.type === "income";
  return (
    <div className="tc-transaction" data-date={item.date}>
      <span
        className="tc-txn-icon"
        style={{ background: item.color + "20", color: item.color }}
      >
        <CategoryIcon category={item.category} />
      </span>
      <div>
        <b>{item.merchant}</b>
        <small>
          {income ? "Income" : item.category} · {item.date}
        </small>
      </div>
      <em className={income ? "tc-income" : ""}>
        {income ? "+" : "−"} {money(item.amount)}
      </em>
      {onDelete && (
        <button
          onClick={() => onDelete(item.id)}
          aria-label="Delete transaction"
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
function Transactions({ items, metrics, onAdd, onDelete, onClear }) {
  return (
    <section className="tc-page">
      <div className="tc-page-head">
        <div>
          <span>YOUR RECORDS</span>
          <h2>Transactions</h2>
          <p>
            {items.length} entries · expenses and income update the dashboard
            immediately.
          </p>
        </div>
        <button className="tc-action" onClick={onAdd}>
          <Plus size={17} /> Add transaction
        </button>
      </div>
      <section className="tc-panel tc-table">
        <header>
          <div>
            <span>THIS MONTH</span>
            <h3>
              {money(metrics.spending)} spent · {money(metrics.earned)} income
            </h3>
          </div>
          <button onClick={onClear}>Clear month</button>
        </header>
        <div className="tc-table-head">
          <span>Date</span>
          <span>Merchant</span>
          <span>Category</span>
          <span>Amount</span>
          <span />
        </div>
        {items.length ? (
          items.map((t) => (
            <Transaction key={t.id} item={t} onDelete={onDelete} />
          ))
        ) : (
          <div className="tc-empty">
            <ReceiptText size={24} />
            <b>No transactions yet</b>
            <span>Add your first expense or income to start your month.</span>
          </div>
        )}
      </section>
    </section>
  );
}
function Plan({ onAdd, budget, onBudgetSave, metrics }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(budget));
  const rows = [
    ["Housing", 11000, "#00e5a0"],
    ["Groceries", 6500, "#59a9ff"],
    ["Transport", 3000, "#ff795e"],
    ["Coffee & eating out", 3400, "#ffcc66"],
    ["Everything else", 6100, "#b883ff"],
  ];
  const save = () => {
    onBudgetSave(Math.max(0, Number(value) || 0));
    setEditing(false);
  };
  return (
    <section className="tc-page">
      <div className="tc-page-head">
        <div>
          <span>SEPTEMBER 2026</span>
          <h2>Monthly plan</h2>
          <p>Your budget and dashboard use the same numbers.</p>
        </div>
        <button className="tc-action" onClick={onAdd}>
          <Plus size={17} /> Log transaction
        </button>
      </div>
      <div className="tc-plan-total">
        <div>
          <span>MONTHLY BUDGET</span>
          {editing ? (
            <div className="tc-inline">
              <input value={value} onChange={(e) => setValue(e.target.value)} />
              <button onClick={save}>Save</button>
            </div>
          ) : (
            <h3>{money(budget)}</h3>
          )}
          <p>
            {money(metrics.spending)} spent · {money(metrics.remaining)}{" "}
            remaining
          </p>
        </div>
        <button onClick={() => setEditing(!editing)}>
          {editing ? "Cancel" : "Edit budget"}
        </button>
      </div>
      <section className="tc-panel tc-budget-list">
        <header>
          <span>SUGGESTED CATEGORY ENVELOPES</span>
          <span>
            {money(rows.reduce((s, x) => s + x[1], 0))} reference plan
          </span>
        </header>
        {rows.map(([name, amount, color]) => (
          <div className="tc-budget-row" key={name}>
            <div>
              <i style={{ background: color }} />
              <b>{name}</b>
            </div>
            <div>
              <span>
                <i
                  style={{
                    width: Math.min(100, (amount / budget) * 100) + "%",
                    background: color,
                  }}
                />
              </span>
              <em>{money(amount)}</em>
            </div>
          </div>
        ))}
      </section>
    </section>
  );
}
function Goals({ onAdd, saved, onGoalSave }) {
  const [contrib, setContrib] = useState("");
  const add = (e) => {
    e.preventDefault();
    const n = Number(contrib.replace(",", "."));
    if (n > 0) {
      onGoalSave(Math.min(40000, saved + n));
      setContrib("");
    }
  };
  return (
    <section className="tc-page">
      <div className="tc-page-head">
        <div>
          <span>MAKE ROOM FOR WHAT MATTERS</span>
          <h2>Goals</h2>
          <p>Every contribution updates the overview immediately.</p>
        </div>
        <button className="tc-action" onClick={onAdd}>
          <Plus size={17} /> Add transaction
        </button>
      </div>
      <section className="tc-panel tc-goal-detail">
        <div className="tc-goal-big">✈</div>
        <div>
          <span>SUMMER 2027</span>
          <h3>Italy summer trip</h3>
          <p>Flights, slow mornings and pasta with no spreadsheet in sight.</p>
        </div>
        <div className="tc-goal-number">
          <b>{money(saved)}</b>
          <span>of {money(40000)}</span>
          <em>{Math.round(saved / 400)}%</em>
        </div>
        <div className="tc-progress full">
          <i style={{ width: saved / 400 + "%" }} />
        </div>
        <form onSubmit={add}>
          <label>
            Add to this goal
            <input
              inputMode="decimal"
              placeholder="0"
              value={contrib}
              onChange={(e) => setContrib(e.target.value)}
            />
          </label>
          <button className="tc-action">
            Save amount <Plus size={15} />
          </button>
        </form>
      </section>
    </section>
  );
}
function Analytics({ transactions, metrics }) {
  const expenses = transactions.filter((t) => t.type !== "income");
  const by = categories
    .map((c) => [
      c,
      expenses
        .filter((t) => t.category === c)
        .reduce((s, t) => s + t.amount, 0),
    ])
    .filter((x) => x[1]);
  return (
    <section className="tc-page">
      <div className="tc-page-head">
        <div>
          <span>THE BIGGER PICTURE</span>
          <h2>Analytics</h2>
          <p>
            Every figure below is calculated from this month’s logged
            transactions.
          </p>
        </div>
      </div>
      <div className="tc-grid analytics">
        <section className="tc-panel tc-spend">
          <header>
            <div>
              <span>LAST 7 DAYS</span>
              <h3>{money(metrics.daily)} average per day</h3>
            </div>
          </header>
          <Chart days={metrics.days} />
        </section>
        <section className="tc-panel tc-signal">
          <div className="tc-signal-icon">
            <Sparkles size={18} />
          </div>
          <span>MONTH-END FORECAST</span>
          <h3>{money(metrics.forecast)} at current pace</h3>
          <p>
            {metrics.forecast > metrics.budget
              ? `${money(metrics.forecast - metrics.budget)} above your ${money(
                  metrics.budget
                )} budget.`
              : `${money(
                  metrics.budget - metrics.forecast
                )} remains if this pace holds.`}
          </p>
        </section>
        <section className="tc-panel tc-breakdown">
          <header>
            <span>WHERE IT WENT</span>
          </header>
          {by.length ? (
            <>
              <SpendDonut items={by} total={metrics.spending} />
              {by.map(([name, value]) => (
                <div key={name}>
                  <p>
                    <span>
                      <CategoryIcon category={name} size={14} />
                      {name}
                    </span>
                    <b>
                      {money(value)} ·{" "}
                      {Math.round((value / metrics.spending) * 100)}%
                    </b>
                  </p>
                  <i>
                    <em
                      style={{ width: (value / metrics.spending) * 100 + "%" }}
                    />
                  </i>
                </div>
              ))}
            </>
          ) : (
            <div className="tc-empty">
              Add expense transactions to see your breakdown.
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
function SettingsPage({
  plan,
  transactions,
  user,
  onProfileUpdate,
  currency,
  onCurrencyChange,
  canExport,
  onUpgrade,
  avatarUrl,
  onAvatarUpload,
}) {
  const initialName =
    user?.user_metadata?.full_name?.trim() || user?.email?.split("@")[0] || "Member";
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const saveProfile = async () => {
    const nextName = name.trim() || initialName;
    try {
      setSaving(true);
      setProfileError("");
      await onProfileUpdate(nextName);
      setName(nextName);
      setEditing(false);
    } catch (error) {
      setProfileError(error.message || "Could not update the profile.");
    } finally {
      setSaving(false);
    }
  };
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              transactions,
              plan,
              currency,
              exportedAt: new Date().toISOString(),
            },
            null,
            2
          ),
        ],
        { type: "application/json" }
      )
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "trek-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setAvatarBusy(true);
      setProfileError("");
      await onAvatarUpload(file);
    } catch (error) {
      setProfileError(error.message || "Could not upload the image.");
    } finally {
      setAvatarBusy(false);
      event.target.value = "";
    }
  };
  return (
    <section className="tc-page">
      <div className="tc-page-head">
        <div>
          <span>ACCOUNT</span>
          <h2>Settings</h2>
          <p>Control preferences and your Trek membership.</p>
        </div>
      </div>
      <div className="tc-settings">
        <section className="tc-panel">
          <span>PROFILE</span>
          {editing ? (
            <div className="tc-inline">
              <input value={name} onChange={(e) => setName(e.target.value)} />
              <button onClick={saveProfile} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <>
              <div className="tc-profile-row">
                {avatarUrl ? (
                  <img className="tc-profile-avatar" src={avatarUrl} alt="Profile" />
                ) : (
                  <span className="tc-profile-avatar">{(name || initialName).charAt(0).toUpperCase()}</span>
                )}
                <div>
                  <h3>{name || initialName}</h3>
                  <p>{user?.email || "No email available"}</p>
                </div>
              </div>
            </>
          )}
          {profileError && <p className="tc-form-error">{profileError}</p>}
          <label className="tc-upload">
            {avatarBusy ? "Uploading…" : "Upload photo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAvatar} disabled={avatarBusy} />
          </label>
          <button onClick={() => setEditing(!editing)}>
            {editing ? "Cancel" : "Change profile"}
          </button>
        </section>
        <section className="tc-panel">
          <span>DISPLAY CURRENCY</span>
          <h3>{currency}</h3>
          <div className="tc-choice">
            {["UAH", "PLN", "EUR", "USD"].map((c) => (
              <button
                onClick={() => onCurrencyChange(c)}
                className={currency === c ? "on" : ""}
                key={c}
              >
                {c}
              </button>
            ))}
          </div>
        </section>
        <section className="tc-panel">
          <span>CURRENT PLAN</span>
          <h3>{plan}</h3>
          <p>
            {plan === "Start"
              ? "Local tracking, budgets and goals."
              : "Plan is active in this browser demo."}
          </p>
          <button disabled>Managed through billing</button>
        </section>
        <section className="tc-panel">
          <span>YOUR DATA</span>
          <h3>Export a backup</h3>
          <p>
            {canExport
              ? "Download your current cloud data any time."
              : "Cloud exports are available with Plus or Lifetime."}
          </p>
          <button onClick={canExport ? exportData : onUpgrade}>
            <Download size={15} /> {canExport ? "Export my data" : "Upgrade to export"}
          </button>
        </section>
      </div>
    </section>
  );
}
function Pricing({ plan, onClose }) {
  const choices = [
    {
      name: "Start",
      price: "0",
      copy: "For the daily money habit.",
      items: [
        "Manual expenses and income",
        "Monthly plan and goals",
        "Works offline",
      ],
    },
    {
      name: "Plus",
      price: "6",
      copy: "For a clearer financial rhythm.",
      items: [
        "Everything in Start",
        "Unlimited insights",
        "Future sync and export",
      ],
    },
    {
      name: "Lifetime",
      price: "149",
      copy: "One payment. No recurring bill.",
      items: ["Everything in Plus", "Lifetime access", "Priority features"],
    },
  ];
  return (
    <Modal onClose={onClose}>
      <span className="tc-kicker">MEMBERSHIP</span>
      <h2>Choose your Trek mode.</h2>
      <p className="tc-modal-copy">
        Membership changes only after secure payment confirmation. Trek never
        receives or stores card details.
      </p>
      <div className="tc-prices">
        {choices.map((x) => (
          <article key={x.name} className={plan === x.name ? "selected" : ""}>
            <span>{x.name}</span>
            <h3>
              {x.price === "0" ? "Free" : `€${x.price}`}{" "}
              <small>{x.name === "Lifetime" ? "once" : "/ month"}</small>
            </h3>
            <p>{x.copy}</p>
            <ul>
              {x.items.map((i) => (
                <li key={i}>
                  <Check size={13} />
                  {i}
                </li>
              ))}
            </ul>
            <button
              disabled={plan === x.name}
              onClick={() => {
                if (x.name === "Start") return;
                const key =
                  x.name === "Plus"
                    ? "VITE_CHECKOUT_PLUS_URL"
                    : "VITE_CHECKOUT_LIFETIME_URL";
                const checkoutUrl = window.__TREK_ENV__?.[key];
                if (!checkoutUrl) {
                  window.alert(
                    "Checkout is not configured yet. Add the payment-link URL in Railway before offering this plan."
                  );
                  return;
                }
                window.location.assign(checkoutUrl);
              }}
            >
              {plan === x.name
                ? "Current plan"
                : x.name === "Start"
                ? "Included"
                : `Continue to secure payment`}
            </button>
          </article>
        ))}
      </div>
    </Modal>
  );
}
function AddModal({ onClose, onSave }) {
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [type, setType] = useState("expense");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const n = Number(amount.replace(",", "."));
    if (merchant && n > 0) {
      setBusy(true);
      const saved = await onSave({
        merchant,
        category: type === "income" ? "Other" : category,
        type,
        amount: n,
        date: new Date().toISOString().slice(0, 10),
        color: type === "income" ? "#59a9ff" : "#00e5a0",
      });
      setBusy(false);
      if (saved) onClose();
    }
  };
  return (
    <Modal onClose={onClose}>
      <span className="tc-kicker">NEW TRANSACTION</span>
      <h2>Log an entry</h2>
      <form className="tc-form" onSubmit={submit}>
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>
        <label>
          {type === "income" ? "Source" : "Merchant"}
          <input
            autoFocus
            placeholder={type === "income" ? "e.g. Salary" : "e.g. Coffee Room"}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          />
        </label>
        <label>
          Amount
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {type === "expense" && (
          <label>
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
        <button className="tc-action" disabled={busy}>
          {busy ? "Saving…" : `Save ${type}`} <Plus size={16} />
        </button>
      </form>
    </Modal>
  );
}

function CoachModal({ onClose, onAsk }) {
  const [question, setQuestion] = useState("What is the best next step for my budget this month?");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      setAnswer(await onAsk(question));
    } catch (requestError) {
      setError(requestError.message || "Coach is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <span className="tc-kicker">TREK COACH · AI</span>
      <h2>Ask about your money pace.</h2>
      <p className="tc-modal-copy">
        The coach receives only your aggregated budget figures, never your email or transaction names. Its guidance is educational, not financial advice.
      </p>
      <form className="tc-form" onSubmit={submit}>
        <label>
          Your question
          <textarea value={question} onChange={(event) => setQuestion(event.target.value)} maxLength="600" />
        </label>
        <button className="tc-action" disabled={busy}>
          <Sparkles size={16} /> {busy ? "Thinking…" : "Ask the coach"}
        </button>
      </form>
      {error && <p className="tc-form-error">{error}</p>}
      {answer && <article className="tc-coach-answer">{answer}</article>}
    </Modal>
  );
}

export default function Cabinet({ onExit, onSignOut, user, onProfileUpdate }) {
  const [view, setView] = useState("overview"),
    [transactions, setTransactions] = useState([]),
    [modal, setModal] = useState(null),
    [plan, setPlan] = useState("Start"),
    [notice, setNotice] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [budget, setBudget] = useState(30000),
    [goalSaved, setGoalSaved] = useState(0),
    [currency, setCurrency] = useState("EUR"),
    [avatarUrl, setAvatarUrl] = useState(""),
    [loading, setLoading] = useState(true),
    [dataError, setDataError] = useState("");
  const dbToTransaction = (row) => ({
    id: row.id,
    merchant: row.merchant,
    category: row.category,
    type: row.entry_type,
    amount: Number(row.amount),
    date: row.occurred_on,
    color: row.entry_type === "income" ? "#59a9ff" : "#00e5a0",
  });
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setDataError("");
      const profile = {
        id: user.id,
        full_name: user.user_metadata?.full_name || "",
        email: user.email || "",
        updated_at: new Date().toISOString(),
      };
      const { error: profileError } = await supabase.from("profiles").upsert(profile);
      if (profileError) {
        if (active) {
          setDataError(profileError.message);
          setLoading(false);
        }
        return;
      }
      const [settingsResult, transactionsResult, subscriptionResult, avatarResult] = await Promise.all([
        supabase.from("user_settings").select("*").eq("user_id", user.id).single(),
        supabase.from("transactions").select("*").eq("user_id", user.id).order("occurred_on", { ascending: false }),
        supabase.from("subscriptions").select("plan, status").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle(),
      ]);
      const error = settingsResult.error || transactionsResult.error || subscriptionResult.error || avatarResult.error;
      if (error) {
        if (active) {
          setDataError(error.message);
          setLoading(false);
        }
        return;
      }
      if (!active) return;
      const settings = settingsResult.data;
      setTransactions((transactionsResult.data || []).map(dbToTransaction));
      setBudget(Number(settings?.monthly_budget || 30000));
      setGoalSaved(Number(settings?.goal_saved || 0));
      setCurrency(settings?.currency || "EUR");
      setPlan(subscriptionResult.data?.status === "active" ? subscriptionResult.data.plan : "Start");
      if (avatarResult.data?.avatar_path) {
        const { data: signedAvatar } = await supabase.storage
          .from("trek-avatars")
          .createSignedUrl(avatarResult.data.avatar_path, 60 * 60);
        if (signedAvatar?.signedUrl && active) setAvatarUrl(signedAvatar.signedUrl);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [user.id]);
  const saveSettings = async (change) => {
    const next = {
      user_id: user.id,
      currency,
      monthly_budget: budget,
      goal_saved: goalSaved,
      ...change,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("user_settings").upsert(next);
    if (error) {
      setDataError(error.message);
      return false;
    }
    if (change.currency) setCurrency(change.currency);
    if (change.monthly_budget !== undefined) setBudget(Number(change.monthly_budget));
    if (change.goal_saved !== undefined) setGoalSaved(Number(change.goal_saved));
    return true;
  };
  const uploadAvatar = async (file) => {
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      throw new Error("Choose a PNG, JPG or WebP image under 2 MB.");
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("trek-avatars")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (profileError) throw profileError;
    const { data: signedAvatar, error: urlError } = await supabase.storage
      .from("trek-avatars")
      .createSignedUrl(path, 60 * 60);
    if (urlError) throw urlError;
    setAvatarUrl(signedAvatar.signedUrl);
  };
  const metrics = useMemo(
    () => getMetrics(transactions, budget, goalSaved),
    [transactions, budget, goalSaved]
  );
  const add = async (t) => {
    const { data, error } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        merchant: t.merchant,
        category: t.category,
        entry_type: t.type,
        amount: t.amount,
        occurred_on: t.date,
      })
      .select()
      .single();
    if (error) {
      setDataError(error.message);
      return false;
    }
    setTransactions((p) => [dbToTransaction(data), ...p]);
    return true;
  };
  const remove = async (id) => {
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) return setDataError(error.message);
    setTransactions((p) => p.filter((t) => t.id !== id));
  };
  const clear = async () => {
    const { error } = await supabase.from("transactions").delete().eq("user_id", user.id);
    if (error) return setDataError(error.message);
    setTransactions([]);
  };
  const askCoach = async (question) => {
    const expenses = transactions.filter((item) => item.type !== "income");
    const categoriesSummary = categories
      .map((category) => ({
        category,
        amount: expenses
          .filter((item) => item.category === category)
          .reduce((sum, item) => sum + item.amount, 0),
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch("/api/coach", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
      },
      body: JSON.stringify({
        question,
        summary: {
          currency,
          budget: metrics.budget,
          spent: metrics.spending,
          income: metrics.earned,
          remaining: metrics.remaining,
          daily_pace: metrics.daily,
          month_end_forecast: metrics.forecast,
          pulse_score: metrics.score,
          goal_saved: metrics.goalSaved,
          goal_target: 40000,
          top_categories: categoriesSummary,
        },
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Coach is unavailable right now.");
    return body.answer;
  };
  const common = { onAdd: () => setModal("add"), setView };
  let page =
    view === "overview" ? (
      <Overview
        {...common}
        transactions={transactions}
        metrics={metrics}
        onPlan={() => setView("plan")}
        onGoal={() => setView("goals")}
        onCoach={() => setModal("coach")}
      />
    ) : view === "transactions" ? (
      <Transactions
        items={transactions}
        metrics={metrics}
        onAdd={common.onAdd}
        onDelete={remove}
        onClear={clear}
      />
    ) : view === "plan" ? (
      <Plan
        onAdd={common.onAdd}
        budget={budget}
        onBudgetSave={(value) => saveSettings({ monthly_budget: value })}
        metrics={metrics}
      />
    ) : view === "goals" ? (
      <Goals onAdd={common.onAdd} saved={goalSaved} onGoalSave={(value) => saveSettings({ goal_saved: value })} />
    ) : view === "analytics" ? (
      <Analytics transactions={transactions} metrics={metrics} />
    ) : (
      <SettingsPage
        plan={plan}
        transactions={transactions}
        user={user}
        onProfileUpdate={onProfileUpdate}
        currency={currency}
        onCurrencyChange={(value) => saveSettings({ currency: value })}
        canExport={plan !== "Start"}
        onUpgrade={() => setModal("plans")}
        avatarUrl={avatarUrl}
        onAvatarUpload={uploadAvatar}
      />
    );
  const displayName =
    user?.user_metadata?.full_name?.trim() || user?.email?.split("@")[0] || "Member";
  const analyticsUnlocked = plan !== "Start";
  activeCurrency = currency;
  if (loading) return <div className="tw-loading">Loading your money space…</div>;
  if (dataError) return <div className="tw-loading">Database setup needed: {dataError}</div>;
  return (
    <div className="tc-app">
      <aside className="tc-side">
        <a className="tc-brand" onClick={onExit}>
          <i><ArrowUpRight size={17} /></i> trek
        </a>
        <small>PERSONAL SPACE</small>
        {nav.map(([id, label, Icon]) => {
          const locked = id === "analytics" && !analyticsUnlocked;
          return (
          <button
            key={id}
            onClick={() => (locked ? setModal("plans") : setView(id))}
            className={`${view === id ? "on" : ""}${locked ? " locked" : ""}`}
          >
            <Icon size={17} />
            {label}{locked ? " · Plus" : ""}
          </button>
          );
        })}
        <div className="tc-side-bottom">
          <button onClick={() => setModal("plans")}>
            <CreditCard size={17} />
            {plan} plan
          </button>
          <button onClick={() => setView("settings")}>
            <Settings size={17} /> Settings
          </button>
          <button onClick={onExit}><ArrowLeft size={16} /> Back to home</button>
          <button onClick={onSignOut}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="tc-main">
        <header className="tc-top">
          <div className="tc-mobile-brand">
            <button onClick={() => setMobileNav(!mobileNav)}>
              <Menu size={19} />
            </button>
            <b>trek</b>
          </div>
          <div className="tc-top-actions">
            <button onClick={() => setNotice(!notice)}>
              <Bell size={18} />
            </button>
            {avatarUrl ? (
              <img className="tc-top-avatar" src={avatarUrl} alt="My profile" />
            ) : (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          {notice && (
            <div className="tc-notice">
              <b>Trek signal</b>
              <p>You are still within your September plan.</p>
            </div>
          )}
          {mobileNav && (
            <div className="tc-mobile-menu">
              {nav.map(([id, label, Icon]) => {
                const locked = id === "analytics" && !analyticsUnlocked;
                return (
                <button
                  key={id}
                  onClick={() => {
                    if (locked) setModal("plans");
                    else setView(id);
                    setMobileNav(false);
                  }}
                >
                  <Icon size={16} />
                  {label}{locked ? " · Plus" : ""}
                </button>
                );
              })}
              <button
                onClick={() => {
                  setView("settings");
                  setMobileNav(false);
                }}
              >
                <Settings size={16} /> Settings
              </button>
              <button onClick={() => setModal("plans")}>
                <CreditCard size={16} /> {plan} plan
              </button>
            </div>
          )}
        </header>
        {page}
      </main>
      {modal === "add" && (
        <AddModal onClose={() => setModal(null)} onSave={add} />
      )}{" "}
      {modal === "plans" && (
        <Pricing plan={plan} onClose={() => setModal(null)} />
      )}
      {modal === "coach" && (
        <CoachModal onClose={() => setModal(null)} onAsk={askCoach} />
      )}
    </div>
  );
}
