"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import TacticalBoard, { type OpponentSquadOption, type OurSquadOption, type Team } from "./TacticalBoard";
import TacticalSnapshotList, { type TacticalSnapshotRow } from "./TacticalSnapshotList";
import type { TeamColors } from "./useTeamColors";

export default function TacticalAnalysisSection({
  preparationKey,
  opponentSquad,
  ourSquad,
  isCoach,
  sideBySide,
  rows,
  activeTeam,
  onActiveTeamChange,
  teamColors,
}: {
  preparationKey: string;
  opponentSquad: OpponentSquadOption[];
  ourSquad: OurSquadOption[];
  isCoach: boolean;
  sideBySide?: boolean;
  rows: TacticalSnapshotRow[];
  activeTeam: Team;
  onActiveTeamChange: (team: Team) => void;
  teamColors: TeamColors;
}) {
  const t = useTranslations("dashboard");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicateSeed, setDuplicateSeed] = useState<TacticalSnapshotRow | null>(null);
  const editingSnapshot = rows.find((r) => r.id === editingId) ?? null;
  // Each saved analysis is filed under whichever team tab was active when
  // it was saved — the list only ever shows the currently active team's.
  const teamRows = rows.filter((r) => r.team === activeTeam);

  return (
    <>
      <TacticalBoard
        preparationKey={preparationKey}
        opponentSquad={opponentSquad}
        ourSquad={ourSquad}
        isCoach={isCoach}
        sideBySide={sideBySide}
        editingSnapshot={editingSnapshot}
        onCancelEdit={() => setEditingId(null)}
        onSaved={() => setEditingId(null)}
        duplicateSeed={duplicateSeed}
        teamColors={teamColors}
        activeTeam={activeTeam}
      />

      <h4 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">
        {t("tacticalSavedTitle")}
      </h4>
      <TacticalSnapshotList
        rows={teamRows}
        isCoach={isCoach}
        editingId={editingId}
        onEdit={(row) => {
          setDuplicateSeed(null);
          setEditingId(row.id);
          onActiveTeamChange(row.team);
        }}
        onDuplicate={(row) => {
          setEditingId(null);
          setDuplicateSeed(row);
          onActiveTeamChange(row.team);
        }}
        teamColors={teamColors}
      />
    </>
  );
}
