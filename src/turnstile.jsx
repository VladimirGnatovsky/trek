import React, { useEffect, useRef, useState } from "react";

const SCRIPT_ID = "trek-turnstile-script";

export default function Turnstile({ siteKey, locale, onToken, onError, interactionOnly = false }) {
  const container = useRef(null);
  const frame = useRef(null);
  const [frameVisible, setFrameVisible] = useState(false);

  useEffect(() => {
    if (!interactionOnly) return undefined;
    const receive = (event) => {
      if (event.origin !== "https://trekmoney.pl" || event.source !== frame.current?.contentWindow) return;
      if (event.data?.source !== "trek-native-turnstile") return;
      if (typeof event.data.visible === "boolean") setFrameVisible(event.data.visible);
      if (event.data.token) onToken(event.data.token);
      if (event.data.expired) onToken("");
      if (event.data.error) onError?.(event.data.error);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      onToken("");
    };
  }, [interactionOnly, onToken, onError]);

  useEffect(() => {
    if (interactionOnly) return undefined;
    if (!siteKey || !container.current) return undefined;
    let widgetId;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.turnstile || !container.current || container.current.childElementCount) return;
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        language: locale === "uk" ? "uk" : locale,
        theme: "auto",
        size: "flexible",
        appearance: interactionOnly ? "interaction-only" : "always",
        callback: (token) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    let script = document.getElementById(SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    render();
    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
      if (widgetId !== undefined && window.turnstile) window.turnstile.remove(widgetId);
      onToken("");
    };
  }, [siteKey, locale, onToken, interactionOnly]);

  if (interactionOnly) {
    const params = new URLSearchParams({ sitekey: siteKey, language: locale === "uk" ? "uk" : locale });
    return <iframe ref={frame} className={`ta-turnstile ta-turnstile-frame${frameVisible ? " is-visible" : ""}`} src={`https://trekmoney.pl/native-turnstile.html?${params}`} title="Security check" />;
  }
  return <div className="ta-turnstile" ref={container} aria-label="Security check" />;
}
