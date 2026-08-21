"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { addPreparationVideo } from "../actions";

export default function AddPreparationVideo({ preparationKey }: { preparationKey: string }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit() {
    if (!url.trim()) return;
    setError(null);
    startSaving(async () => {
      try {
        await addPreparationVideo(preparationKey, url.trim(), notes);
        setUrl("");
        setNotes("");
        setIsOpen(false);
        router.refresh();
      } catch {
        setError(t("videoInvalidUrl"));
      }
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        + {t("videoAddButton")}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">{t("videoAddButton")}</h4>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          {t("cancelButton")}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted">{t("videoUrlLabel")}</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">{t("videoNotesLabel")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
        <button
          type="button"
          disabled={!url.trim() || isSaving}
          onClick={handleSubmit}
          className="self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? t("savingClub") : t("videoSaveButton")}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
