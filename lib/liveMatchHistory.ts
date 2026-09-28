import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getFixtureById } from "@/lib/api-football/cache";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import { LIVE_DEMO_MARK } from "@/app/[locale]/(app)/club/liveDemoShared";
import {
  COLLECTIVE_COUNTER_KEYS,
  computeCollectiveStats,
  computeGkStats,
  type CollectiveCounterKey,
  type GkStatsByPlayer,
} from "@/app/[locale]/live/liveStatsShared";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// One side's collective numbers for a finished Live Mode game — the six
// counters plus possession as a % (same formula as the live panel: share of
// all tracked time, neutral included).
export type LiveSideStats = Record<CollectiveCounterKey, number> & { possession: number };

export interface LiveGameStats {
  sessionId: string;
  preparationKey: string;
  date: string;
  competition: { name: string; logo: string } | null;
  isHome: boolean;
  opponent: { name: string; logo: string };
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  us: LiveSideStats;
  them: LiveSideStats;
  // Created by "Simular jogos" rather than recorded live.
  isDemo: boolean;
  // Our goalkeeper(s) in Modo GK this game — completed/incomplete actions.
  gk: GkStatsByPlayer[];
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
    created_at: string;
  }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("live_match_entries")
      .select("kind, event_type, team_side, stat_key, stat_value, player_name, player_id, created_at")
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
    .select("id, preparation_key, started_at, ended_at, bench_notes")
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
      let isHome = true;
      let opponent = { name: "?", logo: "" };

      if (session.preparation_key.startsWith("manual-")) {
        const { data: manualRow } = await supabase
          .from("manual_preparations")
          .select("match_date, opponent_team_id, opponent_name, opponent_logo, is_home, competition_name, competition_logo")
          .eq("id", session.preparation_key.slice("manual-".length))
          .maybeSingle();
        if (!manualRow) return null;
        const resolved = await resolveManualOpponent(manualRow);
        opponent = { name: resolved.name, logo: resolved.logo };
        date = manualRow.match_date ?? date;
        isHome = manualRow.is_home;
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
        ...Object.fromEntries(COLLECTIVE_COUNTER_KEYS.map((k) => [k, stats[s][k]])),
        possession: pct(s === "home" ? stats.possessionMsHome : stats.possessionMsAway),
      }) as LiveSideStats;

      const goalsFor = goals(ourSide);
      const goalsAgainst = goals(theirSide);
      return {
        sessionId: session.id,
        preparationKey: session.preparation_key,
        date,
        competition,
        isHome,
        opponent,
        goalsFor,
        goalsAgainst,
        result: goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D",
        us: side(ourSide),
        them: side(theirSide),
        isDemo: session.bench_notes === LIVE_DEMO_MARK,
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
