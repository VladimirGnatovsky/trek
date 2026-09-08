const params = new URLSearchParams(window.location.search);
const sitekey = params.get("sitekey") || "";
const language = params.get("language") || "auto";
const notify = (detail = {}) => window.parent.postMessage({ source: "trek-native-turnstile", ...detail }, "*");

const mount = () => {
  if (!window.turnstile) return window.setTimeout(mount, 50);
  window.turnstile.render("#turnstile", {
    sitekey,
    language,
    theme: "auto",
    size: "flexible",
    appearance: "interaction-only",
    retry: "auto",
    "retry-interval": 3000,
    callback: (token) => notify({ token, visible: false }),
    "expired-callback": () => notify({ expired: true, visible: false }),
    "error-callback": (code) => notify({ error: String(code || "challenge-failed"), visible: false }),
    "before-interactive-callback": () => notify({ visible: true }),
    "after-interactive-callback": () => notify({ visible: false }),
    "unsupported-callback": () => notify({ error: "unsupported-browser", visible: false }),
  });
};

if (sitekey) mount();
else notify({ error: "missing-sitekey" });
