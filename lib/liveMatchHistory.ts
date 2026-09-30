import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getFixtureById } from "@/lib/api-football/cache";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import { computeLivePlayerLines, type LivePlayerLine } from "@/lib/livePlayerStats";
import {
  computeCollectiveStats,
  computeGkStats,
  toLineup,
  type GkStatsByPlayer,
} from "@/app/[locale]/live/liveStatsShared";
import { effectiveSessionConfig, type LiveStatConfig } from "@/app/[locale]/live/liveStatConfig";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// One side's collective numbers for a finished Live Mode game — a count per
// counter field (missing = 0) plus possession as a % (same formula as the
// live panel: share of all tracked time, neutral included).
export type LiveSideStats = Record<string, number> & { possession: number };

export interface LiveGameStats {
  sessionId: string;
  preparationKey: string;
  date: string;
  competition: { name: string; logo: string } | null;
  // API-Football league id when known (API fixtures, or a manual game tied
  // to one of the club's competitions) — for the competition filter.
  leagueId: number | null;
  isHome: boolean;
  opponent: { name: string; logo: string };
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  us: LiveSideStats;
  them: LiveSideStats;
  // Our goalkeeper(s) in Modo GK this game — completed/incomplete actions.
  gk: GkStatsByPlayer[];
  // Our linked squad players: minutes, goals, cards… (by squad player id).
  players: Record<number, LivePlayerLine>;
  // The fields this game was played with (frozen at its kickoff).
  statConfig: LiveStatConfig;
}

const PAGE_SIZE = 1000;

async function loadSessionEntries(supabase: SupabaseServerClient, sessionId: string) {
  const rows: {
    kind: string;
    event_type: string | null;
    team_side: string | null;
    stat_key: string | null;
    stat_value: string | null;
    player_name: string | null;
    player_id: number | null;
    minute: number | null;
    notes: string | null;
    created_at: string;
  }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("live_match_entries")
      .select("kind, event_type, team_side, stat_key, stat_value, player_name, player_id, minute, notes, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Every finished Live Mode session of the club's current stint, oldest
// first, with its collective stats already aggregated.
export async function loadLiveGames(
  supabase: SupabaseServerClient,
  teamId: number,
  stintStartedAt: string | null,
): Promise<LiveGameStats[]> {
  let sessionQuery = supabase
    .from("live_match_sessions")
    .select("id, preparation_key, started_at, ended_at, bench_notes, home_lineup, away_lineup, stat_config")
    .eq("team_id", teamId)
    .not("ended_at", "is", null);
  if (stintStartedAt) sessionQuery = sessionQuery.gte("created_at", stintStartedAt);
  const { data: sessions } = await sessionQuery;
  if (!sessions?.length) return [];

  // Per session, paged: PostgREST caps a response at 1000 rows and a single
  // game's taps alone can get close to that.
  const entriesBySession = new Map(
    await Promise.all(
      sessions.map(async (session) => [session.id, await loadSessionEntries(supabase, session.id)] as const),
    ),
  );

  const games = await Promise.all(
    sessions.map(async (session): Promise<LiveGameStats | null> => {
      let date = session.started_at ?? session.ended_at!;
      let competition: LiveGameStats["competition"] = null;
      let leagueId: number | null = null;
      let isHome = true;
      let opponent = { name: "?", logo: "" };

      if (session.preparation_key.startsWith("manual-")) {
        const { data: manualRow } = await supabase
          .from("manual_preparations")
          .select("match_date, opponent_team_id, opponent_name, opponent_logo, is_home, competition_league_id, competition_name, competition_logo")
          .eq("id", session.preparation_key.slice("manual-".length))
          .maybeSingle();
        if (!manualRow) return null;
        const resolved = await resolveManualOpponent(manualRow);
        opponent = { name: resolved.name, logo: resolved.logo };
        date = manualRow.match_date ?? date;
        isHome = manualRow.is_home;
        leagueId = manualRow.competition_league_id ?? null;
        competition = manualRow.competition_name
          ? { name: manualRow.competition_name, logo: manualRow.competition_logo ?? "" }
          : null;
      } else {
        const fixture = (await getFixtureById(Number(session.preparation_key)).catch(() => []))[0];
        if (!fixture) return null;
        isHome = fixture.teams.home.id === teamId;
        const opp = isHome ? fixture.teams.away : fixture.teams.home;
        opponent = { name: opp.name, logo: opp.logo };
        competition = { name: fixture.league.name, logo: fixture.league.logo };
        leagueId = fixture.league.id;
        date = fixture.fixture.date;
      }

      const rows = entriesBySession.get(session.id) ?? [];
      const ourSide = isHome ? "home" : "away";
      const theirSide = isHome ? "away" : "home";
      const goals = (side: "home" | "away") =>
        rows.filter((r) => r.kind === "event" && r.event_type === "goal" && r.team_side === side).length;

      const stats = computeCollectiveStats(
        rows.filter((r) => r.kind === "stat"),
        session.ended_at,
      );
      const totalMs = stats.possessionMsHome + stats.possessionMsAway + stats.possessionMsNeutral;
      const pct = (ms: number) => (totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0);
      const side = (s: "home" | "away"): LiveSideStats => ({
        ...stats[s],
        possession: pct(s === "home" ? stats.possessionMsHome : stats.possessionMsAway),
      });

      const goalsFor = goals(ourSide);
      const goalsAgainst = goals(theirSide);
      return {
        sessionId: session.id,
        preparationKey: session.preparation_key,
        date,
        competition,
        leagueId,
        isHome,
        opponent,
        goalsFor,
        goalsAgainst,
        result: goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D",
        us: side(ourSide),
        them: side(theirSide),
        statConfig: effectiveSessionConfig(session, null),
        // Starting XI from the pre-game lineup (the live copy changes with subs).
        players: computeLivePlayerLines({
          lineup: toLineup(ourSide === "home" ? session.home_lineup : session.away_lineup).players,
          events: rows.filter((r) => r.kind === "event"),
          ourSide,
        }),
        gk: (() => {
          const gkStats = computeGkStats(rows.filter((r) => r.kind === "stat"));
          return ourSide === "home" ? gkStats.homeByPlayer : gkStats.awayByPlayer;
        })(),
      };
    }),
  );

  return games
    .filter((g): g is LiveGameStats => g != null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
