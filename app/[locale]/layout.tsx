import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { cookies } from "next/headers";
import Container from "@/components/Container";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import CompetitionSwitcher from "./CompetitionSwitcher";
import CompetitionInfoButton from "./CompetitionInfoButton";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCompetitions, COMPETITION_FILTER_COOKIE } from "@/lib/api-football/teamStats";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var isDark = stored ? stored === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", isDark);
  } catch (e) {}
})();
`;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  title: "ASM | Plataforma do treinador",
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common" });
  const tDashboard = await getTranslations({ locale, namespace: "dashboard" });

  let competitionSwitcher: { competitions: { id: number; name: string }[]; selected: string } | null =
    null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: coachProfile } = await supabase
        .from("profiles")
        .select("api_football_team_id")
        .eq("role", "coach")
        .maybeSingle();
      const teamId = coachProfile?.api_football_team_id ?? null;

      if (teamId) {
        const { allCompetitions } = await getCurrentCompetitions(teamId);
        if (allCompetitions.length > 1) {
          const store = await cookies();
          competitionSwitcher = {
            competitions: allCompetitions.map((c) => ({ id: c.league.id, name: c.league.name })),
            selected: store.get(COMPETITION_FILTER_COOKIE)?.value ?? "all",
          };
        }
      }
    }
  } catch {
    // Header still renders fine without the competition switcher.
  }

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body className="flex min-h-screen flex-col bg-background text-foreground antialiased">
        <NextIntlClientProvider>
          <header className="border-b border-border">
            <Container className="flex items-center justify-between py-4">
              <Link href="/">
                <Logo />
              </Link>
              <div className="flex items-center gap-4">
                {competitionSwitcher && (
                  <div className="flex items-center gap-2">
                    <CompetitionSwitcher
                      key={competitionSwitcher.selected}
                      competitions={competitionSwitcher.competitions}
                      selected={competitionSwitcher.selected}
                      allLabel={tDashboard("allCompetitionsLabel")}
                    />
                    <CompetitionInfoButton
                      label={tDashboard("competitionInfoLabel")}
                      title={
                        competitionSwitcher.competitions.find(
                          (c) => String(c.id) === competitionSwitcher!.selected,
                        )?.name ?? tDashboard("allCompetitionsLabel")
                      }
                      body={tDashboard("competitionDataDisclaimer")}
                    />
                  </div>
                )}
                <LocaleSwitcher label={t("languageLabel")} />
                <ThemeToggle
                  toLightLabel={t("themeToggleToLight")}
                  toDarkLabel={t("themeToggleToDark")}
                />
              </div>
            </Container>
          </header>
          <main className="flex-1">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
