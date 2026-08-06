import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["pt", "es", "en", "fr"],
  defaultLocale: "pt",
});

export type Locale = (typeof routing.locales)[number];
