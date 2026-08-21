"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  deleteTacticalSnapshot,
  type TacticalArrow,
  type TacticalMarker,
  type TacticalPosition,
} from "../actions";
import StaticTacticalPitch from "./StaticTacticalPitch";

export interface TacticalSnapshotRow {
  id: string;
  positions: TacticalPosition[];
  ball: { x: number; y: number } | null;
  markers: TacticalMarker[];
  arrows: TacticalArrow[];
  notes: string | null;
}

export default function TacticalSnapshotList({
  rows,
  isCoach,
}: {
  rows: TacticalSnapshotRow[];
  isCoach: boolean;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteTacticalSnapshot(id);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">{t("tacticalNoneSaved")}</p>;
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-border bg-background p-3">
          <StaticTacticalPitch
            positions={row.positions}
            ball={row.ball}
            markers={row.markers}
            arrows={row.arrows}
          />
          {row.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{row.notes}</p>}
          {isCoach && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleDelete(row.id)}
              className="mt-2 text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
            >
              {t("deleteButton")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
