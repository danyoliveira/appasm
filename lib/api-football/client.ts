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
  league: { name: string; logo: string };
  teams: {
    home: { id: number; name: string; logo: string };
    away: { id: number; name: string; logo: string };
  };
  goals: { home: number | null; away: number | null };
}

export function fetchNextFixtures(teamId: number, count = 5) {
  return callApiFootball<Fixture[]>("/fixtures", { team: teamId, next: count });
}

export function fetchLastFixtures(teamId: number, count = 5) {
  return callApiFootball<Fixture[]>("/fixtures", { team: teamId, last: count });
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
  };
}

export function fetchPlayerProfile(playerId: number) {
  return callApiFootball<PlayerProfile[]>("/players/profiles", { player: playerId });
}

export interface PlayerSeasonStats {
  player: { id: number; name: string };
  statistics: {
    team: { id: number };
    games: { minutes: number | null; position: string };
    goals: {
      total: number | null;
      assists: number | null;
      saves: number | null;
      conceded: number | null;
    };
  }[];
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
  if (page1.length < 20) return page1;

  const page2 = await callApiFootball<PlayerSeasonStats[]>("/players", {
    team: teamId,
    season,
    page: 2,
  });
  return [...page1, ...page2];
}
