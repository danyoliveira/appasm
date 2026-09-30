"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Icon from "@/components/Icon";
import { savePostGameNotes } from "../actions";

// The coach's own analysis after the game — the Live Mode summary below only
// has what was tapped during the match. Read-only once the preparation is
// finished (and for anyone who isn't the coach).
export default function PostGameNotes({
  preparationKey,
  initialNotes,
  canEdit,
}: {
  preparationKey: string;
  initialNotes: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  // What is stored — Guardar only lights up when the text differs from it.
  const [savedNotes, setSavedNotes] = useState(initialNotes ?? "");
  const [isSaving, startSaving] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "failed">("idle");

  if (!canEdit && !savedNotes.trim()) return null;

  function handleSave() {
    setStatus("idle");
    startSaving(async () => {
      try {
        await savePostGameNotes(preparationKey, notes);
        setSavedNotes(notes);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2500);
        router.refresh();
      } catch {
        setStatus("failed");
      }
    });
  }

  return (
    <section className="mb-5 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Icon name="note" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">{t("postGameNotesTitle")}</h3>
          {canEdit && <p className="text-xs text-muted">{t("postGameNotesHint")}</p>}
        </div>
      </div>

      {canEdit ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder={t("postGameNotesPlaceholder")}
            className="mt-3 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <div className="mt-2 flex items-center justify-end gap-3">
            {status === "saved" && <span className="text-xs font-medium text-green-600">✓ {t("postGameNotesSaved")}</span>}
            {status === "failed" && <span className="text-xs text-red-500">{t("liveConfigSaveError")}</span>}
            <button
              type="button"
              disabled={isSaving || notes === savedNotes}
              onClick={handleSave}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSaving ? t("savingClub") : t("videoSaveButton")}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-sm">{savedNotes}</p>
      )}
    </section>
  );
}
