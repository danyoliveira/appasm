"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { updateManualPreparation, type ManualMatchDetails } from "../actions";
import ManualPreparationForm, {
  type CompetitionOption,
  type ManualOpponentSelection,
} from "./ManualPreparationForm";

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
  competitions = [],
  details,
}: {
  id: string;
  opponentName: string;
  matchDate: string;
  competitions?: CompetitionOption[];
  details?: ManualMatchDetails;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const [saveFailed, setSaveFailed] = useState(false);

  function handleSubmit(opponent: ManualOpponentSelection, matchDateIso: string, next: ManualMatchDetails) {
    setSaveFailed(false);
    startSaving(async () => {
      try {
        await updateManualPreparation(id, opponent, matchDateIso, next);
      } catch {
        setSaveFailed(true);
        return;
      }
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
        competitions={competitions}
        initialDetails={details}
      />
      {saveFailed && <p className="mt-2 text-xs text-red-500">{t("manualPreparationSaveError")}</p>}
    </div>
  );
}
