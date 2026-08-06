import type { Locale } from "@/i18n/routing";

export default function FlagIcon({ locale }: { locale: Locale }) {
  switch (locale) {
    case "pt":
      return (
        <svg viewBox="0 0 30 20" className="h-full w-full">
          <rect width="30" height="20" fill="#ff0000" />
          <rect width="12" height="20" fill="#006600" />
          <circle cx="12" cy="10" r="3.2" fill="#ffcc00" stroke="#000" strokeWidth="0.3" />
        </svg>
      );
    case "es":
      return (
        <svg viewBox="0 0 30 20" className="h-full w-full">
          <rect width="30" height="20" fill="#aa151b" />
          <rect y="5" width="30" height="10" fill="#f1bf00" />
        </svg>
      );
    case "en":
      return (
        <svg viewBox="0 0 60 30" className="h-full w-full">
          <rect width="60" height="30" fill="#00247d" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#cf142b" strokeWidth="2" />
          <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
          <path d="M30,0 V30 M0,15 H60" stroke="#cf142b" strokeWidth="6" />
        </svg>
      );
    case "fr":
      return (
        <svg viewBox="0 0 30 20" className="h-full w-full">
          <rect width="10" height="20" fill="#0055a4" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ef4135" />
        </svg>
      );
  }
}
