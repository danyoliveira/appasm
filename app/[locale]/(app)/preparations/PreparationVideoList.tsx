"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { deletePreparationVideo, updatePreparationVideo } from "../actions";
import type { GameSubmoment, VideoCategory, VideoPlayerOption } from "./videoCategories";
import VideoForm, { type VideoFormValues } from "./VideoForm";
import { CATEGORY_LABEL_KEYS, SUBMOMENT_LABEL_KEYS } from "./gameMomentLabels";
import type { Team } from "./TacticalBoard";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExpandableText from "@/components/ExpandableText";

export interface PreparationVideoRow {
  id: string;
  url: string;
  notes: string | null;
  embedUrl: string | null;
  category: VideoCategory | null;
  submoment: GameSubmoment | null;
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
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  function handleSave(values: VideoFormValues) {
    setError(null);
    startSaving(async () => {
      try {
        await updatePreparationVideo(
          row.id,
          values.url,
          values.notes,
          values.category,
          values.submoment,
          values.playerId,
          row.team,
        );
        router.refresh();
        onDone();
      } catch {
        setError(t("liveConfigSaveError"));
      }
    });
  }

  return (
    <div className="mt-3 sm:mt-0">
      <VideoForm
        initial={{
          url: row.url,
          notes: row.notes ?? "",
          category: row.category,
          submoment: row.submoment,
          playerId: row.player?.id ?? null,
        }}
        players={players}
        isSaving={isSaving}
        error={error}
        onSubmit={handleSave}
        onCancel={onDone}
      />
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
    <div className="mt-3 grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className={`rounded-lg border border-border bg-background p-3 ${
            editingId === row.id
              ? "sm:col-span-2 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-start sm:gap-4"
              : ""
          }`}
        >
          {/* While editing: the video stays small on the left, the form on
              the right — instead of a full-width video above the form. */}
          <div className="min-w-0">
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

          {(row.category || row.submoment || row.player) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {row.category && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                  {t(CATEGORY_LABEL_KEYS[row.category])}
                </span>
              )}
              {row.submoment && (
                <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-muted">
                  {t(SUBMOMENT_LABEL_KEYS[row.submoment])}
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
          </div>

          {editingId === row.id ? (
            <EditVideoForm row={row} players={players} onDone={() => setEditingId(null)} />
          ) : (
            <>
              {row.notes && <ExpandableText text={row.notes} className="mt-2 text-sm text-muted" />}

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
