"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import TacticalBoard from "./TacticalBoard";
import TacticalSnapshotList, { type TacticalSnapshotRow } from "./TacticalSnapshotList";

interface SquadOption {
  id: number;
  name: string;
  number: number | null;
  photo: string;
  position: string;
}

export default function TacticalAnalysisSection({
  preparationKey,
  squad,
  isCoach,
  sideBySide,
  rows,
}: {
  preparationKey: string;
  squad: SquadOption[];
  isCoach: boolean;
  sideBySide?: boolean;
  rows: TacticalSnapshotRow[];
}) {
  const t = useTranslations("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingSnapshot = rows.find((r) => r.id === editingId) ?? null;

  return (
    <>
      <TacticalBoard
        key={editingSnapshot?.id ?? "new"}
        preparationKey={preparationKey}
        squad={squad}
        isCoach={isCoach}
        sideBySide={sideBySide}
        editingSnapshot={editingSnapshot}
        onCancelEdit={() => setEditingId(null)}
        onSaved={() => setEditingId(null)}
      />

      <h4 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
        {t("tacticalSavedTitle")}
      </h4>
      <TacticalSnapshotList
        rows={rows}
        isCoach={isCoach}
        editingId={editingId}
        onEdit={(row) => setEditingId(row.id)}
      />
    </>
  );
}
