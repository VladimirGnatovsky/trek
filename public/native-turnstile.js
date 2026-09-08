const params = new URLSearchParams(window.location.search);
const sitekey = params.get("sitekey") || "";
const language = params.get("language") || "auto";
const notify = (token = "", error = "") => window.parent.postMessage({ source: "trek-native-turnstile", token, error }, "*");

const mount = () => {
  if (!window.turnstile) return window.setTimeout(mount, 50);
  window.turnstile.render("#turnstile", {
    sitekey,
    language,
    theme: "auto",
    size: "flexible",
    appearance: "interaction-only",
    callback: (token) => notify(token),
    "expired-callback": () => notify(),
    "error-callback": (code) => notify("", String(code || "challenge-failed")),
  });
};

if (sitekey) mount();
else notify("", "missing-sitekey");
