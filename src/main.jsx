import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import "./storage-shim.js"; // must run BEFORE Ledger so window.storage exists
import "./index.css";
import TrekWeb from "./webapp.jsx";
import "./polish.css";
import "./mobile.css";
import "./desktop-ios.css";
import "./mobile-ios-pass.css";
// Theme overrides stay last so both desktop and native design layers inherit light mode.
import "./theme.css";

const nativeApp = Capacitor.isNativePlatform() || new URLSearchParams(window.location.search).has("native-preview");
document.body.classList.toggle("trek-native", nativeApp);
createRoot(document.getElementById("root")).render(<TrekWeb nativeApp={nativeApp} />);

if (!nativeApp && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Trek offline shell is unavailable", error)));
}
