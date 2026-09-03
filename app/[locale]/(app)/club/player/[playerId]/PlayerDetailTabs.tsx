"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type TabKey = "overview" | "physical" | "notes" | "progression";

// physicalContent/progressionContent are optional — an opponent's page (not
// our own squad) has no height/weight or coach tracking of ours to show, so
// those tabs don't exist there.
export default function PlayerDetailTabs({
  overviewContent,
  physicalContent,
  notesContent,
  progressionContent,
}: {
  overviewContent: ReactNode;
  physicalContent?: ReactNode;
  notesContent: ReactNode;
  progressionContent?: ReactNode;
}) {
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<TabKey>("overview");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: t("playerTabOverview") },
    ...(physicalContent ? ([{ key: "physical", label: t("playerTabPhysical") }] as const) : []),
    { key: "notes", label: t("playerTabNotes") },
    ...(progressionContent ? ([{ key: "progression", label: t("playerTabProgression") }] as const) : []),
  ];

  function contentFor(key: TabKey) {
    if (key === "overview") return overviewContent;
    if (key === "physical") return physicalContent;
    if (key === "progression") return progressionContent;
    return notesContent;
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
