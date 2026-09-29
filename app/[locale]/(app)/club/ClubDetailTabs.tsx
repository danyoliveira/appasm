"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type TabKey = "general" | "physical" | "stats" | "notes" | "dossier";

export default function ClubDetailTabs({
  generalContent,
  physicalContent,
  statsContent,
  notesContent,
  dossierContent,
}: {
  generalContent: ReactNode;
  physicalContent: ReactNode;
  statsContent: ReactNode;
  notesContent?: ReactNode;
  dossierContent: ReactNode;
}) {
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<TabKey>("general");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("clubTabGeneral") },
    { key: "physical", label: t("clubTabPhysical") },
    { key: "stats", label: t("clubTabStats") },
    ...(notesContent ? ([{ key: "notes", label: t("clubTabNotes") }] as const) : []),
    { key: "dossier", label: t("clubTabDossier") },
  ];

  function contentFor(key: TabKey) {
    if (key === "physical") return physicalContent;
    if (key === "stats") return statsContent;
    if (key === "dossier") return dossierContent;
    if (key === "notes") return notesContent;
    return generalContent;
  }

  return (
    <div className="mt-8">
      <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
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
