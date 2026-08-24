import "server-only";

// Direct api-sports.io access (not the RapidAPI marketplace gateway) — this
// is the integration already proven working in the Matchzone project, using
// the same API_FOOTBALL_KEY.
const BASE_URL = "https://v3.football.api-sports.io";

export type ApiFootballReason = "not-subscribed" | "rate-limit" | "unknown";

export class ApiFootballError extends Error {
  constructor(
    public status: number,
    public reason: ApiFootballReason,
    message: string,
  ) {
    super(message);
    this.name = "ApiFootballError";
  }
}

function reasonFromMessage(message: string): ApiFootballReason {
  if (/subscri/i.test(message)) return "not-subscribed";
  if (/rate.?limit|request.?limit|quota/i.test(message)) return "rate-limit";
  return "unknown";
}

async function callApiFootball<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, String(value)),
  );

  const res = await fetch(url, {
    headers: {
      "x-apisports-key": process.env.API_FOOTBALL_KEY!,
    },
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const bodyMessage =
      typeof json?.message === "string" ? json.message : `HTTP ${res.status}`;
    throw new ApiFootballError(res.status, reasonFromMessage(bodyMessage), bodyMessage);
  }

  // api-sports.io often returns HTTP 200 even when something's wrong (e.g.
  // daily quota hit), with the real problem inside `errors`.
  const errors = json?.errors;
  const errorMessage: string | undefined = Array.isArray(errors)
    ? errors[0]
    : errors && typeof errors === "object" && Object.keys(errors).length > 0
      ? String(Object.values(errors)[0])
      : undefined;

  if (errorMessage) {
    throw new ApiFootballError(res.status, reasonFromMessage(errorMessage), errorMessage);
  }

  return json.response as T;
}

export interface TeamSearchResult {
  team: { id: number; name: string; logo: string; country: string };
}

export function searchTeams(query: string) {
  return callApiFootball<TeamSearchResult[]>("/teams", { search: query });
}

export interface Country {
  name: string;
  code: string | null;
  flag: string | null;
}

export function fetchCountries() {
  return callApiFootball<Country[]>("/countries");
}

export function fetchTeamsByCountry(country: string) {
  return callApiFootball<TeamSearchResult[]>("/teams", { country });
}

export function fetchTeamInfo(teamId: number) {
  return callApiFootball<TeamSearchResult[]>("/teams", { id: teamId });
}

export interface SquadPlayer {
  id: number;
  name: string;
  age: number;
  number: number | null;
  position: string;
  photo: string;
}

export interface SquadResponse {
  team: { id: number; name: string; logo: string };
  players: SquadPlayer[];
}

export function fetchSquad(teamId: number) {
  return callApiFootball<SquadResponse[]>("/players/squads", { team: teamId });
}

