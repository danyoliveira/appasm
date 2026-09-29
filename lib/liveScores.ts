import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Fixture } from "@/lib/api-football/client";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Final score of a finished ASM Live Mode game, by real home/away side
// (team_side on the entries is always the fixture's own home/away).
export interface LiveScore {
  home: number;
  away: number;
}

// Counts the goal events of every finished Live Mode session of the club,
// keyed by preparation_key (an API fixture id as text, or "manual-<uuid>").
export async function loadLiveScores(
  supabase: SupabaseServerClient,
  teamId: number,
): Promise<Map<string, LiveScore>> {
  const { data: sessions } = await supabase
    .from("live_match_sessions")
    .select("id, preparation_key, ended_at")
    .eq("team_id", teamId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: true });
  if (!sessions?.length) return new Map();

  const { data: goals } = await supabase
    .from("live_match_entries")
    .select("session_id, team_side")
    .in(
      "session_id",
      sessions.map((s) => s.id),
    )
    .eq("kind", "event")
    .eq("event_type", "goal");

  const bySession = new Map<string, LiveScore>(sessions.map((s) => [s.id, { home: 0, away: 0 }]));
  for (const row of goals ?? []) {
    const score = bySession.get(row.session_id);
    if (!score) continue;
    if (row.team_side === "home") score.home += 1;
    else if (row.team_side === "away") score.away += 1;
  }

  // Latest finished session wins if a game was recorded more than once.
  const scores = new Map<string, LiveScore>();
  for (const s of sessions) scores.set(s.preparation_key, bySession.get(s.id)!);
  return scores;
}

// API-Football first; only a fixture it has no score for yet (not
// published, or a competition it doesn't cover live) takes the ASM Live
// Mode result — which also makes it count as played everywhere.
export function withLiveScores<T extends Fixture>(fixtures: T[], scores: Map<string, LiveScore>): T[] {
  if (!scores.size) return fixtures;
  return fixtures.map((fx) => withLiveScore(fx, scores));
}

export function withLiveScore<T extends Fixture>(fx: T, scores: Map<string, LiveScore>): T {
  if (fx.goals.home != null && fx.goals.away != null) return fx;
  const live = scores.get(String(fx.fixture.id));
  if (!live) return fx;
  return { ...fx, goals: { home: live.home, away: live.away } };
}
