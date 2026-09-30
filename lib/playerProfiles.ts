import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  isDetailedPosition,
  isPreferredFoot,
  pickPositionsToCopy,
  type PlayerProfile,
  type StoredPositions,
} from "@/app/[locale]/(app)/club/playerProfile";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Position(s) and preferred foot of every player of one coaching spell,
// keyed by player id. Positions come from that spell; the foot is the
// player's own and is the same in every spell. Read defensively: until
// migration 0056 has run there is simply nothing to show.
export async function loadPlayerProfiles(
  supabase: SupabaseServerClient,
  { teamId, stintId, playerIds }: { teamId: number; stintId: string | null; playerIds?: number[] },
): Promise<Record<number, PlayerProfile>> {
  let positionsQuery = stintId
    ? supabase
        .from("player_body_metrics")
        .select("player_id, primary_position, secondary_position")
        .eq("team_id", teamId)
        .eq("stint_id", stintId)
    : null;
  let feetQuery = supabase.from("player_traits").select("player_id, preferred_foot");
  if (playerIds) {
    if (playerIds.length === 0) return {};
    positionsQuery = positionsQuery?.in("player_id", playerIds) ?? null;
    feetQuery = feetQuery.in("player_id", playerIds);
  }

  const [positions, feet] = await Promise.all([positionsQuery, feetQuery]);

  const profiles: Record<number, PlayerProfile> = {};
  const profileFor = (playerId: number) =>
    (profiles[playerId] ??= { primaryPosition: null, secondaryPosition: null, preferredFoot: null });

  for (const row of positions?.error ? [] : (positions?.data ?? [])) {
    const primary = isDetailedPosition(row.primary_position) ? row.primary_position : null;
    const secondary = isDetailedPosition(row.secondary_position) ? row.secondary_position : null;
    if (!primary && !secondary) continue;
    const profile = profileFor(row.player_id);
    profile.primaryPosition = primary;
    profile.secondaryPosition = secondary;
  }
  for (const row of feet.error ? [] : (feet.data ?? [])) {
    if (isPreferredFoot(row.preferred_foot)) profileFor(row.player_id).preferredFoot = row.preferred_foot;
  }
  return profiles;
}

// Positions from an earlier spell at the same club that the current one is
// still missing (see pickPositionsToCopy), with that spell's dates. Null
// when there is nothing to bring over.
export async function loadCopyablePositions(
  supabase: SupabaseServerClient,
  { teamId, stintId, current }: { teamId: number; stintId: string; current: Record<number, PlayerProfile> },
): Promise<{ startedAt: string; endedAt: string; rows: StoredPositions[] } | null> {
  const { data: stints } = await supabase
    .from("coaching_stints")
    .select("id, started_at, ended_at")
    .eq("team_id", teamId)
    .neq("id", stintId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false });
  if (!stints?.length) return null;

  const { data, error } = await supabase
    .from("player_body_metrics")
    .select("stint_id, player_id, primary_position, secondary_position")
    .eq("team_id", teamId)
    .in(
      "stint_id",
      stints.map((s) => s.id),
    )
    .not("primary_position", "is", null);
  if (error || !data?.length) return null;

  const stored = data.flatMap((row): StoredPositions[] =>
    isDetailedPosition(row.primary_position)
      ? [
          {
            stintId: row.stint_id,
            playerId: row.player_id,
            primaryPosition: row.primary_position,
            secondaryPosition: isDetailedPosition(row.secondary_position) ? row.secondary_position : null,
          },
        ]
      : [],
  );
  const rows = pickPositionsToCopy(
    stints.map((s) => s.id),
    stored,
    current,
  );
  if (rows.length === 0) return null;
  const source = stints.find((s) => s.id === rows[0].stintId)!;
  return { startedAt: source.started_at, endedAt: source.ended_at!, rows };
}
