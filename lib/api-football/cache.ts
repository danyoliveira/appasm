import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchTeamInfo,
  fetchSquad,
  fetchNextFixtures,
  fetchLastFixtures,
  fetchTeamSeasonFixtures,
  fetchCountries,
  fetchTeamsByCountry,
  fetchLeaguesByTeam,
  fetchStandings,
  fetchTopScorers,
  fetchTransfers,
  fetchInjuries,
  fetchTeamStatistics,
  fetchHeadToHead,
  fetchPlayerProfile,
  fetchAllPlayersStatistics,
  fetchSidelined,
  fetchPlayerTransfers,
  fetchTrophies,
  fetchFixturePlayers,
  fetchFixtureById,
  fetchFixtureEvents,
  fetchFixtureLineups,
  fetchFixtureStatistics,
  fetchPredictions,
  type TeamSearchResult,
  type SquadResponse,
  type Fixture,
  type Country,
  type TeamLeague,
  type StandingRow,
  type TopScorer,
  type TeamTransfer,
  type Injury,
  type TeamStatistics,
  type PlayerProfile,
  type PlayerSeasonStats,
  type Sidelined,
  type Trophy,
  type FixturePlayersResponse,
  type FixtureDetail,
  type FixtureEvent,
  type FixtureLineup,
  type FixtureTeamStatistics,
  type FixturePrediction,
} from "./client";

const TTL_MS = {
  team: 24 * 60 * 60 * 1000,
  squad: 12 * 60 * 60 * 1000,
  fixtures: 60 * 60 * 1000,
  countries: 90 * 24 * 60 * 60 * 1000,
  teamsByCountry: 30 * 24 * 60 * 60 * 1000,
  leagues: 30 * 24 * 60 * 60 * 1000,
  standings: 6 * 60 * 60 * 1000,
  topScorers: 24 * 60 * 60 * 1000,
  transfers: 3 * 24 * 60 * 60 * 1000,
  injuries: 6 * 60 * 60 * 1000,
  teamStatistics: 24 * 60 * 60 * 1000,
  headToHead: 24 * 60 * 60 * 1000,
  playerProfile: 90 * 24 * 60 * 60 * 1000,
  sidelined: 7 * 24 * 60 * 60 * 1000,
  playerTransfers: 7 * 24 * 60 * 60 * 1000,
  trophies: 30 * 24 * 60 * 60 * 1000,
  fixturePlayers: 30 * 24 * 60 * 60 * 1000,
  seasonFixtures: 6 * 60 * 60 * 1000,
  fixtureDetail: 6 * 60 * 60 * 1000,
  predictions: 6 * 60 * 60 * 1000,
};

async function cached<T>(
  cacheKey: string,
  teamId: number | null,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("api_football_cache")
    .select("payload, fetched_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (data && Date.now() - new Date(data.fetched_at).getTime() < ttlMs) {
    return data.payload as T;
  }

  try {
    const payload = await fetcher();
    await admin
      .from("api_football_cache")
      .upsert({ cache_key: cacheKey, team_id: teamId, payload, fetched_at: new Date().toISOString() });
    return payload;
  } catch (err) {
    // Serve stale data rather than nothing if we have it (e.g. API-Football
    // rate limit hit) — better an outdated squad than a crashed dashboard.
    if (data) {
      return data.payload as T;
    }
    throw err;
  }
}

export const getTeamInfo = (teamId: number) =>
  cached<TeamSearchResult[]>(`team:${teamId}:info`, teamId, TTL_MS.team, () =>
    fetchTeamInfo(teamId),
  );

export const getSquad = (teamId: number) =>
  cached<SquadResponse[]>(`team:${teamId}:squad`, teamId, TTL_MS.squad, () =>
    fetchSquad(teamId),
  );

export const getNextFixtures = (teamId: number) =>
  cached<Fixture[]>(`team:${teamId}:fixtures:next`, teamId, TTL_MS.fixtures, () =>
    fetchNextFixtures(teamId),
  );

export const getLastFixtures = (teamId: number) =>
  cached<Fixture[]>(`team:${teamId}:fixtures:last`, teamId, TTL_MS.fixtures, () =>
    fetchLastFixtures(teamId),
  );

export const getTeamSeasonFixtures = (teamId: number, season: number) =>
  cached<Fixture[]>(
    `team:${teamId}:${season}:fixtures:all`,
    teamId,
    TTL_MS.seasonFixtures,
    () => fetchTeamSeasonFixtures(teamId, season),
  );

export const getTeamLeague = (teamId: number) =>
  cached<TeamLeague[]>(`team:${teamId}:leagues`, teamId, TTL_MS.leagues, () =>
    fetchLeaguesByTeam(teamId),
  );

export const getStandings = (league: number, season: number) =>
  cached<{ league: { standings: StandingRow[][] } }[]>(
    `league:${league}:${season}:standings`,
    null,
    TTL_MS.standings,
    () => fetchStandings(league, season),
  );

