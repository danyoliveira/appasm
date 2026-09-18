"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { updateManualPreparation } from "../actions";
import ManualPreparationForm, { type ManualOpponentSelection } from "./ManualPreparationForm";

// A stored `match_date` is UTC — <input type="datetime-local"> needs
// "YYYY-MM-DDTHH:mm" in the viewer's own local time, or the prefilled value
// silently shifts by the timezone offset.
function toLocalDatetimeInputValue(iso: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function EditManualPreparation({
  id,
  opponentName,
  matchDate,
}: {
  id: string;
  opponentName: string;
  matchDate: string;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit(opponent: ManualOpponentSelection, matchDateIso: string) {
    startSaving(async () => {
      await updateManualPreparation(id, opponent, matchDateIso);
      setIsOpen(false);
      router.refresh();
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-xs font-medium text-accent hover:underline"
      >
        ✎ {t("editButton")}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-3 text-left">
      <ManualPreparationForm
        initialMatchDate={toLocalDatetimeInputValue(matchDate)}
        currentOpponentName={opponentName}
        requireOpponent={false}
        submitLabel={t("videoSaveButton")}
        isSaving={isSaving}
        onSubmit={handleSubmit}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  );
}
