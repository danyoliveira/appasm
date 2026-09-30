"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getLiveMatchRecap, type LiveMatchRecap } from "./liveStatsActions";
import MatchRecap from "../../live/MatchRecap";
import { useTeamColors } from "./useTeamColors";

// The "Pós-Jogo" tab's content — fetched from the authenticated session (no
// token needed, the coach is already logged in), so it's the same report
// the shareable /live/<token> link shows post-match, just reached from the
// dashboard directly.
export default function LiveMatchRecapSection({
  sessionId,
  preparationKey,
}: {
  sessionId: string | null;
  preparationKey: string;
}) {
  const t = useTranslations("dashboard");
  const [recap, setRecap] = useState<LiveMatchRecap | null | undefined>(undefined);

  useEffect(() => {
    if (!sessionId) {
      const id = setTimeout(() => setRecap(null), 0);
      return () => clearTimeout(id);
    }
    let cancelled = false;
    getLiveMatchRecap(sessionId).then((result) => {
      if (!cancelled) setRecap(result);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Each club's colour, as in Live Mode (before the recap loads there are no
  // crests to read them from, so it starts on the defaults).
  const ourIsHome = recap?.ourSide !== "away";
  const teamColors = useTeamColors(
    recap ? (ourIsHome ? recap.homeLogo : recap.awayLogo) : undefined,
    recap ? (ourIsHome ? recap.awayLogo : recap.homeLogo) : undefined,
  );
  const ours = { background: teamColors.usColor, text: teamColors.usTextColor };
  const theirs = { background: teamColors.opponentColor, text: teamColors.opponentTextColor };

  if (recap === undefined) {
    return <p className="text-sm text-muted">{t("liveStatsRecapLoading")}</p>;
  }

  if (!recap) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
        {t("liveStatsRecapNotAvailable")}
      </div>
    );
  }

  return (
    <MatchRecap
      tokenColors={{ home: ourIsHome ? ours : theirs, away: ourIsHome ? theirs : ours }}
      homeLogo={recap.homeLogo}
      awayLogo={recap.awayLogo}
      preparationKey={preparationKey}
      homeName={recap.homeName}
      awayName={recap.awayName}
      homePlayers={recap.homeLineup.players}
      awayPlayers={recap.awayLineup.players}
      ourPlayers={recap.ourSide === "home" ? recap.homeLineup.players : recap.awayLineup.players}
      statConfig={recap.statConfig}
      entries={recap.entries}
      collectiveStats={recap.collectiveStats}
      ourGkStats={recap.ourSide === "home" ? recap.gkStats.home : recap.gkStats.away}
      ourGkIncomplete={recap.ourSide === "home" ? recap.gkStats.homeIncomplete : recap.gkStats.awayIncomplete}
      ourGkName={recap.ourSide === "home" ? recap.gkStats.homeGkName : recap.gkStats.awayGkName}
      ourGkStatsByPlayer={recap.ourSide === "home" ? recap.gkStats.homeByPlayer : recap.gkStats.awayByPlayer}
      ourTeamName={recap.ourSide === "home" ? recap.homeName : recap.awayName}
    />
  );
}
