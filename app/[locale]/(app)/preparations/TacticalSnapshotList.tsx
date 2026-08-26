"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  deleteTacticalSnapshot,
  type TacticalArrow,
  type TacticalMarker,
  type TacticalPosition,
} from "../actions";
import StaticTacticalPitch from "./StaticTacticalPitch";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { TeamColors } from "./useTeamColors";

export interface TacticalSnapshotRow {
  id: string;
  title: string;
  positions: TacticalPosition[];
  team: "us" | "opponent";
  ball: { x: number; y: number } | null;
  markers: TacticalMarker[];
  arrows: TacticalArrow[];
  notes: string | null;
  videoUrl: string | null;
  videoEmbedUrl: string | null;
}

export default function TacticalSnapshotList({
  rows,
  isCoach,
  editingId,
  onEdit,
  onDuplicate,
  teamColors,
}: {
  rows: TacticalSnapshotRow[];
  isCoach: boolean;
  editingId?: string | null;
  onEdit?: (row: TacticalSnapshotRow) => void;
  onDuplicate?: (row: TacticalSnapshotRow) => void;
  teamColors?: TeamColors;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startTransition(async () => {
      await deleteTacticalSnapshot(id);
      setPendingDeleteId(null);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">{t("tacticalNoneSaved")}</p>;
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const isEditing = editingId === row.id;
        return (
          <div
            key={row.id}
            className={`rounded-lg border bg-background p-3 ${
              isEditing ? "border-accent ring-1 ring-accent" : "border-border"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{row.title}</p>

            <div className="mt-2">
              <StaticTacticalPitch
                positions={row.positions}
                ball={row.ball}
                markers={row.markers}
                arrows={row.arrows}
                teamColors={teamColors}
              />
            </div>

            {row.videoUrl &&
              (row.videoEmbedUrl ? (
                <div className="mt-2 aspect-video w-full overflow-hidden rounded-md bg-black">
                  <iframe
                    src={row.videoEmbedUrl}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <a
                  href={row.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block truncate text-sm font-medium text-accent hover:underline"
                >
                  {row.videoUrl} ↗
                </a>
              ))}

            {row.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{row.notes}</p>}

            {isCoach && (
              <div className="mt-2 flex items-center gap-3">
                {isEditing ? (
                  <span className="text-xs font-medium text-accent">✎ {t("editButton")}</span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit?.(row)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {t("editButton")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicate?.(row)}
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      {t("tacticalDuplicateButton")}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setPendingDeleteId(row.id)}
                      className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
                    >
                      {t("deleteButton")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

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
