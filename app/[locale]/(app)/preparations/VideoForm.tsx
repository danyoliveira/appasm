"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import MomentFields, { FIELD_LABEL_CLASS } from "./MomentFields";
import type { GameSubmoment, VideoCategory, VideoPlayerOption } from "./videoCategories";

export interface VideoFormValues {
  url: string;
  notes: string;
  category: VideoCategory | null;
  submoment: GameSubmoment | null;
  playerId: number | null;
}

// Add / edit a preparation video — same panel as the tactical board's:
// category chips, notes, then the link with Guardar on one row.
export default function VideoForm({
  title,
  initial,
  players,
  isSaving,
  error,
  onSubmit,
  onCancel,
}: {
  title?: string;
  initial?: Partial<VideoFormValues>;
  players: VideoPlayerOption[];
  isSaving: boolean;
  error: string | null;
  onSubmit: (values: VideoFormValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("dashboard");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [category, setCategory] = useState<VideoCategory | "">(initial?.category ?? "");
  const [submoment, setSubmoment] = useState<GameSubmoment | "">(initial?.submoment ?? "");
  const [playerId, setPlayerId] = useState<number | "">(initial?.playerId ?? "");
  const [urlError, setUrlError] = useState(false);

  function handleCategoryChange(value: VideoCategory | "") {
    setCategory(value);
    setSubmoment("");
    setPlayerId("");
  }

  function submit() {
    if (!url.trim()) return;
    // Checked here so "Link inválido" only ever means the link — a failed
    // save shows the caller's own error instead.
    let valid = false;
    try {
      const parsed = new URL(url.trim());
      valid = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      valid = false;
    }
    setUrlError(!valid);
    if (!valid) return;
    onSubmit({
      url: url.trim(),
      notes,
      category: category || null,
      submoment: submoment || null,
      playerId: category === "player" && playerId !== "" ? playerId : null,
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        {title ? <h4 className="text-sm font-semibold">{title}</h4> : <span />}
        <button type="button" onClick={onCancel} className="text-xs font-medium text-muted hover:text-foreground">
          {t("cancelButton")}
        </button>
      </div>

      <MomentFields
        category={category}
        onCategoryChange={handleCategoryChange}
        submoment={submoment}
        onSubmomentChange={setSubmoment}
        players={players}
        playerId={playerId}
        onPlayerChange={setPlayerId}
      />

      <div>
        <label className={FIELD_LABEL_CLASS}>{t("videoNotesLabel")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className={FIELD_LABEL_CLASS}>{t("videoUrlLabel")}</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!url.trim() || isSaving}
            onClick={submit}
            className="w-full rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
          >
            {isSaving ? t("savingClub") : t("videoSaveButton")}
          </button>
        </div>
        {(urlError || error) && (
          <p className="mt-2 text-sm text-red-500">{urlError ? t("videoInvalidUrl") : error}</p>
        )}
      </div>
    </div>
  );
}
