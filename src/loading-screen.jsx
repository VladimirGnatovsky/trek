import React from "react";
import { ArrowUpRight } from "lucide-react";

const LABELS = {
  en: { loading: "Preparing your money space", secure: "Opening secure sign-in" },
  pl: { loading: "Przygotowujemy Twoją przestrzeń finansową", secure: "Otwieramy bezpieczne logowanie" },
  uk: { loading: "Готуємо ваш фінансовий простір", secure: "Відкриваємо захищений вхід" },
};

export default function LoadingScreen({ locale = "en", secure = false }) {
  const copy = LABELS[locale] || LABELS.en;
  return <div className="tw-loading" role="status" aria-live="polite">
    <div className="tw-loading-content">
      <span className="tw-loading-mark" aria-hidden="true"><ArrowUpRight size={26} /></span>
      <b>Trek</b>
      <small>{secure ? copy.secure : copy.loading}</small>
      <i className="tw-loading-line" aria-hidden="true" />
    </div>
  </div>;
}
