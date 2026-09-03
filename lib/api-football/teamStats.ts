import "server-only";
import { getTeamLeague, getTeamStatistics } from "./cache";
import type { TeamLeague, TeamStatistics } from "./client";

export const COMPETITION_FILTER_COOKIE = "competicao_filtro";

// The cookie stores a league id chosen against the coach's own team. A page
// showing a different team (an opponent, a player) must check that team is
// actually registered in that same competition before applying it — falls
// back to "all" (null) when it isn't, rather than showing empty data.
export function resolveSelectedCompetition(
  cookieValue: string | undefined,
  competitions: TeamLeague[],
): number | null {
  if (!cookieValue || cookieValue === "all") return null;
  const id = Number(cookieValue);
  return competitions.some((c) => c.league.id === id) ? id : null;
}

function isFriendlyLeague(name: string): boolean {
  return /friendl/i.test(name);
}

// Only competitions actually being disputed this season — anything not
// marked as the current edition is dropped (the API otherwise mixes in
// reserve/youth teams and past seasons still flagged oddly). Friendlies are
// kept separate: selectable on their own, but never folded into "all
// competitions" totals since they're not a real competition.
export async function getCurrentCompetitions(teamId: number): Promise<{
  competitions: TeamLeague[];
  friendlyCompetitions: TeamLeague[];
  allCompetitions: TeamLeague[];
  defaultCompetition: TeamLeague | null;
  defaultSeason: number | null;
}> {
  const leagues = await getTeamLeague(teamId);

  const defaultCompetition =
    leagues.find(
      (l) =>
        l.league.type === "League" &&
        !isFriendlyLeague(l.league.name) &&
        l.seasons.some((s) => s.current),
    ) ?? leagues.find((l) => !isFriendlyLeague(l.league.name) && l.seasons.some((s) => s.current)) ?? null;
  const defaultSeason = defaultCompetition?.seasons.find((s) => s.current)?.year ?? null;

  // Match by season year, not the `current` flag — some competitions
  // (continental cups especially, e.g. CAF Champions League) have a season
  // entry for the right year but the API never marks it `current: true`,
  // which would otherwise silently drop every game the team played there.
  const currentSeasonLeagues = leagues.filter((l) =>
    l.seasons.some((s) => s.year === defaultSeason),
  );

  const competitions = currentSeasonLeagues.filter((l) => !isFriendlyLeague(l.league.name));
  const friendlyCompetitions = currentSeasonLeagues.filter((l) => isFriendlyLeague(l.league.name));

  return {
    competitions,
    friendlyCompetitions,
    allCompetitions: [...competitions, ...friendlyCompetitions],
    defaultCompetition,
    defaultSeason,
  };
}

// The API only gives team statistics scoped to a single competition — "all
// competitions" is a manual sum across each one the team is registered in
// this season. Everything here is plain arithmetic (totals, home/away
// splits, penalties) so it combines cleanly; biggest win/loss and streaks
// don't (the API's own figures are per-competition and can't be summed
// meaningfully), so those are computed separately, straight from the
// season's match results — see computeBiggestAndStreaks below.
function sumField(all: TeamStatistics[], pick: (s: TeamStatistics) => number | undefined): number {
  return all.reduce((sum, s) => sum + (pick(s) ?? 0), 0);
}

export function combineTeamStats(all: TeamStatistics[]): TeamStatistics | null {
  if (all.length === 0) return null;

  const played = {
    home: sumField(all, (s) => s.fixtures.played.home),
    away: sumField(all, (s) => s.fixtures.played.away),
    total: sumField(all, (s) => s.fixtures.played.total),
  };
  const wins = {
    home: sumField(all, (s) => s.fixtures.wins.home),
    away: sumField(all, (s) => s.fixtures.wins.away),
    total: sumField(all, (s) => s.fixtures.wins.total),
  };
  const draws = {
    home: sumField(all, (s) => s.fixtures.draws.home),
    away: sumField(all, (s) => s.fixtures.draws.away),
    total: sumField(all, (s) => s.fixtures.draws.total),
  };
  const loses = {
    home: sumField(all, (s) => s.fixtures.loses.home),
    away: sumField(all, (s) => s.fixtures.loses.away),
    total: sumField(all, (s) => s.fixtures.loses.total),
  };
  const goalsFor = {
    home: sumField(all, (s) => s.goals.for.total.home),
    away: sumField(all, (s) => s.goals.for.total.away),
    total: sumField(all, (s) => s.goals.for.total.total),
  };
  const goalsAgainst = {
    home: sumField(all, (s) => s.goals.against.total.home),
    away: sumField(all, (s) => s.goals.against.total.away),
    total: sumField(all, (s) => s.goals.against.total.total),
  };
  const cleanSheet = {
    home: sumField(all, (s) => s.clean_sheet.home),
    away: sumField(all, (s) => s.clean_sheet.away),
    total: sumField(all, (s) => s.clean_sheet.total),
  };
  const penaltyScored = sumField(all, (s) => s.penalty?.scored.total);
  const penaltyMissed = sumField(all, (s) => s.penalty?.missed.total);
  const penaltyTotal = penaltyScored + penaltyMissed;

  return {
    fixtures: { played, wins, draws, loses },
    goals: {
      for: {
        total: goalsFor,
        average: { total: played.total > 0 ? (goalsFor.total / played.total).toFixed(1) : "0" },
      },
      against: {
        total: goalsAgainst,
        average: { total: played.total > 0 ? (goalsAgainst.total / played.total).toFixed(1) : "0" },
      },
    },
    clean_sheet: cleanSheet,
    biggest: {
      wins: { home: null, away: null },
      loses: { home: null, away: null },
    },
    penalty:
      penaltyTotal > 0
        ? {
            scored: { total: penaltyScored, percentage: `${((penaltyScored / penaltyTotal) * 100).toFixed(0)}%` },
            missed: { total: penaltyMissed, percentage: `${((penaltyMissed / penaltyTotal) * 100).toFixed(0)}%` },
            total: penaltyTotal,
          }
        : undefined,
  };
}

