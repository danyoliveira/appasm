"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import TacticalAnalysisSection from "./TacticalAnalysisSection";
import VideoAnalysisSection from "./VideoAnalysisSection";
import TeamTabs from "./TeamTabs";
import { useTeamColors } from "./useTeamColors";
import type { Team, OpponentSquadOption, OurSquadOption } from "./TacticalBoard";
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
  sideBySide?: boolean;
  tacticalRows: TacticalSnapshotRow[];
  videoRows: PreparationVideoRow[];
}) {
  const t = useTranslations("dashboard");
  const [activeTeam, setActiveTeam] = useState<Team>("us");
  const teamColors = useTeamColors(ourLogo, opponentLogo);
  const ourPlayers: VideoPlayerOption[] = ourSquad.map((p) => ({ id: p.id, name: p.name }));
  const opponentPlayers: VideoPlayerOption[] = opponentSquad.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-4">
      <TeamTabs activeTeam={activeTeam} onChange={setActiveTeam} teamColors={teamColors} />

      <details open className="group rounded-2xl border border-border bg-surface">
        <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3 text-sm font-semibold">
          {t("tacticalAnalysisTitle")}
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
          />
        </div>
      </details>

      <details open className="group rounded-2xl border border-border bg-surface">
        <summary className="flex cursor-pointer select-none list-none items-center justify-between px-4 py-3 text-sm font-semibold">
          {t("videoAnalysisTitle")}
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
