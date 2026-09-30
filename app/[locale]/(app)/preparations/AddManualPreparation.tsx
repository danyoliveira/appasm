"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createManualPreparation, type ManualMatchDetails } from "../actions";
import ManualPreparationForm, {
  type CompetitionOption,
  type ManualOpponentSelection,
} from "./ManualPreparationForm";

// "Preparar jogo fora da lista": saving adds the game to the list below
// (as "Preparar") and stays here — the coach opens its preparation from
// the list when they want to.
export default function AddManualPreparation({
  competitions = [],
}: {
  competitions?: CompetitionOption[];
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(opponent: ManualOpponentSelection, matchDateIso: string, details: ManualMatchDetails) {
    // requireOpponent (default true) guarantees this is never null here.
    if (!opponent) return;
    startSaving(async () => {
      await createManualPreparation(opponent, matchDateIso, details);
      setIsOpen(false);
      router.refresh();
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="shrink-0 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-accent hover:text-accent"
      >
        + {t("preparationAddManualButton")}
      </button>
    );
  }

  return (
    <div className="w-full basis-full rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("preparationAddManualTitle")}</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          {t("cancelButton")}
        </button>
      </div>

      <div className="mt-3">
        <ManualPreparationForm
          submitLabel={t("videoSaveButton")}
          isSaving={isSaving}
          onSubmit={handleSubmit}
          competitions={competitions}
        />
      </div>
    </div>
  );
}
