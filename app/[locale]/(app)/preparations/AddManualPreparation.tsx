"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createManualPreparation } from "../actions";
import ManualPreparationForm, { type ManualOpponentSelection } from "./ManualPreparationForm";

export default function AddManualPreparation() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(opponent: ManualOpponentSelection, matchDateIso: string) {
    // requireOpponent (default true) guarantees this is never null here.
    if (!opponent) return;
    startSaving(async () => {
      const id = await createManualPreparation(opponent, matchDateIso);
      router.push(`/preparations/manual-${id}`);
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        + {t("preparationAddManualButton")}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
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
        <ManualPreparationForm submitLabel={t("preparationStartButton")} isSaving={isSaving} onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
