import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { SquadPlayer, SquadResponse } from "@/lib/api-football/client";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface ManualSquadPlayerRow {
  id: number;
  team_id: number;
  stint_id: string | null;
  name: string;
  position: string;
  number: number | null;
  birth_date: string | null;
  nationality: string | null;
  photo_url: string | null;
  merged_into_player_id: number | null;
}

export const MANUAL_PLAYER_COLUMNS =
  "id, team_id, stint_id, name, position, number, birth_date, nationality, photo_url, merged_into_player_id";

export const PLAYER_PLACEHOLDER_PHOTO = "/player-placeholder.svg";

export function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function manualToSquadPlayer(row: ManualSquadPlayerRow): SquadPlayer {
  return {
    id: row.id,
    name: row.name,
    age: ageFromBirthDate(row.birth_date) ?? 0,
    number: row.number,
    position: row.position,
    photo: row.photo_url || PLAYER_PLACEHOLDER_PHOTO,
  };
}

// The coach's hand-added players for the club's current stint (merged ones
// excluded — they now live under their API id).
export async function getManualPlayers(
  supabase: SupabaseServerClient,
  teamId: number,
  stintId: string | null,
): Promise<ManualSquadPlayerRow[]> {
  let query = supabase
    .from("manual_squad_players")
    .select(MANUAL_PLAYER_COLUMNS)
    .eq("team_id", teamId)
    .is("merged_into_player_id", null);
  query = stintId ? query.eq("stint_id", stintId) : query.is("stint_id", null);
  const { data } = await query.order("created_at", { ascending: true });
  return (data ?? []) as ManualSquadPlayerRow[];
}

// API squad + hand-added players, in the API's SquadResponse shape so every
// squad consumer keeps working. A player added from an API search who has
// since appeared in the API squad is only listed once (the API entry).
export function withManualPlayers(
  squad: SquadResponse[],
  manualRows: ManualSquadPlayerRow[],
): SquadResponse[] {
  if (!manualRows.length) return squad;
  const apiIds = new Set((squad[0]?.players ?? []).map((p) => p.id));
  const extra = manualRows.filter((row) => !apiIds.has(row.id)).map(manualToSquadPlayer);
  if (!squad[0]) {
    return [{ team: { id: manualRows[0].team_id, name: "", logo: "" }, players: extra }];
  }
  return [{ ...squad[0], players: [...squad[0].players, ...extra] }, ...squad.slice(1)];
}
