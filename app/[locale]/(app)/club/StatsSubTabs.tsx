"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

// "Estatística" tab → Geral (season numbers) / Live Mode (per-game
// collective stats recorded in ASM Live Mode).
export default function StatsSubTabs({
  generalContent,
  liveContent,
}: {
  generalContent: ReactNode;
  liveContent: ReactNode;
}) {
  const t = useTranslations("dashboard");
  // ASM Live Mode first — it's the club's own match data, the one the coach
  // comes to this tab for.
  const [tab, setTab] = useState<"general" | "live">("live");

  return (
    <div className="space-y-5">
      <div className="flex w-fit rounded-lg border border-border bg-background p-0.5">
        {(["general", "live"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {key === "general" ? t("statsSubTabGeneral") : t("statsSubTabLive")}
          </button>
        ))}
      </div>
      {tab === "general" ? generalContent : liveContent}
    </div>
  );
}
