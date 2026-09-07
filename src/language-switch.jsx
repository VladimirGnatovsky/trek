import React from "react";

export const LANGUAGES = [
  { id: "en", label: "EN", flag: "gb", name: "English" },
  { id: "pl", label: "PL", flag: "pl", name: "Polski" },
  { id: "uk", label: "UA", flag: "ua", name: "Українська" },
];

export default function LanguageSwitch({ locale, onChange, className = "" }) {
  return <div className={`trek-language-switch ${className}`.trim()} role="group" aria-label="Language">
    {LANGUAGES.map((language) => <button
      key={language.id}
      type="button"
      className={locale === language.id ? "on" : ""}
      aria-pressed={locale === language.id}
      aria-label={language.name}
      title={language.name}
      onClick={() => onChange(language.id)}
    ><i className={`trek-flag trek-flag-${language.flag}`} aria-hidden="true" /><span>{language.label}</span></button>)}
  </div>;
}
