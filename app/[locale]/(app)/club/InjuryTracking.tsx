"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Marking a player injured — by hand or by confirming one the API flagged —
// always asks for these two things, so the injury history built from
// player_injuries is actually useful (what happened, when it's expected to
// end) instead of just a status flag with no story behind it.
//
// Unlike ConfirmDialog, this has actual draft state (description, expected
// return), so the caller mounts it conditionally ({open && <.../>}) instead
// of passing an `open` prop — a fresh mount is what resets the draft for
// each new player/reason, no reset-on-open effect needed.
export default function InjuryDetailsModal({
  playerName,
  initialDescription,
  isPending,
  onSubmit,
  onCancel,
}: {
  playerName: string;
  initialDescription?: string;
  isPending?: boolean;
  onSubmit: (description: string, expectedReturnAt: string | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("dashboard");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const canSubmit = description.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-[overlay-in_150ms_ease-out]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl animate-[dialog-in_180ms_ease-out]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-lg">
          🩹
        </div>
        <h2 className="mt-3 text-base font-semibold">{t("injuryModalTitle", { name: playerName })}</h2>

        <label className="mt-4 block text-xs font-medium text-muted">
          {t("injuryDescriptionLabel")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            autoFocus
            placeholder={t("injuryDescriptionPlaceholder")}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-muted">
          {t("injuryExpectedReturnLabel")}
          <input
            type="date"
            value={expectedReturnAt}
            onChange={(e) => setExpectedReturnAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
          >
            {t("cancelButton")}
          </button>
          <button
            type="button"
            disabled={isPending || !canSubmit}
            onClick={() => onSubmit(description.trim(), expectedReturnAt || null)}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {isPending ? t("savingClub") : t("saveNoteButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shown once an open injury's expected return date has arrived — a PDF/
// history entry is only as good as the actual dates in it, so this nudges
// the coach to either confirm the real return or push the estimate back
// instead of letting a stale guess sit there forever.
export function InjuryReturnBanner({
  expectedReturnAt,
  isPending,
  onConfirmReturn,
  onUpdateExpectedReturn,
}: {
  expectedReturnAt: string;
  isPending?: boolean;
  onConfirmReturn: (actualReturnAt: string) => void;
  onUpdateExpectedReturn: (expectedReturnAt: string) => void;
}) {
  const t = useTranslations("dashboard");
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(expectedReturnAt);

  return (
    <div className="rounded-xl bg-accent/10 p-2.5 text-xs">
      <p className="text-foreground">
        {t("injuryReturnDuePrompt", { date: new Date(expectedReturnAt).toLocaleDateString() })}
      </p>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              onUpdateExpectedReturn(draftDate);
              setEditing(false);
            }}
            className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
          >
            {t("saveNoteButton")}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setEditing(false)}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
          >
            {t("cancelButton")}
          </button>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => onConfirmReturn(new Date().toISOString().slice(0, 10))}
            className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
          >
            {t("confirmReturnButton")}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setEditing(true)}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
          >
            {t("updateExpectedReturnButton")}
          </button>
        </div>
      )}
    </div>
  );
}
