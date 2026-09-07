import React, { useEffect, useState } from "react";
import { Cookie, ShieldCheck, X } from "lucide-react";
import "./legal.css";

const LEGAL_VERSION = "2026-09-07";
const env = (name, fallback) => window.__TREK_ENV__?.[name] || import.meta.env[name] || fallback;

export function LegalCenter({ document, onClose }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  if (!document) return null;
  const controller = env("VITE_LEGAL_CONTROLLER_NAME", "Trek");
  const address = env("VITE_LEGAL_CONTROLLER_ADDRESS", "Poland");
  const email = env("VITE_PRIVACY_EMAIL", "support@trekmoney.pl");
  const common = <><p><b>Effective:</b> 7 September 2026 · version {LEGAL_VERSION}</p><p><b>Service operator and data controller:</b> {controller}, {address}. Contact: <a href={`mailto:${email}`}>{email}</a>.</p></>;
  return <div className="tl-layer" role="presentation" onMouseDown={onClose}><article className="tl-document" role="dialog" aria-modal="true" aria-labelledby="tl-title" onMouseDown={(event) => event.stopPropagation()}><header><div><ShieldCheck size={18} /><span>LEGAL & PRIVACY</span></div><button onClick={onClose} aria-label="Close"><X size={20} /></button></header>{document === "privacy" ? <>
    <h1 id="tl-title">Privacy Notice</h1>{common}
    <h2>What Trek processes</h2><p>Account details such as your email, display name and optional avatar; the financial records you choose to add, including transactions, budgets, goals, recurring items, receipt images submitted for recognition and watch-only crypto positions; technical security and service logs; and Stripe customer and membership identifiers. Trek does not ask for online-banking credentials, wallet seed phrases or card details.</p>
    <h2>Why and on what basis</h2><p>Account and financial data are processed to provide the service and membership you request (performance of a contract). Security logs, fraud prevention and service reliability are processed for legitimate interests. Payment and accounting records may be retained to meet legal obligations. Optional analytics or marketing technologies, if introduced, will require separate consent.</p>
    <h2>Processors and transfers</h2><p>Trek uses Supabase for authentication, database and file storage; Railway for application hosting; Stripe for payments; Google Gemini when you submit a receipt or PDF for recognition; and CoinGecko for market prices. Providers may process data outside the European Economic Area under their applicable contractual and transfer safeguards. Stripe receives payment data directly; Trek does not store full card details.</p>
    <h2>Retention</h2><p>Your Trek records are kept while your account is active and are deleted when you use “Delete account”, subject to limited backups, security logs and records that must be retained by law. Uploaded receipt or statement content is used to perform the requested extraction and is not intentionally retained by Trek after processing.</p>
    <h2>Your rights</h2><p>You may request access, correction, deletion, restriction, portability or object to applicable processing. You may withdraw optional consent at any time without affecting earlier lawful processing. Export and account deletion are available in Settings. You may also contact the controller or lodge a complaint with Poland’s supervisory authority, the President of the Personal Data Protection Office (UODO).</p>
  </> : document === "cookies" ? <>
    <h1 id="tl-title">Cookie & Local Storage Notice</h1>{common}
    <h2>Essential storage</h2><p>Trek uses browser or app storage needed to keep a secure Supabase session, remember your privacy choices, provide an offline app shell and store this notice acknowledgement. These technologies are necessary for the service you request and cannot be disabled inside Trek; you can clear them in your browser or device settings.</p>
    <h2>No advertising trackers</h2><p>Trek currently does not install advertising, cross-site tracking or audience-measurement cookies. If optional analytics is added later, it will remain off until you make a separate choice.</p>
  </> : <>
    <h1 id="tl-title">Terms of Service</h1>{common}
    <h2>The service</h2><p>Trek is a personal budgeting and portfolio-tracking tool. It provides estimates and automated categorisation, not financial, tax, investment or legal advice. You remain responsible for checking imported, scanned and converted values before relying on them.</p>
    <h2>Your account and data</h2><p>Keep your login secure and only upload content you are entitled to process. Do not submit bank credentials, card numbers, crypto private keys or seed phrases. You may export your records or permanently delete the account from Settings.</p>
    <h2>Memberships</h2><p>Paid web memberships are processed by Stripe. Subscription pricing and billing interval are shown before checkout; subscription management and cancellation are available through the Stripe customer portal. iOS uses the membership already attached to your Trek account and does not offer purchases inside the app.</p>
    <h2>Availability and responsibility</h2><p>Trek may change or suspend features for maintenance, security or legal reasons. To the extent permitted by law, the service is provided without a guarantee that estimates, third-party prices, extracted documents or exchange rates are error-free. Nothing in these terms limits mandatory consumer rights.</p>
  </>}<footer><button onClick={onClose}>Close</button></footer></article></div>;
}

export function CookieNotice({ onOpenPolicy }) {
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem("trek-cookie-notice") !== LEGAL_VERSION; } catch { return true; }
  });
  if (!visible) return null;
  const acknowledge = () => { try { localStorage.setItem("trek-cookie-notice", LEGAL_VERSION); } catch {} setVisible(false); };
  return <aside className="tl-cookie" aria-label="Cookie notice"><Cookie size={21} /><div><b>Essential storage only</b><p>Trek uses necessary session and preference storage. No advertising or analytics trackers are active.</p><button onClick={onOpenPolicy}>Cookie details</button></div><button className="tl-cookie-ok" onClick={acknowledge}>Got it</button></aside>;
}

export { LEGAL_VERSION };
