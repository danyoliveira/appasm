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
  fetchTopAssists,
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
  fetchPlayerSeasonStatsById,
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
  // Short-lived — unlike fixturePlayers (a fixed post-match record), lineups
  // flip from unavailable to published in the ~1h before kickoff, so a long
  // cache would keep reporting "not available" past the point it isn't true.
  lineups: 5 * 60 * 1000,
  seasonFixtures: 6 * 60 * 60 * 1000,
  fixtureDetail: 6 * 60 * 60 * 1000,
  predictions: 6 * 60 * 60 * 1000,
};

// In-memory layer on top of the api_football_cache table: a page like Meu
// Clube reads dozens of cached API responses (squad, every player's
// profile, every played fixture…), and each one was a database round trip
// on every load. Entries live at most MEMORY_TTL_MS (or less, if the data
// itself expires sooner), so data refreshed elsewhere shows up within
// minutes even with several server instances. Kept on globalThis so dev
// hot reloads don't empty it.
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MEMORY_MAX_ENTRIES = 5000;
type MemoryEntry = { payload: unknown; teamId: number | null; storedAt: number; expiresAt: number };
const memory: Map<string, MemoryEntry> = ((globalThis as { __asmApiMemory?: Map<string, MemoryEntry> }).__asmApiMemory ??=
  new Map());
const inFlight: Map<string, Promise<unknown>> = ((globalThis as { __asmApiInFlight?: Map<string, Promise<unknown>> })
  .__asmApiInFlight ??= new Map());

function remember(cacheKey: string, teamId: number | null, payload: unknown, fetchedAt: number, ttlMs: number) {
  const now = Date.now();
  memory.delete(cacheKey); // re-insert → most recent at the end
  memory.set(cacheKey, {
    payload,
    teamId,
    storedAt: now,
    expiresAt: Math.min(fetchedAt + ttlMs, now + MEMORY_TTL_MS),
  });
  if (memory.size > MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
}

// "Atualizar agora": drop this club's entries from memory too.
export function forgetCachedTeamData(teamId: number) {
  for (const [key, entry] of memory) if (entry.teamId === teamId) memory.delete(key);
}

async function cached<T>(
  cacheKey: string,
  teamId: number | null,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = memory.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.payload as T;

  // The same key requested several times at once (parallel page sections)
  // is read/fetched once.
  const pending = inFlight.get(cacheKey);
  if (pending) return pending as Promise<T>;
  const promise = cachedFromTable(cacheKey, teamId, ttlMs, fetcher).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, promise);
  return promise;
}

async function cachedFromTable<T>(
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
    remember(cacheKey, teamId, data.payload, new Date(data.fetched_at).getTime(), ttlMs);
    return data.payload as T;
  }

  try {
    const payload = await fetcher();
    await admin
      .from("api_football_cache")
      .upsert({ cache_key: cacheKey, team_id: teamId, payload, fetched_at: new Date().toISOString() });
    remember(cacheKey, teamId, payload, Date.now(), ttlMs);
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

export const getNextFixtures = (teamId: number, league?: number, season?: number) =>
  cached<Fixture[]>(
    `team:${teamId}:fixtures:next:${league ?? "all"}`,
    teamId,
    TTL_MS.fixtures,
    () => fetchNextFixtures(teamId, 5, league, season),
  );

export const getLastFixtures = (teamId: number, league?: number, season?: number) =>
  cached<Fixture[]>(
    `team:${teamId}:fixtures:last:${league ?? "all"}`,
    teamId,
    TTL_MS.fixtures,
    () => fetchLastFixtures(teamId, 5, league, season),
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

export const getTopAssists = (league: number, season: number) =>
  cached<TopScorer[]>(
    `league:${league}:${season}:topassists`,
    null,
    TTL_MS.topScorers,
    () => fetchTopAssists(league, season),
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

export const getHeadToHead = (teamIdA: number, teamIdB: number, count = 3) =>
  cached<Fixture[]>(
    // `count` is part of the key so bumping it invalidates the old,
    // larger-window cache entries instead of serving them until TTL expiry.
    `h2h:${[teamIdA, teamIdB].sort((a, b) => a - b).join("-")}:${count}`,
    null,
    TTL_MS.headToHead,
    () => fetchHeadToHead(teamIdA, teamIdB, count),
  );

export const getPlayersStatistics = (teamId: number, season: number) =>
  cached<PlayerSeasonStats[]>(
    `team:${teamId}:${season}:players-stats`,
    teamId,
    TTL_MS.teamStatistics,
    () => fetchAllPlayersStatistics(teamId, season),
  );

export const getPlayerSeasonStatsById = (playerId: number, season: number) =>
  cached<PlayerSeasonStats[]>(
    `player:${playerId}:${season}:stats-by-id`,
    null,
    TTL_MS.teamStatistics,
    () => fetchPlayerSeasonStatsById(playerId, season),
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

// `finished`: a played fixture's lineups never change again, so they get the
// same long TTL as its other post-match data. Without it, the club and
// player pages — which read every past fixture's lineups to verify minutes
// and appearances — re-fetched all of them from API-Football every 5
// minutes (the pre-kickoff TTL), making those pages take tens of seconds.
export const getFixtureLineups = (fixtureId: number, { finished = false }: { finished?: boolean } = {}) =>
  cached<FixtureLineup[]>(
    `fixture:${fixtureId}:lineups`,
    null,
    finished ? TTL_MS.fixturePlayers : TTL_MS.lineups,
    () => fetchFixtureLineups(fixtureId),
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
