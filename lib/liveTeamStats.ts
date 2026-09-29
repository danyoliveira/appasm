import type { TeamManualStatsInput } from "@/app/[locale]/(app)/actions";

// The team's season numbers as recorded in ASM Live Mode — the fallback for
// every internal team stat the coach hasn't typed in (same rule as the
// players' internal stats). Penalties aren't logged there, so they're left
// out. Empty when there are no games.
export function computeLiveTeamStats(
  games: { isHome: boolean; goalsFor: number; goalsAgainst: number }[],
): Partial<TeamManualStatsInput> {
  if (!games.length) return {};

  const split = (list: typeof games) => ({
    played: list.length,
    wins: list.filter((g) => g.goalsFor > g.goalsAgainst).length,
    draws: list.filter((g) => g.goalsFor === g.goalsAgainst).length,
    loses: list.filter((g) => g.goalsFor < g.goalsAgainst).length,
    goalsFor: list.reduce((sum, g) => sum + g.goalsFor, 0),
    goalsAgainst: list.reduce((sum, g) => sum + g.goalsAgainst, 0),
    cleanSheets: list.filter((g) => g.goalsAgainst === 0).length,
  });
  const all = split(games);
  const home = split(games.filter((g) => g.isHome));
  const away = split(games.filter((g) => !g.isHome));

  // Biggest win/loss: largest margin, then most goals scored.
  const byMargin = (a: (typeof games)[number], b: (typeof games)[number]) =>
    Math.abs(b.goalsFor - b.goalsAgainst) - Math.abs(a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor;
  const biggestWin = games.filter((g) => g.goalsFor > g.goalsAgainst).sort(byMargin)[0];
  const biggestLoss = games.filter((g) => g.goalsFor < g.goalsAgainst).sort(byMargin)[0];

  return {
    ...all,
    playedHome: home.played,
    winsHome: home.wins,
    drawsHome: home.draws,
    losesHome: home.loses,
    goalsForHome: home.goalsFor,
    goalsAgainstHome: home.goalsAgainst,
    cleanSheetsHome: home.cleanSheets,
    playedAway: away.played,
    winsAway: away.wins,
    drawsAway: away.draws,
    losesAway: away.loses,
    goalsForAway: away.goalsFor,
    goalsAgainstAway: away.goalsAgainst,
    cleanSheetsAway: away.cleanSheets,
    ...(biggestWin
      ? { biggestWinGoalsFor: biggestWin.goalsFor, biggestWinGoalsAgainst: biggestWin.goalsAgainst }
      : {}),
    ...(biggestLoss
      ? { biggestLossGoalsFor: biggestLoss.goalsFor, biggestLossGoalsAgainst: biggestLoss.goalsAgainst }
      : {}),
  };
}
