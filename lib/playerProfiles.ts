import "server-only";
import type { createClient } from "@/lib/supabase/server";
import {
  EMPTY_PLAYER_PROFILE,
  isDetailedPosition,
  isPreferredFoot,
  pickPositionsToCopy,
  type PlayerProfile,
  type StoredPositions,
} from "@/app/[locale]/(app)/club/playerProfile";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// What the coach has filled in about each player, keyed by player id:
// position(s) and height from the given coaching spell, the latest weigh-in
// at the club, and what belongs to the player for good (foot, nationality,
// birth date). Read defensively: a column that isn't there yet (migrations
// 0056 / 0057 not run) just means nothing to show.
export async function loadPlayerProfiles(
  supabase: SupabaseServerClient,
  { teamId, stintId, playerIds }: { teamId: number; stintId: string | null; playerIds?: number[] },
): Promise<Record<number, PlayerProfile>> {
  if (playerIds && playerIds.length === 0) return {};

  let metricsQuery = stintId
    ? supabase
        .from("player_body_metrics")
        .select("player_id, primary_position, secondary_position, height_cm")
        .eq("team_id", teamId)
        .eq("stint_id", stintId)
    : null;
  let weightQuery = stintId
    ? supabase
        .from("player_weight_log")
        .select("player_id, weight_kg, recorded_at, created_at")
        .eq("team_id", teamId)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false })
    : null;
  const traitsQuery = (columns: string) => {
    const query = supabase.from("player_traits").select(columns);
    return playerIds ? query.in("player_id", playerIds) : query;
  };
  if (playerIds) {
    metricsQuery = metricsQuery?.in("player_id", playerIds) ?? null;
    weightQuery = weightQuery?.in("player_id", playerIds) ?? null;
  }

  const [metrics, weights, fullTraits] = await Promise.all([
    metricsQuery,
    weightQuery,
    traitsQuery("player_id, preferred_foot, nationality, birth_date, photo_url"),
  ]);
  // Before migration 0057 the two newer columns don't exist — keep the foot.
  const traits = fullTraits.error ? await traitsQuery("player_id, preferred_foot") : fullTraits;

  const profiles: Record<number, PlayerProfile> = {};
  const profileFor = (playerId: number) => (profiles[playerId] ??= { ...EMPTY_PLAYER_PROFILE });

  for (const row of metrics?.error ? [] : (metrics?.data ?? [])) {
    const primary = isDetailedPosition(row.primary_position) ? row.primary_position : null;
    const secondary = isDetailedPosition(row.secondary_position) ? row.secondary_position : null;
    if (!primary && !secondary && row.height_cm == null) continue;
    const profile = profileFor(row.player_id);
    profile.primaryPosition = primary;
    profile.secondaryPosition = secondary;
    profile.heightCm = row.height_cm ?? null;
  }
  // Newest first, so the first row seen for a player is their latest.
  for (const row of weights?.error ? [] : (weights?.data ?? [])) {
    const profile = profileFor(row.player_id);
    if (profile.weightKg == null) profile.weightKg = Number(row.weight_kg);
  }
  type TraitsRow = {
    player_id: number;
    preferred_foot: unknown;
    nationality?: string | null;
    birth_date?: string | null;
    photo_url?: string | null;
  };
  for (const row of traits.error ? [] : ((traits.data ?? []) as unknown as TraitsRow[])) {
    const foot = isPreferredFoot(row.preferred_foot) ? row.preferred_foot : null;
    if (!foot && !row.nationality && !row.birth_date && !row.photo_url) continue;
    const profile = profileFor(row.player_id);
    profile.preferredFoot = foot;
    profile.nationality = row.nationality ?? null;
    profile.birthDate = row.birth_date ?? null;
    profile.photoUrl = row.photo_url ?? null;
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
