import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "./supabase.js";
import "./auth.css";
import "./auth-extra.css";
import { LEGAL_VERSION } from "./legal.jsx";

export default function AuthScreen({ onBack, onLegal }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const configured = Boolean(supabase);

  const submit = async (event) => {
    event.preventDefault();
    if (!configured) return;
    setBusy(true);
    setMessage("");
    const redirectTo = window.location.protocol === "capacitor:"
      ? "https://trekapp.up.railway.app/"
      : `${window.location.origin}`;
    let result;
    if (mode === "signup") {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { full_name: name.trim(), legal_accepted_at: new Date().toISOString(), legal_version: LEGAL_VERSION },
        },
      });
      if (!result.error)
        setMessage("Check your email to confirm the account, then sign in.");
    } else if (mode === "reset") {
      result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (!result.error)
        setMessage(
          "If this address exists, a password-reset email is on its way."
        );
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }
    if (result?.error) setMessage(result.error.message);
    setBusy(false);
  };

  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "reset"
      ? "Reset your password"
      : "Welcome back";
  const copy =
    mode === "signup"
      ? "Start building a clearer money habit."
      : mode === "reset"
      ? "We will send you a secure reset link."
      : "Your money rhythm is waiting.";

  return (
    <main className="ta-auth">
      <section className="ta-brand">
        <button type="button" className="ta-brand-link" onClick={onBack}>
          <i><ArrowUpRight size={18} /></i> Trek
        </button>
        <div>
          <span>PRIVATE MONEY SPACE</span>
          <h1>
            Your money.
            <br />
            <em>Your pace.</em>
          </h1>
          <p>Simple tracking, clear budgets and signals you can act on.</p>
        </div>
        <footer>
          <ShieldCheck size={16} /> Protected by secure account sessions
        </footer>
      </section>
      <section className="ta-form-wrap">
        <form className="ta-form" onSubmit={submit}>
          <span className="ta-eyebrow">
            <KeyRound size={14} /> TREK ACCOUNT
          </span>
          <h2>{title}</h2>
          <p>
            {configured
              ? copy
              : "Add the Supabase environment variables in Railway to activate secure sign-in."}
          </p>
          {message && (
            <div className="ta-message" role="status">
              {message}
            </div>
          )}
          {mode === "signup" && (
            <label>
              Full name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          {mode !== "reset" && (
            <label>
              Password
              <input
                type="password"
                minLength="6"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
              />
            </label>
          )}
          {mode === "signup" && <label className="ta-legal-check"><input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} required /><span>I agree to the <button type="button" onClick={() => onLegal("terms")}>Terms</button> and acknowledge the <button type="button" onClick={() => onLegal("privacy")}>Privacy Notice</button>.</span></label>}
          <button disabled={!configured || busy || (mode === "signup" && !legalAccepted)} className="ta-submit">
            {busy
              ? "Please wait…"
              : mode === "signup"
              ? "Create account"
              : mode === "reset"
              ? "Send reset link"
              : "Sign in"}
            <ArrowRight size={17} />
          </button>
          {mode === "login" && (
            <button
              type="button"
              className="ta-link"
              onClick={() => {
                setMode("reset");
                setMessage("");
              }}
            >
              Forgot password?
            </button>
          )}
          <div className="ta-switch">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => setMode("login")}>
                  Sign in
                </button>
              </>
            ) : mode === "reset" ? (
              <button type="button" onClick={() => setMode("login")}>
                <ArrowLeft size={14} /> Back to sign in
              </button>
            ) : (
              <>
                New to Trek?{" "}
                <button type="button" onClick={() => setMode("signup")}>
                  Create an account
                </button>
              </>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