export interface BiggestAndStreaks {
  biggestWin: { goalsFor: number; goalsAgainst: number; isHome: boolean } | null;
  biggestLoss: { goalsFor: number; goalsAgainst: number; isHome: boolean } | null;
  longestWinStreak: number;
  longestDrawStreak: number;
  longestLossStreak: number;
}

// Computed straight from the season's match results (not the API's
// per-competition `biggest`/streak figures) so it's accurate whether "all
// competitions" or a single one is selected.
export function computeBiggestAndStreaks(
  matches: { goalsFor: number | null; goalsAgainst: number | null; isHome: boolean; result: "W" | "D" | "L" | null }[],
): BiggestAndStreaks {
  const played = matches.filter(
    (m): m is typeof m & { goalsFor: number; goalsAgainst: number; result: "W" | "D" | "L" } =>
      m.result != null && m.goalsFor != null && m.goalsAgainst != null,
  );

  const wins = played.filter((m) => m.result === "W");
  const biggestWinMatch =
    wins.length > 0
      ? wins.reduce((best, m) => (m.goalsFor - m.goalsAgainst > best.goalsFor - best.goalsAgainst ? m : best))
      : null;
  const losses = played.filter((m) => m.result === "L");
  const biggestLossMatch =
    losses.length > 0
      ? losses.reduce((worst, m) =>
          m.goalsAgainst - m.goalsFor > worst.goalsAgainst - worst.goalsFor ? m : worst,
        )
      : null;

  const streaks = played.reduce<{ current: { result: "W" | "D" | "L"; count: number } | null; longest: Record<"W" | "D" | "L", number> }>(
    (acc, m) => {
      const count = acc.current && acc.current.result === m.result ? acc.current.count + 1 : 1;
      return {
        current: { result: m.result, count },
        longest: { ...acc.longest, [m.result]: Math.max(acc.longest[m.result], count) },
      };
    },
    { current: null, longest: { W: 0, D: 0, L: 0 } },
  );

  return {
    biggestWin: biggestWinMatch
      ? {
          goalsFor: biggestWinMatch.goalsFor,
          goalsAgainst: biggestWinMatch.goalsAgainst,
          isHome: biggestWinMatch.isHome,
        }
      : null,
    biggestLoss: biggestLossMatch
      ? {
          goalsFor: biggestLossMatch.goalsFor,
          goalsAgainst: biggestLossMatch.goalsAgainst,
          isHome: biggestLossMatch.isHome,
        }
      : null,
    longestWinStreak: streaks.longest.W,
    longestDrawStreak: streaks.longest.D,
    longestLossStreak: streaks.longest.L,
  };
}

export async function getStatsPerCompetition(
  teamId: number,
  competitions: TeamLeague[],
  fallbackSeason: number,
): Promise<Map<number, TeamStatistics>> {
  const results = await Promise.all(
    competitions.map((c) =>
      getTeamStatistics(
        teamId,
        c.league.id,
        c.seasons.find((s) => s.current)?.year ?? fallbackSeason,
      ).catch(() => null),
    ),
  );

  const byCompetitionId = new Map<number, TeamStatistics>();
  competitions.forEach((c, i) => {
    const stats = results[i];
    if (stats) byCompetitionId.set(c.league.id, stats);
  });
  return byCompetitionId;
}

export async function getCombinedTeamStatistics(
  teamId: number,
  competitions: TeamLeague[],
  fallbackSeason: number,
): Promise<TeamStatistics | null> {
  const byCompetitionId = await getStatsPerCompetition(teamId, competitions, fallbackSeason);
  return combineTeamStats(Array.from(byCompetitionId.values()));
}
