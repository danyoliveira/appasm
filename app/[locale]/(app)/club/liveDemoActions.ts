"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSquad, getTeamSeasonFixtures } from "@/lib/api-football/cache";
import { getCurrentCompetitions } from "@/lib/api-football/teamStats";
import {
  COLLECTIVE_COUNTER_KEYS,
  GK_COUNTER_KEYS,
  type CollectiveCounterKey,
} from "../../live/liveStatsShared";
import { LIVE_DEMO_MARK } from "./liveDemoShared";

async function requireCoachTeam() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, api_football_team_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "coach" || !profile.api_football_team_id) throw new Error("Not authorized");
  return { supabase, user, teamId: profile.api_football_team_id as number };
}

// Plausible per-side totals for a 90' game.
const COUNTER_RANGES: Record<CollectiveCounterKey, [number, number]> = {
  offensive_transition: [6, 18],
  tackle: [9, 22],
  interception: [5, 15],
  recovery_own_half: [14, 32],
  recovery_opp_half: [4, 16],
  progressive_pass: [18, 48],
};

const MATCH_MS = 95 * 60 * 1000;

// Goalkeeper actions per game: completed and not completed.
const GK_COMPLETE_RANGE: [number, number] = [0, 7];
const GK_INCOMPLETE_RANGE: [number, number] = [0, 3];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Fills the Live Mode history with `count` finished demo games — the club's
// latest real finished fixtures (real opponents and scores) that don't have
// a Live Mode session yet, with random collective stats. Marked via
// bench_notes so they can be removed again in one go.
export async function simulateLiveGames(count = 4): Promise<{ created: number }> {
  const { supabase, user, teamId } = await requireCoachTeam();

  const current = await getCurrentCompetitions(teamId);
  if (!current.defaultSeason) return { created: 0 };
  const fixtures = await getTeamSeasonFixtures(teamId, current.defaultSeason).catch(() => []);

  const { data: existing } = await supabase
    .from("live_match_sessions")
    .select("preparation_key")
    .eq("team_id", teamId);
  const taken = new Set((existing ?? []).map((s) => s.preparation_key));

  const candidates = fixtures
    .filter((fx) => fx.goals.home != null && fx.goals.away != null)
    .filter((fx) => !taken.has(String(fx.fixture.id)))
    .sort((a, b) => b.fixture.date.localeCompare(a.fixture.date))
    .slice(0, count);

  // Our goalkeeper for the Modo GK demo data — the first keeper in the squad.
  const squad = await getSquad(teamId).catch(() => []);
  const goalkeeper = squad[0]?.players.find((p) => p.position === "Goalkeeper") ?? null;
  const goalkeeperName = goalkeeper?.name ?? null;

  for (const fx of candidates) {
    const start = new Date(fx.fixture.date).getTime();
    const { data: session, error } = await supabase
      .from("live_match_sessions")
      .insert({
        team_id: teamId,
        preparation_key: String(fx.fixture.id),
        started_at: new Date(start).toISOString(),
        ended_at: new Date(start + MATCH_MS).toISOString(),
        bench_notes: LIVE_DEMO_MARK,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !session) throw new Error(error?.message ?? "insert failed");

    const at = (ms: number) => new Date(start + ms).toISOString();
    const rows: Record<string, unknown>[] = [];

    // Goals — the real score, at random minutes.
    (["home", "away"] as const).forEach((side) => {
      for (let i = 0; i < (fx.goals[side] ?? 0); i++) {
        const minute = randomInt(3, 90);
        rows.push({
          session_id: session.id,
          kind: "event",
          event_type: "goal",
          team_side: side,
          minute,
          created_at: at(minute * 60 * 1000),
          created_by: user.id,
        });
      }
    });

    // Counters, spread across the match.
    (["home", "away"] as const).forEach((side) => {
      for (const key of COLLECTIVE_COUNTER_KEYS) {
        const [min, max] = COUNTER_RANGES[key];
        for (let i = 0, n = randomInt(min, max); i < n; i++) {
          rows.push({
            session_id: session.id,
            kind: "stat",
            stat_key: key,
            team_side: side,
            created_at: at(randomInt(0, MATCH_MS - 1000)),
            created_by: user.id,
          });
        }
      }
    });

    // Modo GK: pick our keeper at kickoff, then completed/incomplete taps.
    const ourSide = fx.teams.home.id === teamId ? "home" : "away";
    if (goalkeeperName) {
      rows.push({
        session_id: session.id,
        kind: "stat",
        stat_key: "gk_selection",
        team_side: ourSide,
        player_name: goalkeeperName,
        player_id: goalkeeper?.id ?? null,
        created_at: at(0),
        created_by: user.id,
      });
      for (const key of GK_COUNTER_KEYS) {
        (
          [
            ["complete", GK_COMPLETE_RANGE],
            ["incomplete", GK_INCOMPLETE_RANGE],
          ] as const
        ).forEach(([outcome, [min, max]]) => {
          for (let i = 0, n = randomInt(min, max); i < n; i++) {
            rows.push({
              session_id: session.id,
              kind: "stat",
              stat_key: key,
              stat_value: outcome,
              team_side: ourSide,
              player_name: goalkeeperName,
              player_id: goalkeeper?.id ?? null,
              created_at: at(randomInt(1000, MATCH_MS - 1000)),
              created_by: user.id,
            });
          }
        });
      }
    }

    // Possession: a chain of changes, biased so one side ends ~40–65%.
    const homeBias = Math.random() * 0.4 + 0.3;
    let t = 0;
    while (t < MATCH_MS) {
      const r = Math.random();
      const value = r < 0.12 ? "neutral" : r < 0.12 + homeBias * 0.88 ? "home" : "away";
      rows.push({
        session_id: session.id,
        kind: "stat",
        stat_key: "possession",
        stat_value: value,
        created_at: at(t),
        created_by: user.id,
      });
      t += randomInt(40, 150) * 1000;
    }

    const { error: entriesError } = await supabase.from("live_match_entries").insert(rows);
    if (entriesError) throw new Error(entriesError.message);
  }

  revalidatePath("/", "layout");
  return { created: candidates.length };
}

// Removes every demo session (and, by cascade, its entries). Sessions have
// no delete policy for regular users, so this goes through the admin client
// after the coach check — and only ever touches rows carrying the demo mark.
export async function removeDemoLiveGames() {
  const { teamId } = await requireCoachTeam();
  const admin = createAdminClient();
  const { error } = await admin
    .from("live_match_sessions")
    .delete()
    .eq("team_id", teamId)
    .eq("bench_notes", LIVE_DEMO_MARK);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
