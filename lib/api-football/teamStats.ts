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
// this season. Only the fields SeasonStatsGrid renders need to be accurate;
// biggest win/loss can't be meaningfully combined, so it's left blank.
export function combineTeamStats(all: TeamStatistics[]): TeamStatistics | null {
  if (all.length === 0) return null;

  const played = all.reduce((sum, s) => sum + s.fixtures.played.total, 0);
  const wins = all.reduce((sum, s) => sum + s.fixtures.wins.total, 0);
  const draws = all.reduce((sum, s) => sum + s.fixtures.draws.total, 0);
  const loses = all.reduce((sum, s) => sum + s.fixtures.loses.total, 0);
  const goalsFor = all.reduce((sum, s) => sum + s.goals.for.total.total, 0);
  const goalsAgainst = all.reduce((sum, s) => sum + s.goals.against.total.total, 0);
  const cleanSheets = all.reduce((sum, s) => sum + s.clean_sheet.total, 0);

  return {
    fixtures: {
      played: { total: played },
      wins: { total: wins },
      draws: { total: draws },
      loses: { total: loses },
    },
    goals: {
      for: {
        total: { total: goalsFor },
        average: { total: played > 0 ? (goalsFor / played).toFixed(1) : "0" },
      },
      against: {
        total: { total: goalsAgainst },
        average: { total: played > 0 ? (goalsAgainst / played).toFixed(1) : "0" },
      },
    },
    clean_sheet: { total: cleanSheets },
    biggest: {
      wins: { home: null, away: null },
      loses: { home: null, away: null },
    },
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
