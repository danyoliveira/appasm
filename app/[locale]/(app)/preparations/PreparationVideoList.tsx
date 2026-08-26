"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { deletePreparationVideo, updatePreparationVideo } from "../actions";
import { VIDEO_CATEGORIES, type VideoCategory, type VideoPlayerOption } from "./videoCategories";
import type { Team } from "./TacticalBoard";
import ConfirmDialog from "@/components/ConfirmDialog";

const CATEGORY_LABEL_KEYS: Record<VideoCategory, string> = {
  attack: "videoCategoryAttack",
  defense: "videoCategoryDefense",
  set_pieces: "videoCategorySetPieces",
  transitions: "videoCategoryTransitions",
};

export interface PreparationVideoRow {
  id: string;
  url: string;
  notes: string | null;
  embedUrl: string | null;
  category: VideoCategory | null;
  player: { id: number; name: string; photo: string } | null;
  team: Team;
}

function EditVideoForm({
  row,
  players,
  onDone,
}: {
  row: PreparationVideoRow;
  players: VideoPlayerOption[];
  onDone: () => void;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [url, setUrl] = useState(row.url);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [category, setCategory] = useState(row.category ?? "");
  const [playerId, setPlayerId] = useState(row.player ? String(row.player.id) : "");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSave() {
    if (!url.trim()) return;
    setError(null);
    startSaving(async () => {
      try {
        await updatePreparationVideo(
          row.id,
          url.trim(),
          notes,
          (category || null) as VideoCategory | null,
          playerId ? Number(playerId) : null,
          row.team,
        );
        router.refresh();
        onDone();
      } catch {
        setError(t("videoInvalidUrl"));
      }
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs text-muted">{t("videoUrlLabel")}</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!url.trim() || isSaving}
          onClick={handleSave}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? t("savingClub") : t("videoSaveButton")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-medium text-muted hover:text-foreground"
        >
          {t("cancelButton")}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

export default function PreparationVideoList({
  rows,
  isCoach,
  players = [],
}: {
  rows: PreparationVideoRow[];
  isCoach: boolean;
  players?: VideoPlayerOption[];
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startTransition(async () => {
      await deletePreparationVideo(id);
      setPendingDeleteId(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">{t("videoNoneFound")}</p>;
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className={`rounded-lg border border-border bg-background p-3 ${
            editingId === row.id ? "sm:col-span-2" : ""
          }`}
        >
          {row.embedUrl ? (
            <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                src={row.embedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-accent hover:underline"
            >
              {row.url} ↗
            </a>
          )}

          {(row.category || row.player) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {row.category && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                  {t(CATEGORY_LABEL_KEYS[row.category])}
                </span>
              )}
              {row.player && (
                <Link
                  href={`/club/player/${row.player.id}`}
                  className="flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted hover:text-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.player.photo} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                  {row.player.name}
                </Link>
              )}
            </div>
          )}

          {editingId === row.id ? (
            <EditVideoForm row={row} players={players} onDone={() => setEditingId(null)} />
          ) : (
            <>
              {row.notes && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{row.notes}</p>
              )}

              {isCoach && (
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(row.id)}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    {t("editButton")}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setPendingDeleteId(row.id)}
                    className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
                  >
                    {t("deleteButton")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      <ConfirmDialog
        open={pendingDeleteId != null}
        message={t("confirmDeleteMessage")}
        isPending={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
