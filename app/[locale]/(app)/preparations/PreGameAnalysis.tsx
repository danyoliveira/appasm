"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import TacticalAnalysisSection from "./TacticalAnalysisSection";
import VideoAnalysisSection from "./VideoAnalysisSection";
import TeamTabs from "./TeamTabs";
import Icon from "@/components/Icon";
import { useTeamColors } from "./useTeamColors";
import type { BenchOption, Team, OpponentSquadOption, OurSquadOption } from "./TacticalBoard";
import type { TacticalSnapshotRow } from "./TacticalSnapshotList";
import type { PreparationVideoRow } from "./PreparationVideoList";
import type { VideoPlayerOption } from "./videoCategories";

// One "Adversário" / "Nossa Equipa" toggle at the top drives both the
// tactical board and the video list below it — switching teams here moves
// both sections together instead of each having its own tab.
export default function PreGameAnalysis({
  preparationKey,
  opponentSquad,
  ourSquad,
  ourLogo,
  opponentLogo,
  isCoach,
  readOnly = false,
  sideBySide,
  tacticalRows,
  videoRows,
}: {
  preparationKey: string;
  opponentSquad: OpponentSquadOption[];
  ourSquad: OurSquadOption[];
  ourLogo?: string;
  opponentLogo?: string;
  isCoach: boolean;
  // Finished preparation — hides the tactical board.
  readOnly?: boolean;
  sideBySide?: boolean;
  tacticalRows: TacticalSnapshotRow[];
  videoRows: PreparationVideoRow[];
}) {
  const t = useTranslations("dashboard");
  const [activeTeam, setActiveTeam] = useState<Team>("us");
  const teamColors = useTeamColors(ourLogo, opponentLogo);
  // Owned here (not inside TacticalBoard) so a player added to the Plantel
  // while building a tactical snapshot is also available to tag in Video
  // Analysis below, instead of being scoped to the board alone. Seeded from
  // every saved snapshot's positions (not just the one being edited) — a
  // custom player only ever gets their name/photo recorded there, so this
  // is what keeps them in the picker across a page reload instead of only
  // reappearing once their specific snapshot is reopened for editing.
  const [customPlayers, setCustomPlayers] = useState<BenchOption[]>(() => {
    const squadIds = new Set([...ourSquad.map((p) => p.id), ...opponentSquad.map((p) => p.id)]);
    const byId = new Map<number, BenchOption>();
    for (const row of tacticalRows) {
      for (const pos of row.positions) {
        if (!squadIds.has(pos.playerId) && !byId.has(pos.playerId)) {
          byId.set(pos.playerId, {
            id: pos.playerId,
            name: pos.name,
            number: pos.number,
            photo: pos.photo,
            position: "Midfielder",
            team: pos.team ?? "opponent",
          });
        }
      }
    }
    return Array.from(byId.values());
  });
  const ourPlayers: VideoPlayerOption[] = [
    ...ourSquad.map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position })),
    ...customPlayers
      .filter((p) => p.team === "us")
      .map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position })),
  ];
  const opponentPlayers: VideoPlayerOption[] = [
    ...opponentSquad.map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position })),
    ...customPlayers
      .filter((p) => p.team === "opponent")
      .map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position })),
  ];

  return (
    <div className="space-y-4">
      <TeamTabs activeTeam={activeTeam} onChange={setActiveTeam} teamColors={teamColors} />

      <details open className="group rounded-2xl border border-border bg-surface shadow-sm">
        <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2.5 text-base font-semibold">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon name="target" className="h-4 w-4" />
            </span>
            {t("tacticalAnalysisTitle")}
          </span>
          <span className="text-muted transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-border p-4">
          <TacticalAnalysisSection
            preparationKey={preparationKey}
            opponentSquad={opponentSquad}
            ourSquad={ourSquad}
            isCoach={isCoach}
            sideBySide={sideBySide}
            rows={tacticalRows}
            activeTeam={activeTeam}
            onActiveTeamChange={setActiveTeam}
            teamColors={teamColors}
            customPlayers={customPlayers}
            onCustomPlayersChange={setCustomPlayers}
            readOnly={readOnly}
          />
        </div>
      </details>

      <details open className="group rounded-2xl border border-border bg-surface shadow-sm">
        <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2.5 text-base font-semibold">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon name="video" className="h-4 w-4" />
            </span>
            {t("videoAnalysisTitle")}
          </span>
          <span className="text-muted transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-border p-4">
          <VideoAnalysisSection
            preparationKey={preparationKey}
            rows={videoRows}
            isCoach={isCoach}
            ourPlayers={ourPlayers}
            opponentPlayers={opponentPlayers}
            activeTeam={activeTeam}
          />
        </div>
      </details>
    </div>
  );
}
