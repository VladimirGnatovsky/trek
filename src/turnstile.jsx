import React, { useEffect, useRef } from "react";

const SCRIPT_ID = "trek-turnstile-script";

export default function Turnstile({ siteKey, locale, onToken }) {
  const container = useRef(null);

  useEffect(() => {
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
  }, [siteKey, locale, onToken]);

  return <div className="ta-turnstile" ref={container} aria-label="Security check" />;
}