export const getTopScorers = (league: number, season: number) =>
  cached<TopScorer[]>(
    `league:${league}:${season}:topscorers`,
    null,
    TTL_MS.topScorers,
    () => fetchTopScorers(league, season),
  );

export const getTransfers = (teamId: number) =>
  cached<TeamTransfer[]>(`team:${teamId}:transfers`, teamId, TTL_MS.transfers, () =>
    fetchTransfers(teamId),
  );

export const getInjuries = (teamId: number, season: number) =>
  cached<Injury[]>(`team:${teamId}:${season}:injuries`, teamId, TTL_MS.injuries, () =>
    fetchInjuries(teamId, season),
  );

export const getTeamStatistics = (teamId: number, league: number, season: number) =>
  cached<TeamStatistics>(
    `team:${teamId}:${league}:${season}:stats`,
    teamId,
    TTL_MS.teamStatistics,
    () => fetchTeamStatistics(teamId, league, season),
  );

export const getHeadToHead = (teamIdA: number, teamIdB: number) =>
  cached<Fixture[]>(
    `h2h:${[teamIdA, teamIdB].sort((a, b) => a - b).join("-")}`,
    null,
    TTL_MS.headToHead,
    () => fetchHeadToHead(teamIdA, teamIdB),
  );

export const getPlayersStatistics = (teamId: number, season: number) =>
  cached<PlayerSeasonStats[]>(
    `team:${teamId}:${season}:players-stats`,
    teamId,
    TTL_MS.teamStatistics,
    () => fetchAllPlayersStatistics(teamId, season),
  );

export const getPlayerProfile = (playerId: number) =>
  cached<PlayerProfile[]>(`player:${playerId}:profile`, null, TTL_MS.playerProfile, () =>
    fetchPlayerProfile(playerId),
  );

export const getSidelined = (playerId: number) =>
  cached<Sidelined[]>(`player:${playerId}:sidelined`, null, TTL_MS.sidelined, () =>
    fetchSidelined(playerId),
  );

export const getPlayerTransfers = (playerId: number) =>
  cached<TeamTransfer[]>(`player:${playerId}:transfers`, null, TTL_MS.playerTransfers, () =>
    fetchPlayerTransfers(playerId),
  );

export const getTrophies = (playerId: number) =>
  cached<Trophy[]>(`player:${playerId}:trophies`, null, TTL_MS.trophies, () =>
    fetchTrophies(playerId),
  );

export const getFixturePlayers = (fixtureId: number) =>
  cached<FixturePlayersResponse[]>(
    `fixture:${fixtureId}:players`,
    null,
    TTL_MS.fixturePlayers,
    () => fetchFixturePlayers(fixtureId),
  );

export const getFixtureById = (fixtureId: number) =>
  cached<FixtureDetail[]>(`fixture:${fixtureId}:detail`, null, TTL_MS.fixtureDetail, () =>
    fetchFixtureById(fixtureId),
  );

export const getFixtureEvents = (fixtureId: number) =>
  cached<FixtureEvent[]>(`fixture:${fixtureId}:events`, null, TTL_MS.fixturePlayers, () =>
    fetchFixtureEvents(fixtureId),
  );

export const getFixtureLineups = (fixtureId: number) =>
  cached<FixtureLineup[]>(`fixture:${fixtureId}:lineups`, null, TTL_MS.fixturePlayers, () =>
    fetchFixtureLineups(fixtureId),
  );

export const getFixtureStatistics = (fixtureId: number) =>
  cached<FixtureTeamStatistics[]>(`fixture:${fixtureId}:stats`, null, TTL_MS.fixturePlayers, () =>
    fetchFixtureStatistics(fixtureId),
  );

export const getPredictions = (fixtureId: number) =>
  cached<FixturePrediction[]>(`fixture:${fixtureId}:predictions`, null, TTL_MS.predictions, () =>
    fetchPredictions(fixtureId),
  );

/** Picks the team's current domestic league + season (favors "League" over "Cup"). */
export async function getCurrentLeagueAndSeason(teamId: number) {
  const leagues = await getTeamLeague(teamId);
  const currentLeague =
    leagues.find((l) => l.league.type === "League" && l.seasons.some((s) => s.current)) ??
    leagues.find((l) => l.seasons.some((s) => s.current));
  const currentSeason = currentLeague?.seasons.find((s) => s.current);

  return currentLeague && currentSeason
    ? {
        league: currentLeague.league,
        season: currentSeason.year,
        seasonStart: currentSeason.start,
        seasonEnd: currentSeason.end,
      }
    : null;
}

export const getCountries = () =>
  cached<Country[]>("countries:all", null, TTL_MS.countries, () => fetchCountries());

export const getTeamsByCountry = (country: string) =>
  cached<TeamSearchResult[]>(
    `country:${country}:teams`,
    null,
    TTL_MS.teamsByCountry,
    () => fetchTeamsByCountry(country),
  );
