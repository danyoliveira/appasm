"use client";

import PreparationVideoList, { type PreparationVideoRow } from "./PreparationVideoList";
import AddPreparationVideo from "./AddPreparationVideo";
import type { Team } from "./TacticalBoard";
import type { VideoPlayerOption } from "./videoCategories";

export default function VideoAnalysisSection({
  preparationKey,
  rows,
  isCoach,
  ourPlayers,
  opponentPlayers,
  activeTeam,
}: {
  preparationKey: string;
  rows: PreparationVideoRow[];
  isCoach: boolean;
  ourPlayers: VideoPlayerOption[];
  opponentPlayers: VideoPlayerOption[];
  activeTeam: Team;
}) {
  // Same filing convention as the tactical snapshots: a video belongs to
  // whichever team tab was active when it was added.
  const teamRows = rows.filter((r) => r.team === activeTeam);
  const players = activeTeam === "us" ? ourPlayers : opponentPlayers;

  return (
    <>
      <PreparationVideoList rows={teamRows} isCoach={isCoach} players={players} />
      {/* Remounts on team switch — a form left open for one team doesn't
          make sense once the player list underneath it has changed. */}
      {isCoach && (
        <AddPreparationVideo key={activeTeam} preparationKey={preparationKey} players={players} team={activeTeam} />
      )}
    </>
  );
}
