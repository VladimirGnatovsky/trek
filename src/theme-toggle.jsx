import React from "react";
import { Moon, Sun } from "lucide-react";

const LABELS = {
  en: { dark: "Switch to light theme", light: "Switch to dark theme", darkName: "Dark", lightName: "Light" },
  pl: { dark: "Przełącz na jasny motyw", light: "Przełącz na ciemny motyw", darkName: "Ciemny", lightName: "Jasny" },
  uk: { dark: "Увімкнути світлу тему", light: "Увімкнути темну тему", darkName: "Темна", lightName: "Світла" },
};

export default function ThemeToggle({ theme = "dark", onChange, locale = "en", showLabel = false, className = "" }) {
  const copy = LABELS[locale] || LABELS.en;
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;
  return <button type="button" className={`trek-theme-toggle ${className}`.trim()} onClick={() => onChange(next)} aria-label={copy[theme]} title={copy[theme]}>
    <Icon size={16} aria-hidden="true" />
    {showLabel && <span>{theme === "dark" ? copy.darkName : copy.lightName}</span>}
  </button>;
}
