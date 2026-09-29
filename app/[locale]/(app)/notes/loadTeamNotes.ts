import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getPlayerProfile, getSquad } from "@/lib/api-football/cache";
import { getCurrentStintId } from "@/lib/coachingStints";
import { getManualPlayers, withManualPlayers } from "@/lib/manualPlayers";
import { orderSquadLikeGeneralTab, shortenPlayerName } from "../club/playerShared";
import {
  CLUB_NOTE_COLUMNS,
  PLAYER_NOTE_COLUMNS,
  clubNoteFromRow,
  playerNoteFromRow,
  type NoteItem,
  type NotePlayer,
} from "./noteShared";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface TeamNotes {
  notes: NoteItem[];
  // Current squad (squad order) — quick-add picker and @mentions.
  players: NotePlayer[];
  // Name/photo for every player any note refers to (incl. ex-squad).
  playerInfo: Record<number, NotePlayer>;
}

// Every note across the club and its players — shared by the dashboard's
// notes panel and the full Notas page.
export async function loadTeamNotes(supabase: SupabaseServerClient, teamId: number): Promise<TeamNotes> {
  const stintId = await getCurrentStintId(supabase, teamId);
  const [{ data: playerNoteRows }, { data: clubNoteRows }, apiSquad, manualRows] = await Promise.all([
    supabase.from("player_notes").select(PLAYER_NOTE_COLUMNS).eq("team_id", teamId),
    supabase.from("club_notes").select(CLUB_NOTE_COLUMNS).eq("team_id", teamId),
    getSquad(teamId).catch(() => []),
    getManualPlayers(supabase, teamId, stintId),
  ]);
  const squad = withManualPlayers(apiSquad, manualRows);
  const notes = [
    ...(playerNoteRows ?? []).map(playerNoteFromRow),
    ...(clubNoteRows ?? []).map(clubNoteFromRow),
  ];

  // Same order as the squad on the club page (goalkeepers first).
  const players = orderSquadLikeGeneralTab(squad[0]?.players ?? [], new Map()).map((p) => ({
    id: p.id,
    name: shortenPlayerName(p.name),
    photo: p.photo,
  }));
  const playerInfo: Record<number, NotePlayer> = {};
  players.forEach((p) => (playerInfo[p.id] = p));

  // Players who've since left the squad fall back to their cached profile.
  const missingIds = [
    ...new Set(notes.map((n) => n.playerId).filter((id): id is number => id != null && !playerInfo[id])),
  ];
  await Promise.all(
    missingIds.map(async (id) => {
      const player = (await getPlayerProfile(id).catch(() => []))[0]?.player;
      playerInfo[id] = {
        id,
        name: player ? shortenPlayerName(player.name) : `#${id}`,
        photo: player?.photo ?? null,
      };
    }),
  );

  return { notes, players, playerInfo };
}
