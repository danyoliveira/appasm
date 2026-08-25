"use client";

import { useTranslations } from "next-intl";
import type { Team } from "./TacticalBoard";
import type { TeamColors } from "./useTeamColors";

// Shared "Adversário" / "Nossa Equipa" toggle, colored from each club's
// crest — reused by the tactical board and the video analysis list so
// switching teams looks and behaves the same in both places.
export default function TeamTabs({
  activeTeam,
  onChange,
  teamColors,
}: {
  activeTeam: Team;
  onChange: (team: Team) => void;
  teamColors: TeamColors;
}) {
  const t = useTranslations("dashboard");

  return (
    <div className="flex items-center gap-1 rounded-full border border-border bg-background p-0.5">
      <button
        type="button"
        onClick={() => onChange("opponent")}
        style={
          activeTeam === "opponent"
            ? { backgroundColor: teamColors.opponentColor, color: teamColors.opponentTextColor }
            : undefined
        }
        className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          activeTeam === "opponent" ? "" : "text-muted hover:text-foreground"
        }`}
      >
        {t("preparationOpponentLabel")}
      </button>
      <button
        type="button"
        onClick={() => onChange("us")}
        style={
          activeTeam === "us"
            ? { backgroundColor: teamColors.usColor, color: teamColors.usTextColor }
            : undefined
        }
        className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          activeTeam === "us" ? "" : "text-muted hover:text-foreground"
        }`}
      >
        {t("tacticalOurTeamTab")}
      </button>
    </div>
  );
}
