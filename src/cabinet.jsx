import React, { useMemo, useState } from "react";
import {
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
const money = (n) =>
  `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)} ₴`;
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

function Overview({ transactions, metrics, onAdd, setView, onPlan, onGoal }) {
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
          <button onClick={onPlan}>
            Review the plan <ChevronRight size={15} />
          </button>
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
            <b>{money(metrics.goalSaved)}</b> of 40,000 ₴{" "}
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
function Plan({ onAdd, budget, setBudget, metrics }) {
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
    setBudget(Math.max(0, Number(value) || 0));
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
function Goals({ onAdd, saved, setSaved }) {
  const [contrib, setContrib] = useState("");
  const add = (e) => {
    e.preventDefault();
    const n = Number(contrib.replace(",", "."));
    if (n > 0) {
      setSaved((s) => Math.min(40000, s + n));
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
          <span>of 40,000 ₴</span>
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
function SettingsPage({ plan, setPlan, transactions }) {
  const [currency, setCurrency] = useState("UAH");
  const [name, setName] = useState("Volodymyr");
  const [editing, setEditing] = useState(false);
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
              <button onClick={() => setEditing(false)}>Save</button>
            </div>
          ) : (
            <>
              <h3>{name}</h3>
              <p>volodymyr@trek.app</p>
            </>
          )}
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
                onClick={() => setCurrency(c)}
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
          <button onClick={() => setPlan("Start")}>Return to Start</button>
        </section>
        <section className="tc-panel">
          <span>YOUR DATA</span>
          <h3>Export a backup</h3>
          <p>Download your current device data any time.</p>
          <button onClick={exportData}>
            <Download size={15} /> Export demo data
          </button>
        </section>
      </div>
    </section>
  );
}
function Pricing({ plan, setPlan, onClose }) {
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
        This demo changes your plan locally. No card is requested and no money
        is charged.
      </p>
      <div className="tc-prices">
        {choices.map((x) => (
          <article key={x.name} className={plan === x.name ? "selected" : ""}>
            <span>{x.name}</span>
            <h3>
              {x.price === "0" ? "Free" : `$${x.price}`}{" "}
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
              onClick={() => {
                setPlan(x.name);
                onClose();
              }}
            >
              {plan === x.name ? "Current plan" : `Choose ${x.name}`}
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
  const submit = (e) => {
    e.preventDefault();
    const n = Number(amount.replace(",", "."));
    if (merchant && n > 0) {
      onSave({
        id: Date.now(),
        merchant,
        category: type === "income" ? "Other" : category,
        type,
        amount: n,
        date: new Date().toISOString().slice(0, 10),
        color: type === "income" ? "#59a9ff" : "#00e5a0",
      });
      onClose();
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
        <button className="tc-action">
          Save {type} <Plus size={16} />
        </button>
      </form>
    </Modal>
  );
}

export default function Cabinet({ onExit, onSignOut }) {
  const [view, setView] = useState("overview"),
    [transactions, setTransactions] = useState(seed),
    [modal, setModal] = useState(null),
    [plan, setPlan] = useState("Start"),
    [notice, setNotice] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [budget, setBudget] = useState(30000),
    [goalSaved, setGoalSaved] = useState(28800);
  const metrics = useMemo(
    () => getMetrics(transactions, budget, goalSaved),
    [transactions, budget, goalSaved]
  );
  const add = (t) => setTransactions((p) => [t, ...p]);
  const common = { onAdd: () => setModal("add"), setView };
  let page =
    view === "overview" ? (
      <Overview
        {...common}
        transactions={transactions}
        metrics={metrics}
        onPlan={() => setView("plan")}
        onGoal={() => setView("goals")}
      />
    ) : view === "transactions" ? (
      <Transactions
        items={transactions}
        metrics={metrics}
        onAdd={common.onAdd}
        onDelete={(id) => setTransactions((p) => p.filter((t) => t.id !== id))}
        onClear={() => setTransactions([])}
      />
    ) : view === "plan" ? (
      <Plan
        onAdd={common.onAdd}
        budget={budget}
        setBudget={setBudget}
        metrics={metrics}
      />
    ) : view === "goals" ? (
      <Goals onAdd={common.onAdd} saved={goalSaved} setSaved={setGoalSaved} />
    ) : view === "analytics" ? (
      <Analytics transactions={transactions} metrics={metrics} />
    ) : (
      <SettingsPage plan={plan} setPlan={setPlan} transactions={transactions} />
    );
  return (
    <div className="tc-app">
      <aside className="tc-side">
        <a className="tc-brand" onClick={onExit}>
          <i>↗</i> trek
        </a>
        <small>PERSONAL SPACE</small>
        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={view === id ? "on" : ""}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
        <div className="tc-side-bottom">
          <button onClick={() => setModal("plans")}>
            <CreditCard size={17} />
            {plan} plan
          </button>
          <button onClick={() => setView("settings")}>
            <Settings size={17} /> Settings
          </button>
          <button onClick={onExit}>← Back to home</button>
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
            <span>V</span>
          </div>
          {notice && (
            <div className="tc-notice">
              <b>Trek signal</b>
              <p>You are still within your September plan.</p>
            </div>
          )}
          {mobileNav && (
            <div className="tc-mobile-menu">
              {nav.map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => {
                    setView(id);
                    setMobileNav(false);
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
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
        <Pricing plan={plan} setPlan={setPlan} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
