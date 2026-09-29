"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type Source = "external" | "internal";

// "Estatísticas do jogo" with the same Externa / Interna switch used
// elsewhere: Externa = API-Football, Interna = what was logged in ASM Live
// Mode. Opens on whichever one exists (Externa when both do).
export default function FixtureStatsSourceTabs({
  external,
  internal,
}: {
  external: ReactNode | null;
  internal: ReactNode | null;
}) {
  const t = useTranslations("dashboard");
  const [source, setSource] = useState<Source>(external ? "external" : "internal");
  const content = source === "external" ? external : internal;

  return (
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("fixtureStatsTitle")}</h2>
        <div className="flex rounded-lg border border-border bg-background p-0.5" title={t("fixtureStatsSourceHint")}>
          {(["external", "internal"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              aria-pressed={source === s}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                source === s ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {s === "external" ? t("squadStatSourceExternal") : t("squadStatSourceInternal")}
            </button>
          ))}
        </div>
      </div>
      {content ?? (
        <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {source === "external" ? t("fixtureStatsNoExternal") : t("fixtureStatsNoInternal")}
        </p>
      )}
    </section>
  );
}
