"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";
import FlagIcon from "./FlagIcon";

const names: Record<Locale, string> = {
  pt: "Português",
  es: "Español",
  en: "English",
  fr: "Français",
};

export default function LocaleSwitcher({ label }: { label: string }) {
  const activeLocale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="flex items-center gap-2">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          title={names[locale]}
          aria-label={names[locale]}
          aria-current={locale === activeLocale ? "true" : undefined}
          className={`h-4 w-6 overflow-hidden rounded-[3px] ring-1 ring-border transition-opacity ${
            locale === activeLocale
              ? "opacity-100"
              : "opacity-40 grayscale hover:opacity-100 hover:grayscale-0"
          }`}
        >
          <FlagIcon locale={locale} />
        </Link>
      ))}
    </nav>
  );
}
