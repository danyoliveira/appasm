import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { buildLiveFixtureView, type LiveFixtureEntry, type LiveFixtureTeam, type LiveFixtureView } from "./liveFixtureView";
import { computeGkStats, toLineup, type GkStats, type LineupPlayer } from "@/app/[locale]/live/liveStatsShared";
import { effectiveSessionConfig, type LiveStatConfig } from "@/app/[locale]/live/liveStatConfig";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const PAGE_SIZE = 1000;

export interface LoadedLiveFixture {
  view: LiveFixtureView;
  entries: LiveFixtureEntry[];
  gkStats: GkStats;
  ourLineupPlayers: LineupPlayer[];
  // The fields this game was played with.
  statConfig: LiveStatConfig;
}

// The finished ASM Live Mode game recorded for a preparation (an API
// fixture id as text, or "manual-<uuid>"), in API-Football's shapes — the
// "Interna" side of a match page. null when the game wasn't followed there
// (or isn't finished yet).
export async function loadLiveFixture(
  supabase: SupabaseServerClient,
  {
    preparationKey,
    home,
    away,
    ourSide,
  }: { preparationKey: string; home: LiveFixtureTeam; away: LiveFixtureTeam; ourSide: "home" | "away" },
): Promise<LoadedLiveFixture | null> {
  const { data: session } = await supabase
    .from("live_match_sessions")
    .select("id, started_at, ended_at, home_lineup, away_lineup, stat_config")
    .eq("preparation_key", preparationKey)
    .not("ended_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return null;

  // Paged: PostgREST caps a response at 1000 rows, and one game's taps can
  // go past that.
  const entries: LiveFixtureEntry[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await supabase
      .from("live_match_entries")
      .select(
        "kind, event_type, team_side, stat_key, stat_value, minute, extra_minute, player_name, player_id, notes, created_at",
      )
      .eq("session_id", session.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    entries.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  const statConfig = effectiveSessionConfig(session, null);
  const homeLineup = toLineup(session.home_lineup).players;
  const awayLineup = toLineup(session.away_lineup).players;
  return {
    view: buildLiveFixtureView({ home, away, ourSide, homeLineup, awayLineup, entries, endedAt: session.ended_at, statConfig }),
    entries,
    gkStats: computeGkStats(entries.filter((e) => e.kind === "stat")),
    ourLineupPlayers: ourSide === "home" ? homeLineup : awayLineup,
    statConfig,
  };
}
