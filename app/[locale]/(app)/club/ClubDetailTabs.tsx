"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type TabKey = "general" | "physical" | "stats" | "progression" | "notes";

export default function ClubDetailTabs({
  generalContent,
  physicalContent,
  statsContent,
  progressionContent,
  notesContent,
}: {
  generalContent: ReactNode;
  physicalContent: ReactNode;
  statsContent: ReactNode;
  progressionContent: ReactNode;
  notesContent?: ReactNode;
}) {
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<TabKey>("general");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("clubTabGeneral") },
    { key: "physical", label: t("clubTabPhysical") },
    { key: "stats", label: t("clubTabStats") },
    { key: "progression", label: t("clubTabProgression") },
    ...(notesContent ? ([{ key: "notes", label: t("clubTabNotes") }] as const) : []),
  ];

  function contentFor(key: TabKey) {
    if (key === "physical") return physicalContent;
    if (key === "stats") return statsContent;
    if (key === "progression") return progressionContent;
    if (key === "notes") return notesContent;
    return generalContent;
  }

  return (
    <div className="mt-8">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tabDef) => (
          <button
            key={tabDef.key}
            type="button"
            onClick={() => setTab(tabDef.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === tabDef.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tabDef.label}
          </button>
        ))}
      </div>
      <div className="mt-6">{contentFor(tab)}</div>
    </div>
  );
}
