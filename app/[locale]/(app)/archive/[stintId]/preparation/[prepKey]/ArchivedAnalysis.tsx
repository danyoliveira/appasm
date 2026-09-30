"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionHeading } from "../../../../OpponentScouting";
import TeamTabs from "../../../../preparations/TeamTabs";
import TacticalSnapshotList, {
  type TacticalSnapshotRow,
} from "../../../../preparations/TacticalSnapshotList";
import PreparationVideoList, {
  type PreparationVideoRow,
} from "../../../../preparations/PreparationVideoList";
import { useTeamColors } from "../../../../preparations/useTeamColors";
import type { Team } from "../../../../preparations/TacticalBoard";

// The archived preparation's pre-game work, read-only: the same
// "Adversário" / "Nossa Equipa" split (and club colours) as the live
// preparation page, without the board or the forms.
export default function ArchivedAnalysis({
  tacticalRows,
  videoRows,
  ourLogo,
  opponentLogo,
}: {
  tacticalRows: TacticalSnapshotRow[];
  videoRows: PreparationVideoRow[];
  ourLogo?: string;
  opponentLogo?: string;
}) {
  const t = useTranslations("dashboard");
  const teamColors = useTeamColors(ourLogo, opponentLogo);
  const hasContent = (team: Team) =>
    tacticalRows.some((r) => r.team === team) || videoRows.some((r) => r.team === team);
  // Opens on whichever team actually has something saved.
  const [activeTeam, setActiveTeam] = useState<Team>(
    hasContent("opponent") || !hasContent("us") ? "opponent" : "us",
  );

  const teamTactics = tacticalRows.filter((r) => r.team === activeTeam);
  const teamVideos = videoRows.filter((r) => r.team === activeTeam);

  return (
    <div className="space-y-4">
      <TeamTabs activeTeam={activeTeam} onChange={setActiveTeam} teamColors={teamColors} />

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <SectionHeading icon="target" title={t("tacticalAnalysisTitle")} count={teamTactics.length} />
        <TacticalSnapshotList rows={teamTactics} isCoach={false} teamColors={teamColors} />
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <SectionHeading icon="video" title={t("videoAnalysisTitle")} count={teamVideos.length} />
        <PreparationVideoList rows={teamVideos} isCoach={false} />
      </section>
    </div>
  );
}
