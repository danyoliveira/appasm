"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { addPreparationVideo } from "../actions";
import { VIDEO_CATEGORIES, type VideoCategory, type VideoPlayerOption } from "./videoCategories";
import type { Team } from "./TacticalBoard";

const CATEGORY_LABEL_KEYS: Record<VideoCategory, string> = {
  attack: "videoCategoryAttack",
  defense: "videoCategoryDefense",
  set_pieces: "videoCategorySetPieces",
  transitions: "videoCategoryTransitions",
};

export default function AddPreparationVideo({
  preparationKey,
  players = [],
  team,
}: {
  preparationKey: string;
  players?: VideoPlayerOption[];
  team: Team;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSubmit() {
    if (!url.trim()) return;
    setError(null);
    startSaving(async () => {
      try {
        await addPreparationVideo(
          preparationKey,
          url.trim(),
          notes,
          (category || null) as VideoCategory | null,
          playerId ? Number(playerId) : null,
          team,
        );
        setUrl("");
        setNotes("");
        setCategory("");
        setPlayerId("");
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">{t("videoCategoryLabel")}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="">{t("videoCategoryNone")}</option>
              {VIDEO_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {t(CATEGORY_LABEL_KEYS[key])}
                </option>
              ))}
            </select>
          </div>

          {players.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-muted">{t("videoPlayerLabel")}</label>
              <select
                value={playerId}
                onChange={(e) => setPlayerId(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              >
                <option value="">{t("videoPlayerNone")}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
