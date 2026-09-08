import React, { useCallback, useRef, useState } from "react";
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
import { PUBLIC_COPY } from "./public-copy.js";
import Turnstile from "./turnstile.jsx";

export default function AuthScreen({ onBack, onLegal, locale = "en" }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [website, setWebsite] = useState("");
  const signupOpenedAt = useRef(Date.now());
  const configured = Boolean(supabase);
  const copy = PUBLIC_COPY[locale].auth;
  const turnstileSiteKey = window.__TREK_ENV__?.VITE_TURNSTILE_SITE_KEY || import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
  const turnstileEnabled = Boolean(turnstileSiteKey) && window.location.protocol !== "capacitor:";
  const receiveCaptcha = useCallback((token) => setCaptchaToken(token), []);

  const submit = async (event) => {
    event.preventDefault();
    if (!configured) return;
    setBusy(true);
    setMessage("");
    const redirectTo = window.location.protocol === "capacitor:"
      ? "https://trekmoney.pl/"
      : `${window.location.origin}`;
    let result;
    if (turnstileEnabled && !captchaToken) { setMessage(copy.securityCheck); setBusy(false); return; }
    if (mode === "signup") {
      if (website || Date.now() - signupOpenedAt.current < 1200) { setMessage(copy.suspicious); setBusy(false); return; }
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          captchaToken: captchaToken || undefined,
          data: { full_name: name.trim(), legal_accepted_at: new Date().toISOString(), legal_version: LEGAL_VERSION },
        },
      });
      if (!result.error)
        setMessage(copy.confirm);
    } else if (mode === "reset") {
      result = await supabase.auth.resetPasswordForEmail(email, { redirectTo, captchaToken: captchaToken || undefined });
      if (!result.error)
        setMessage(copy.resetSent);
    } else {
      result = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken || undefined } });
    }
    if (result?.error) setMessage(/captcha/i.test(result.error.message) ? copy.securityCheck : result.error.message);
    if (turnstileEnabled) { setCaptchaToken(""); setCaptchaAttempt((value) => value + 1); }
    setBusy(false);
  };

  const title = copy.titles[mode];
  const intro = copy.copies[mode];

  return (
    <main className="ta-auth">
      <section className="ta-brand">
        <button type="button" className="ta-brand-link" onClick={onBack}>
          <i><ArrowUpRight size={18} /></i> Trek
        </button>
        <div>
          <span>{copy.private}</span>
          <h1>
            {copy.hero[0]}
            <br />
            <em>{copy.hero[1]}</em>
          </h1>
          <p>{copy.brandBody}</p>
        </div>
        <footer>
          <ShieldCheck size={16} /> {copy.secure}
        </footer>
      </section>
      <section className="ta-form-wrap">
        <form className="ta-form" onSubmit={submit}>
          <span className="ta-eyebrow">
            <KeyRound size={14} /> {copy.eyebrow}
          </span>
          <h2>{title}</h2>
          <p>
            {configured
              ? intro
              : copy.unavailable}
          </p>
          {message && (
            <div className="ta-message" role="status">
              {message}
            </div>
          )}
          {mode === "signup" && (
            <label>
              {copy.name}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={copy.namePlaceholder}
                required
              />
            </label>
          )}
          <label>
            {copy.email}
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
              {copy.password}
              <input
                type="password"
                minLength="6"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={copy.passwordPlaceholder}
                required
              />
            </label>
          )}
          {mode === "signup" && <label className="ta-legal-check"><input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} required /><span>{copy.legalStart} <button type="button" onClick={() => onLegal("terms")}>{copy.terms}</button> {copy.legalAnd} <button type="button" onClick={() => onLegal("privacy")}>{copy.privacy}</button>.</span></label>}
          {mode === "signup" && <label className="ta-honeypot" aria-hidden="true">Website<input tabIndex="-1" autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>}
          {turnstileEnabled && <Turnstile key={`${mode}-${captchaAttempt}`} siteKey={turnstileSiteKey} locale={locale} onToken={receiveCaptcha} />}
          <button disabled={!configured || busy || (mode === "signup" && !legalAccepted) || (turnstileEnabled && !captchaToken)} className="ta-submit">
            {busy
              ? copy.wait
              : mode === "signup"
              ? copy.create
              : mode === "reset"
              ? copy.reset
              : copy.signIn}
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
              {copy.forgot}
            </button>
          )}
          <div className="ta-switch">
            {mode === "signup" ? (
              <>
                {copy.existing}{" "}
                <button type="button" onClick={() => setMode("login")}>
                  {copy.signIn}
                </button>
              </>
            ) : mode === "reset" ? (
              <button type="button" onClick={() => setMode("login")}>
                <ArrowLeft size={14} /> {copy.back}
              </button>
            ) : (
              <>
                {copy.new}{" "}
                <button type="button" onClick={() => setMode("signup")}>
                  {copy.createLink}
                </button>
              </>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
