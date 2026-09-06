import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  CreditCard,
  Download,
  LayoutDashboard,
  Menu,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import "./webapp.css";
import "./responsive.css";
import Cabinet from "./cabinet-next.jsx";
import AuthScreen from "./auth.jsx";
import { supabase } from "./supabase.js";

const seed = [
  {
    id: 1,
    name: "Whole Foods",
    category: "Groceries",
    amount: 842,
    date: "Today",
    color: "#00e5a0",
  },
  {
    id: 2,
    name: "Uber",
    category: "Transport",
    amount: 286,
    date: "Today",
    color: "#ff795e",
  },
  {
    id: 3,
    name: "Spotify",
    category: "Subscriptions",
    amount: 89,
    date: "Yesterday",
    color: "#00e5a0",
  },
  {
    id: 4,
    name: "Coffee Room",
    category: "Coffee",
    amount: 164,
    date: "Yesterday",
    color: "#ffcc66",
  },
];

const bars = [46, 58, 51, 68, 61, 82, 71, 65, 77, 58, 63, 49];
const fmt = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v) + " ₴";

function TrendChart() {
  return (
    <div className="tw-chart" aria-label="Spending over the last 12 months">
      <div className="tw-gridlines">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="tw-bars">
        {bars.map((h, i) => (
          <div className="tw-bar-item" key={i}>
            <span
              className={i === 8 ? "hot" : ""}
              style={{ height: `${h}%` }}
            />
            <small>
              {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"][i]}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreRing({ score = 78 }) {
  return (
    <div className="tw-score" style={{ "--score": `${score * 3.6}deg` }}>
      <div>
        <b>{score}</b>
        <span>
          money
          <br />
          pulse
        </span>
      </div>
    </div>
  );
}

function ProductPreview({ onOpen }) {
  return (
    <div className="tw-browser">
      <div className="tw-browserbar">
        <span>
          <i />
          <i />
          <i />
        </span>
        <em>app.trek</em>
        <button onClick={onOpen}>
          Open dashboard <ArrowRight size={14} />
        </button>
      </div>
      <div className="tw-previewbody">
        <aside>
          <div className="tw-mini-logo">T</div>
          <b>Overview</b>
          <span>Transactions</span>
          <span>Plan</span>
          <span>Goals</span>
          <span>Reports</span>
        </aside>
        <main>
          <div className="tw-previewhead">
            <div>
              <small>SEPTEMBER · 2026</small>
              <h3>Your month</h3>
            </div>
            <span className="tw-avatar">V</span>
          </div>
          <div className="tw-kpirow">
            <div>
              <small>SAFE TO SPEND THIS MONTH</small>
              <b>12,480 ₴</b>
              <em>+8% above plan</em>
            </div>
            <ScoreRing />
          </div>
          <div className="tw-previewgrid">
            <div>
              <small>MONTHLY SPENDING</small>
              <b>28,420 ₴</b>
              <TrendChart />
            </div>
            <div className="tw-insight">
              <Sparkles size={18} />
              <small>TREK SIGNAL</small>
              <b>Coffee is 34% above your normal pace.</b>
              <span>Cut 65 ₴ a day and keep 1,950 ₴ this month.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  const items = [
    [
      "What does “safe to spend” mean?",
      "It is the amount you can use today after your monthly plan, regular costs and active goals are taken into account.",
    ],
    [
      "Do I need to connect a bank account?",
      "No. Trek starts with manual expenses and income, so your banking credentials are never requested.",
    ],
    [
      "Can I change currency later?",
      "Yes. Choose UAH, PLN, EUR or USD in Settings. Your active currency can be changed at any time.",
    ],
    [
      "What will a membership unlock?",
      "Start covers daily tracking. Plus is designed for advanced insights, exports and cloud sync; Lifetime includes every Plus feature permanently.",
    ],
    [
      "Is Trek ready for real payments and accounts?",
      "The public preview is not a payment system. Secure accounts and checkout require a server-side identity provider and a verified payment-provider account.",
    ],
  ];
  return (
    <section className="tw-faq" id="faq">
      <div className="tw-section-title">
        <span className="tw-eyebrow">
          <i /> QUESTIONS, ANSWERED
        </span>
        <h2>
          Clear money needs
          <br />
          <em>clear answers.</em>
        </h2>
        <p>Everything you need to know before starting your first month.</p>
      </div>
      <div className="tw-faq-list">
        {items.map(([q, a], i) => (
          <article key={q} className={open === i ? "open" : ""}>
            <button
              onClick={() => setOpen(open === i ? -1 : i)}
              aria-expanded={open === i}
            >
              <span>
                <CircleHelp size={17} />
                {q}
              </span>
              <b>{open === i ? "−" : "+"}</b>
            </button>
            {open === i && <p>{a}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Landing({ onOpen, session }) {
  return (
    <div className="tw-landing">
      <header className="tw-nav">
        <a className="tw-logo" href="#top">
          <span>↗</span> Trek
        </a>
        <nav>
          <a href="#product">Product</a>
          <a href="#how">How It Works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div>
          {session ? (
            <button className="tw-account-btn" onClick={onOpen} aria-label="Open my account">
              <UserRound size={17} /> <span>My account</span>
            </button>
          ) : (
            <>
              <button className="tw-login" onClick={onOpen}>
                Log In
              </button>
              <button className="tw-dark-btn" onClick={onOpen}>
                Start Free <ArrowRight size={15} />
              </button>
            </>
          )}
        </div>
      </header>
      <main id="top">
        <section className="tw-hero">
          <div className="tw-hero-copy">
            <span className="tw-eyebrow">
              <i /> NO BANK LOGINS. NO NOISE.
            </span>
            <h1>
              Money, made
              <br />
              clear.
              <br />
              <mark>Stay in control.</mark>
            </h1>
            <p>
              Trek does more than track spending. It shows what is safe to spend
              today without breaking the month.
            </p>
            <div className="tw-hero-actions">
              <button className="tw-primary" onClick={onOpen}>
                Take Control <ArrowRight size={18} />
              </button>
              <button
                className="tw-play"
                onClick={() =>
                  document
                    .getElementById("product")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                <span>▶</span> See How It Works
              </button>
            </div>
            <div className="tw-trust">
              <span>✓ Your Data Stays Yours</span>
              <span>✓ UAH · PLN · EUR · USD</span>
            </div>
          </div>
          <div className="tw-hero-art">
            <div className="tw-orbit one" />
            <div className="tw-orbit two" />
            <div className="tw-cash-card">
              <span>SAFE TO SPEND TODAY</span>
              <b>1,248 ₴</b>
              <em>after planned expenses</em>
              <div className="tw-cash-line">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="tw-float-card alert">
              <BellRing size={17} />
              <div>
                <b>Keep the pace</b>
                <span>You are inside plan</span>
              </div>
            </div>
            <div className="tw-float-card goal">
              <Target size={17} />
              <div>
                <b>Summer trip</b>
                <span>72% complete</span>
              </div>
            </div>
          </div>
        </section>
        <section className="tw-proof">
          <span>
            NOT A SPREADSHEET. NOT A BANK. YOUR DAILY FINANCIAL SIGNAL.
          </span>
          <div>
            <b>3 min</b>
            <small>to get started</small>
          </div>
          <div>
            <b>0</b>
            <small>bank logins</small>
          </div>
          <div>
            <b>4</b>
            <small>currencies included</small>
          </div>
        </section>
        <section className="tw-product" id="product">
          <div className="tw-section-title">
            <span className="tw-eyebrow">
              <i /> INSIDE TREK
            </span>
            <h2>
              One screen.
              <br />
              <em>One clear next move.</em>
            </h2>
            <p>
              See your whole picture in seconds, then know exactly what to
              change this month.
            </p>
          </div>
          <ProductPreview onOpen={onOpen} />
        </section>
        <section className="tw-how" id="how">
          <div className="tw-section-title">
            <span className="tw-eyebrow">
              <i /> LESS ADMIN
            </span>
            <h2>
              Less counting.
              <br />
              <em>More direction.</em>
            </h2>
          </div>
          <div className="tw-steps">
            <article>
              <span>01</span>
              <Wallet size={24} />
              <h3>Add it in five seconds</h3>
              <p>
                Type “coffee 85” or scan a receipt. Trek turns it into a clear
                record.
              </p>
            </article>
            <article>
              <span>02</span>
              <BarChart3 size={24} />
              <h3>See your actual pace</h3>
              <p>
                Not just what you spent — whether your plan will last to the end
                of the month.
              </p>
            </article>
            <article>
              <span>03</span>
              <Sparkles size={24} />
              <h3>Act on a signal</h3>
              <p>
                A concrete number: what to trim and how much it gives back to
                you.
              </p>
            </article>
          </div>
        </section>
        <section className="tw-pricing" id="pricing">
          <div>
            <span className="tw-eyebrow">
              <i /> SIMPLE PRICING
            </span>
            <h2>
              Build the habit first.
              <br />
              Go deeper when ready.
            </h2>
            <p>
              Start without a card. Upgrade only when you want sync and more
              powerful insights.
            </p>
          </div>
          <div className="tw-price-card">
            <div>
              <span>START</span>
              <b>
                0 ₴ <small>/ forever</small>
              </b>
            </div>
            <ul>
              <li>Manual expenses and income</li>
              <li>Monthly plan</li>
              <li>Goals and reminders</li>
              <li>Offline on your device</li>
            </ul>
            <button onClick={onOpen}>
              Start For Free <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <section className="tw-info-strip">
          <article>
            <ShieldCheck size={23} />
            <div>
              <b>Private by design</b>
              <span>No bank credentials. Clear data boundaries.</span>
            </div>
          </article>
          <article>
            <BarChart3 size={23} />
            <div>
              <b>Signals, not noise</b>
              <span>Trend and category views that lead to one next move.</span>
            </div>
          </article>
          <article>
            <Target size={23} />
            <div>
              <b>Built for real goals</b>
              <span>Keep daily decisions aligned with what matters.</span>
            </div>
          </article>
        </section>
        <FAQ />
      </main>
      <footer>
        <a className="tw-logo" href="#top">
          <span>↗</span> Trek
        </a>
        <p>Your money. Your pace. Your data.</p>
        <span>© 2026 Trek</span>
      </footer>
    </div>
  );
}

function Workspace({ onExit }) {
  const [transactions, setTransactions] = useState(seed);
  const [add, setAdd] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const total = useMemo(
    () => transactions.reduce((s, x) => s + x.amount, 0),
    [transactions]
  );
  const save = () => {
    const v = Number(amount.replace(",", "."));
    if (!name.trim() || !v) return;
    setTransactions([
      {
        id: Date.now(),
        name,
        category: "Other",
        amount: v,
        date: "Just now",
        color: "#00e5a0",
      },
      ...transactions,
    ]);
    setName("");
    setAmount("");
    setAdd(false);
  };
  return (
    <div className="tw-workspace">
      <aside className="tw-side">
        <a className="tw-logo" onClick={onExit}>
          <span>↗</span> Trek
        </a>
        <small>PERSONAL SPACE</small>
        <button className="on">
          <LayoutDashboard size={18} /> Overview
        </button>
        <button>
          <ReceiptText size={18} /> Transactions
        </button>
        <button>
          <CalendarDays size={18} /> Monthly plan
        </button>
        <button>
          <Target size={18} /> Goals
        </button>
        <button>
          <BarChart3 size={18} /> Analytics
        </button>
        <div className="tw-side-bottom">
          <button>
            <CreditCard size={18} /> Start plan
          </button>
          <button onClick={onExit}>← Back to home</button>
        </div>
      </aside>
      <main className="tw-dash">
        <header>
          <div>
            <p>Good morning, Volodymyr</p>
            <h1>Your money rhythm</h1>
          </div>
          <div>
            <button className="tw-icon">
              <BellRing size={19} />
            </button>
            <span className="tw-avatar">V</span>
          </div>
        </header>
        <section className="tw-dash-hero">
          <div>
            <span>SAFE TO SPEND UNTIL SEP 30</span>
            <h2>12,480 ₴</h2>
            <p>
              <i /> 1,240 ₴ more than your plan
            </p>
          </div>
          <ScoreRing score={78} />
          <button onClick={() => setAdd(true)}>
            <Plus size={18} /> Add transaction
          </button>
        </section>
        <div className="tw-dashboard-grid">
          <section className="tw-panel tw-spending">
            <div className="tw-panel-head">
              <div>
                <span>SPENDING</span>
                <h3>{fmt(total * 10.4)}</h3>
              </div>
              <button>
                September <ChevronRight size={15} />
              </button>
            </div>
            <TrendChart />
            <div className="tw-legend">
              <span>
                <i /> Spending
              </span>
              <span>
                <i /> Usual pace
              </span>
            </div>
          </section>
          <section className="tw-panel tw-coach">
            <div className="tw-coach-icon">
              <Sparkles size={19} />
            </div>
            <span>TREK SIGNAL</span>
            <h3>Coffee is 34% above your normal pace</h3>
            <p>
              Cut coffee by 65 ₴ a day and you keep another 1,950 ₴ by month
              end.
            </p>
            <button>
              See the plan <ArrowRight size={15} />
            </button>
          </section>
          <section className="tw-panel tw-transactions">
            <div className="tw-panel-head">
              <div>
                <span>RECENT TRANSACTIONS</span>
                <h3>Today</h3>
              </div>
              <button>
                All transactions <ArrowRight size={15} />
              </button>
            </div>
            {transactions.map((t) => (
              <div className="tw-txn" key={t.id}>
                <span style={{ background: t.color + "20", color: t.color }}>
                  {t.name.slice(0, 1)}
                </span>
                <div>
                  <b>{t.name}</b>
                  <small>
                    {t.category} · {t.date}
                  </small>
                </div>
                <em>− {fmt(t.amount)}</em>
              </div>
            ))}
          </section>
          <section className="tw-panel tw-goal">
            <div className="tw-goal-icon">✈</div>
            <span>GOAL</span>
            <h3>Italy summer trip</h3>
            <div className="tw-progress">
              <i style={{ width: "72%" }} />
            </div>
            <p>
              <b>28,800 ₴</b> of 40,000 ₴ <em>72%</em>
            </p>
            <button>
              Open goal <ArrowRight size={15} />
            </button>
          </section>
        </div>
      </main>
      {add && (
        <div className="tw-modal" onMouseDown={() => setAdd(false)}>
          <form
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <button
              type="button"
              className="tw-close"
              onClick={() => setAdd(false)}
            >
              <X size={19} />
            </button>
            <span className="tw-eyebrow">
              <i /> NEW TRANSACTION
            </span>
            <h2>Add an expense</h2>
            <label>
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Coffee"
              />
            </label>
            <label>
              Amount
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </label>
            <button className="tw-primary" type="submit">
              Save expense <ArrowRight size={17} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function TrekWeb() {
  const [session, setSession] = useState(undefined);
  const [screen, setScreen] = useState("landing");
  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) =>
      setSession(nextSession)
    );
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session && (window.location.hash === "#dashboard" || new URLSearchParams(window.location.search).get("checkout") === "success")) {
      setScreen("workspace");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [session]);
  if (session === undefined)
    return <div className="tw-loading">Loading Trek…</div>;
  const updateProfile = async (fullName) => {
    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });
    if (error) throw error;
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName,
      email: data.user.email || "",
      updated_at: new Date().toISOString(),
    });
    if (profileError) throw profileError;
    setSession((current) =>
      current ? { ...current, user: data.user } : current
    );
  };
  const openAccount = () => setScreen(session ? "workspace" : "auth");
  if (screen === "landing") return <Landing onOpen={openAccount} session={session} />;
  if (!session) return <AuthScreen onBack={() => setScreen("landing")} />;
  return (
    <Cabinet
      onExit={() => setScreen("landing")}
      onSignOut={() => supabase.auth.signOut()}
      user={session.user}
      onProfileUpdate={updateProfile}
    />
  );
}