export interface Fixture {
  fixture: { id: number; date: string; venue: { name: string | null } };
  league: { id: number; name: string; logo: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export function fetchNextFixtures(teamId: number, count = 5, league?: number, season?: number) {
  const params: Record<string, string | number> = { team: teamId, next: count };
  if (league) params.league = league;
  if (season) params.season = season;
  return callApiFootball<Fixture[]>("/fixtures", params);
}

export function fetchLastFixtures(teamId: number, count = 5, league?: number, season?: number) {
  const params: Record<string, string | number> = { team: teamId, last: count };
  if (league) params.league = league;
  if (season) params.season = season;
  return callApiFootball<Fixture[]>("/fixtures", params);
}

// Every fixture for the team in a season (all competitions, past + future) —
// used to find every match a specific player featured in, not just the
// last few.
export function fetchTeamSeasonFixtures(teamId: number, season: number) {
  return callApiFootball<Fixture[]>("/fixtures", { team: teamId, season });
}

export interface TeamLeague {
  league: { id: number; name: string; type: string; logo: string };
  country: { name: string; flag: string | null };
  seasons: { year: number; start: string; end: string; current: boolean }[];
}

export function fetchLeaguesByTeam(teamId: number) {
  return callApiFootball<TeamLeague[]>("/leagues", { team: teamId });
}

export interface StandingRow {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  goalsDiff: number;
  form: string | null;
  all: { played: number; win: number; draw: number; lose: number };
}

export function fetchStandings(league: number, season: number) {
  return callApiFootball<{ league: { standings: StandingRow[][] } }[]>(
    "/standings",
    { league, season },
  );
}

export interface TopScorer {
  player: { id: number; name: string; photo: string };
  statistics: { team: { name: string; logo: string }; goals: { total: number | null } }[];
}

export function fetchTopScorers(league: number, season: number) {
  return callApiFootball<TopScorer[]>("/players/topscorers", { league, season });
}

export interface TeamTransfer {
  player: { id: number; name: string };
  transfers: {
    date: string;
    type: string | null;
    teams: {
      in: { id: number; name: string; logo: string };
      out: { id: number; name: string; logo: string };
    };
  }[];
}

export function fetchTransfers(teamId: number) {
  return callApiFootball<TeamTransfer[]>("/transfers", { team: teamId });
}

export interface Injury {
  player: { id: number; name: string; photo: string; type: string; reason: string };
  team: { id: number; name: string; logo: string };
  fixture: { id: number; date: string };
}

export function fetchInjuries(teamId: number, season: number) {
  return callApiFootball<Injury[]>("/injuries", { team: teamId, season });
}

export interface TeamStatistics {
  fixtures: {
    played: { total: number };
    wins: { total: number };
    draws: { total: number };
    loses: { total: number };
  };
  goals: {
    for: { total: { total: number }; average: { total: string } };
    against: { total: { total: number }; average: { total: string } };
  };
  clean_sheet: { total: number };
  biggest: {
    wins: { home: string | null; away: string | null };
    loses: { home: string | null; away: string | null };
  };
}

export function fetchTeamStatistics(teamId: number, league: number, season: number) {
  return callApiFootball<TeamStatistics>("/teams/statistics", {
    team: teamId,
    league,
    season,
  });
}

export function fetchHeadToHead(teamIdA: number, teamIdB: number, count = 5) {
  return callApiFootball<Fixture[]>("/fixtures/headtohead", {
    h2h: `${teamIdA}-${teamIdB}`,
    last: count,
  });
}

export interface PlayerProfile {
  player: {
    id: number;
    name: string;
    age: number | null;
    nationality: string | null;
    photo: string;
    birth: { date: string | null; place: string | null; country: string | null };
    height: string | null;
    weight: string | null;
  };
}

export function fetchPlayerProfile(playerId: number) {
  return callApiFootball<PlayerProfile[]>("/players/profiles", { player: playerId });
}

export interface PlayerSeasonStats {
  player: { id: number; name: string };
  statistics: {
    team: { id: number; name: string; logo: string };
    league: { id: number; name: string; logo: string; season: number };
    games: {
      appearences: number | null;
      lineups: number | null;
      minutes: number | null;
      position: string;
      rating: string | null;
      captain: boolean;
    };
    shots: { total: number | null; on: number | null };
    goals: {
      total: number | null;
      assists: number | null;
      saves: number | null;
      conceded: number | null;
    };
    passes: { total: number | null; key: number | null; accuracy: number | null };
    tackles: { total: number | null; blocks: number | null; interceptions: number | null };
    duels: { total: number | null; won: number | null };
    dribbles: { attempts: number | null; success: number | null };
    fouls: { drawn: number | null; committed: number | null };
    cards: { yellow: number | null; yellowred: number | null; red: number | null };
  }[];
}

export interface FixturePlayersResponse {
  team: { id: number };
  players: {
    player: { id: number; name: string; photo: string };
    statistics: {
      games: {
        minutes: number | null;
        number: number | null;
        position: string;
        rating: string | null;
        substitute: boolean;
      };
      goals: { total: number | null; assists: number | null; saves: number | null };
      cards: { yellow: number | null; red: number | null };
    }[];
  }[];
}

export function fetchFixturePlayers(fixtureId: number) {
  return callApiFootball<FixturePlayersResponse[]>("/fixtures/players", { fixture: fixtureId });
}

export interface FixtureDetail {
  fixture: {
    id: number;
    date: string;
    venue: { name: string | null; city: string | null };
    referee: string | null;
    status: { long: string; short: string; elapsed: number | null };
  };
  league: { id: number; name: string; logo: string; round: string };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
}

export function fetchFixtureById(fixtureId: number) {
  return callApiFootball<FixtureDetail[]>("/fixtures", { id: fixtureId });
}

export interface FixtureEvent {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string; logo: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string;
  detail: string;
  comments: string | null;
}

export function fetchFixtureEvents(fixtureId: number) {
  return callApiFootball<FixtureEvent[]>("/fixtures/events", { fixture: fixtureId });
}

export interface LineupPlayer {
  player: {
    id: number;
    name: string;
    number: number;
    pos: string | null;
    grid: string | null;
  };
}

export interface FixtureLineup {
  team: { id: number; name: string; logo: string };
  coach: { id: number; name: string; photo: string | null };
  formation: string;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
}

export function fetchFixtureLineups(fixtureId: number) {
  return callApiFootball<FixtureLineup[]>("/fixtures/lineups", { fixture: fixtureId });
}

export interface FixtureTeamStatistics {
  team: { id: number; name: string; logo: string };
  statistics: { type: string; value: string | number | null }[];
}

export function fetchFixtureStatistics(fixtureId: number) {
  return callApiFootball<FixtureTeamStatistics[]>("/fixtures/statistics", {
    fixture: fixtureId,
  });
}

export interface FixturePrediction {
  predictions: {
    winner: { id: number | null; name: string | null };
    advice: string | null;
    percent: { home: string; draw: string; away: string };
  };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  comparison: {
    form: { home: string; away: string };
    att: { home: string; away: string };
    def: { home: string; away: string };
    h2h: { home: string; away: string };
    goals: { home: string; away: string };
    total: { home: string; away: string };
  };
}

export function fetchPredictions(fixtureId: number) {
  return callApiFootball<FixturePrediction[]>("/predictions", { fixture: fixtureId });
}

export interface Sidelined {
  type: string;
  start: string;
  end: string;
}

export function fetchSidelined(playerId: number) {
  return callApiFootball<Sidelined[]>("/sidelined", { player: playerId });
}

export function fetchPlayerTransfers(playerId: number) {
  return callApiFootball<TeamTransfer[]>("/transfers", { player: playerId });
}

export interface Trophy {
  league: string;
  country: string;
  season: string;
  place: string;
}

export function fetchTrophies(playerId: number) {
  return callApiFootball<Trophy[]>("/trophies", { player: playerId });
}

// /players is paginated (20 per page) when queried by team+season. Two pages
// covers every realistic squad size in one extra request at most.
export async function fetchAllPlayersStatistics(
  teamId: number,
  season: number,
): Promise<PlayerSeasonStats[]> {
  const page1 = await callApiFootball<PlayerSeasonStats[]>("/players", {
    team: teamId,
    season,
    page: 1,
  });
  const combined =
    page1.length < 20
      ? page1
      : [
          ...page1,
          ...(await callApiFootball<PlayerSeasonStats[]>("/players", {
            team: teamId,
            season,
            page: 2,
          })),
        ];

  // The team-scoped bulk endpoint sometimes returns stale/incomplete
  // per-competition entries (e.g. minutes: null despite appearances > 0 —
  // most often for cup/continental competitions). Querying the same
  // player directly by id gives fresher data, so re-fetch just the
  // players affected and use that instead of the bulk entry.
  const gappyPlayerIds = combined
    .filter((p) =>
      p.statistics.some((s) => s.games.minutes == null && (s.games.appearences ?? 0) > 0),
    )
    .map((p) => p.player.id);

  if (gappyPlayerIds.length === 0) return combined;

  const refetched = await Promise.all(
    gappyPlayerIds.map((id) =>
      callApiFootball<PlayerSeasonStats[]>("/players", { id, season })
        .then((res) => res[0] ?? null)
        .catch(() => null),
    ),
  );
  const refetchedById = new Map(
    gappyPlayerIds
      .map((id, i) => [id, refetched[i]] as const)
      .filter((entry): entry is [number, PlayerSeasonStats] => entry[1] !== null),
  );

  return combined.map((p) => refetchedById.get(p.player.id) ?? p);
}

// Same shape as fetchAllPlayersStatistics but for a single player id — used
// to resolve position/current club for a player outside our own squad (an
// opponent), where there's no team-scoped bulk fetch to look them up in.
export function fetchPlayerSeasonStatsById(playerId: number, season: number) {
  return callApiFootball<PlayerSeasonStats[]>("/players", { id: playerId, season });
}
