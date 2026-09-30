"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApiFootballError,
  searchTeams,
  searchPlayerProfiles,
  type TeamSearchResult,
  type ApiFootballReason,
} from "@/lib/api-football/client";
import { getTeamsByCountry, getSquad, forgetCachedTeamData } from "@/lib/api-football/cache";
import { getCurrentStintId } from "@/lib/coachingStints";
import { isDetailedPosition, isPreferredFoot } from "./club/playerProfile";
import { loadCopyablePositions, loadPlayerProfiles } from "@/lib/playerProfiles";
import { getManualPlayers, withManualPlayers } from "@/lib/manualPlayers";
import { parseLiveStatConfig, type LiveStatConfig } from "../live/liveStatConfig";
import type { GameSubmoment, VideoCategory } from "./preparations/videoCategories";

export type ClubsResult = {
  results: TeamSearchResult[];
  error?: ApiFootballReason;
};

export async function getClubsForCountry(country: string): Promise<ClubsResult> {
  if (!country) return { results: [] };

  try {
    const results = await getTeamsByCountry(country);
    return { results };
  } catch (err) {
    if (err instanceof ApiFootballError) {
      return { results: [], error: err.reason };
    }
    return { results: [], error: "unknown" };
  }
}

// Ad-hoc, uncached search by name — used to pick an opponent for a
// preparation that isn't in our own team's fixture list (a friendly not yet
// published, or a match scheduled ahead of the official fixture list).
export async function searchOpponentClubs(query: string): Promise<ClubsResult> {
  if (!query.trim()) return { results: [] };

  try {
    const results = await searchTeams(query);
    return { results };
  } catch (err) {
    if (err instanceof ApiFootballError) {
      return { results: [], error: err.reason };
    }
    return { results: [], error: "unknown" };
  }
}

// Opponent is either a real API-Football club (opponentTeamId) or, when the
// coach couldn't find the club in that search at all, a plain typed name —
// exactly one of the two is ever passed.
// Competition, venue and (optional) final score of a game created from
// scratch — what its calendar row needs.
export interface ManualMatchDetails {
  competition: { leagueId: number | null; name: string; logo: string | null } | null;
  isHome: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

function manualMatchDetailsColumns(details: ManualMatchDetails) {
  const goal = (n: number | null) => (n != null && Number.isInteger(n) && n >= 0 && n < 100 ? n : null);
  const goalsFor = goal(details.goalsFor);
  const goalsAgainst = goal(details.goalsAgainst);
  const bothGoals = goalsFor != null && goalsAgainst != null;
  return {
    competition_league_id: details.competition?.leagueId ?? null,
    competition_name: details.competition?.name.trim() || null,
    competition_logo: details.competition?.logo ?? null,
    is_home: details.isHome,
    // A score is either complete or absent.
    goals_for: bothGoals ? goalsFor : null,
    goals_against: bothGoals ? goalsAgainst : null,
  };
}

export async function createManualPreparation(
  opponent: { teamId: number } | { name: string },
  matchDateIso: string,
  details?: ManualMatchDetails,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();
  const teamId = coachProfile?.api_football_team_id;
  if (!teamId) throw new Error("No club selected yet");

  const { data, error } = await supabase
    .from("manual_preparations")
    .insert({
      team_id: teamId,
      opponent_team_id: "teamId" in opponent ? opponent.teamId : null,
      opponent_name: "name" in opponent ? opponent.name : null,
      match_date: matchDateIso,
      created_by: user.id,
      ...(details ? manualMatchDetailsColumns(details) : {}),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data.id as string;
}

// null opponent means "keep whichever one this preparation already has" —
// the edit form only sends one when the coach actually searched and picked
// (or typed) a different club.
export async function updateManualPreparation(
  id: string,
  opponent: { teamId: number } | { name: string } | null,
  matchDateIso: string,
  details?: ManualMatchDetails,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const update: Record<string, unknown> = {
    match_date: matchDateIso,
    ...(details ? manualMatchDetailsColumns(details) : {}),
  };
  if (opponent) {
    update.opponent_team_id = "teamId" in opponent ? opponent.teamId : null;
    update.opponent_name = "name" in opponent ? opponent.name : null;
  }

  // .select() so a row RLS filtered out shows up as an error instead of a
  // silent "saved" that changed nothing.
  const { data, error } = await supabase.from("manual_preparations").update(update).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Manual preparation not updated");
  revalidatePath("/", "layout");
}

// Saves the club's ASM Live Mode fields (Configurar campos). Games already
// kicked off keep the fields they started with; the next ones use these.
export async function saveLiveStatConfig(config: LiveStatConfig) {
  const { supabase, coachId } = await requireCoach();
  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();
  const teamId = coachProfile?.api_football_team_id;
  if (!teamId) throw new Error("No club selected yet");

  const parsed = parseLiveStatConfig(config);
  if (!parsed) throw new Error("Invalid config");
  // Every key only once (a field lives in one place).
  const keys = [...parsed.collective.map((f) => f.key), ...parsed.gkGroups.flatMap((g) => g.fields.map((f) => f.key))];
  if (new Set(keys).size !== keys.length) throw new Error("Duplicate field");

  const { error } = await supabase.from("live_stat_configs").upsert(
    { team_id: teamId, config: parsed, updated_at: new Date().toISOString(), updated_by: coachId },
    { onConflict: "team_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Finishes (Concluída — read-only from then on) or reopens a preparation.
// Finishing also closes the game's ASM Live Mode session if it was left
// running, and — for a manual game still without a score — carries over
// the score logged there, same as full time does.
export async function setPreparationFinished(preparationKey: string, finished: boolean) {
  const { supabase, coachId } = await requireCoach();
  const finishedAt = finished ? new Date().toISOString() : null;
  const finishedBy = finished ? coachId : null;

  if (finished) {
    await supabase
      .from("live_match_sessions")
      .update({ ended_at: finishedAt })
      .eq("preparation_key", preparationKey)
      .not("started_at", "is", null)
      .is("ended_at", null);
  }

  if (preparationKey.startsWith("manual-")) {
    const manualId = preparationKey.slice("manual-".length);
    const update: Record<string, unknown> = { finished_at: finishedAt, finished_by: finishedBy };

    if (finished) {
      const [{ data: manualRow }, { data: session }] = await Promise.all([
        supabase.from("manual_preparations").select("is_home, goals_for, goals_against").eq("id", manualId).maybeSingle(),
        supabase
          .from("live_match_sessions")
          .select("id")
          .eq("preparation_key", preparationKey)
          .not("ended_at", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (manualRow && session && manualRow.goals_for == null && manualRow.goals_against == null) {
        const { data: goals } = await supabase
          .from("live_match_entries")
          .select("team_side")
          .eq("session_id", session.id)
          .eq("kind", "event")
          .eq("event_type", "goal");
        const home = (goals ?? []).filter((g) => g.team_side === "home").length;
        const away = (goals ?? []).filter((g) => g.team_side === "away").length;
        update.goals_for = manualRow.is_home ? home : away;
        update.goals_against = manualRow.is_home ? away : home;
      }
    }

    const { data, error } = await supabase.from("manual_preparations").update(update).eq("id", manualId).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Preparation not updated");
  } else {
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("api_football_team_id")
      .eq("role", "coach")
      .maybeSingle();
    const teamId = coachProfile?.api_football_team_id;
    if (!teamId) throw new Error("No club selected yet");

    const { error } = await supabase.from("fixture_preparations").upsert(
      {
        team_id: teamId,
        fixture_id: Number(preparationKey),
        finished_at: finishedAt,
        finished_by: finishedBy,
      },
      { onConflict: "team_id,fixture_id" },
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/", "layout");
}

// The coach's written analysis after the game (Pós-Jogo tab).
export async function savePostGameNotes(preparationKey: string, notes: string) {
  const { supabase } = await requireCoach();
  const value = notes.trim() || null;

  if (preparationKey.startsWith("manual-")) {
    const { data, error } = await supabase
      .from("manual_preparations")
      .update({ post_game_notes: value })
      .eq("id", preparationKey.slice("manual-".length))
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("Preparation not updated");
  } else {
    const { data: coachProfile } = await supabase
      .from("profiles")
      .select("api_football_team_id")
      .eq("role", "coach")
      .maybeSingle();
    const teamId = coachProfile?.api_football_team_id;
    if (!teamId) throw new Error("No club selected yet");

    const { error } = await supabase
      .from("fixture_preparations")
      .upsert(
        { team_id: teamId, fixture_id: Number(preparationKey), post_game_notes: value },
        { onConflict: "team_id,fixture_id" },
      );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/", "layout");
}

export async function deleteManualPreparation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("manual_preparations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

function parseOptionalUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid URL");
  }
  return parsed.toString();
}

// preparationKey mirrors the /preparations/[fixtureId] route param
// as-is — either a numeric API-Football fixture id or "manual-<uuid>".
export async function addPreparationVideo(
  preparationKey: string,
  url: string,
  notes: string,
  category: VideoCategory | null,
  submoment: GameSubmoment | null,
  playerId: number | null,
  team: "us" | "opponent",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();
  const teamId = coachProfile?.api_football_team_id;
  if (!teamId) throw new Error("No club selected yet");

  const { error } = await supabase.from("preparation_videos").insert({
    team_id: teamId,
    preparation_key: preparationKey,
    url: parsedUrl.toString(),
    notes: notes.trim() || null,
    category,
    submoment,
    player_id: playerId,
    team,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function updatePreparationVideo(
  id: string,
  url: string,
  notes: string,
  category: VideoCategory | null,
  submoment: GameSubmoment | null,
  playerId: number | null,
  team: "us" | "opponent",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("Invalid URL");
  }

  const { error } = await supabase
    .from("preparation_videos")
    .update({
      url: parsedUrl.toString(),
      notes: notes.trim() || null,
      category,
      submoment,
      player_id: playerId,
      team,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deletePreparationVideo(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("preparation_videos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export interface TacticalPosition {
  playerId: number;
  name: string;
  number: number | null;
  photo: string;
  x: number;
  y: number;
  // Optional: StaticTacticalPitch is also reused to render live-match
  // formations (see LiveFormationTeam), which have no team of their own.
  // Missing on old tactical snapshots too (saved before both squads could
  // be placed on the board, back when everyone placed was the opponent) —
  // callers treat an absent team as "opponent".
  team?: "us" | "opponent";
}

export interface TacticalMarker {
  id: number;
  x: number;
  y: number;
}

export interface TacticalArrow {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Missing on snapshots saved before the plain-line tool existed —
  // treated as "arrow" (the original, only style).
  style?: "arrow" | "line";
}

// The jsonb `positions` column stores this whole shape now, not just the
// player array — kept the column name to avoid another migration.
export interface TacticalSnapshotData {
  players: TacticalPosition[];
  ball: { x: number; y: number } | null;
  markers: TacticalMarker[];
  arrows: TacticalArrow[];
  // Which bench tab was active when this analysis was saved — lets the
  // saved-analyses list filter by team the same way the board's bench does.
  // Optional: missing on snapshots saved before both squads existed.
  team?: "us" | "opponent";
  // Which phase of play this analysis documents — same taxonomy as video
  // tagging. Optional: missing on snapshots saved before moments existed.
  moment?: VideoCategory | null;
  submoment?: GameSubmoment | null;
  // The "Jogador" category's subject — name kept alongside the id so it
  // still reads right if they later leave the squad.
  player?: { id: number; name: string } | null;
}

// Each save is a new, separately-kept snapshot (like preparation_videos) —
// not one board overwritten every time — so a coach can build several
// analyses (their shape in open play, at set pieces, etc.) with the pitch.
export async function addTacticalSnapshot(
  preparationKey: string,
  data: TacticalSnapshotData,
  notes: string,
  videoUrl: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();
  const teamId = coachProfile?.api_football_team_id;
  if (!teamId) throw new Error("No club selected yet");

  const { error } = await supabase.from("preparation_tactics").insert({
    team_id: teamId,
    preparation_key: preparationKey,
    positions: data,
    notes: notes.trim() || null,
    video_url: parseOptionalUrl(videoUrl),
    created_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function updateTacticalSnapshot(
  id: string,
  data: TacticalSnapshotData,
  notes: string,
  videoUrl: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("preparation_tactics")
    .update({ positions: data, notes: notes.trim() || null, video_url: parseOptionalUrl(videoUrl) })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deleteTacticalSnapshot(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("preparation_tactics").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

// Clears every cached API-Football response for this team (squad, transfers,
// injuries, stats, season fixtures) so the next page load fetches fresh
// data. Per-fixture data (lineups/events/players stats for finished matches)
// is stored with no team_id and is left alone — it's historical and doesn't
// change once a match is over, so refetching it would just waste requests.
export async function refreshClubData(teamId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { error } = await admin.from("api_football_cache").delete().eq("team_id", teamId);
  if (error) throw new Error(error.message);
  forgetCachedTeamData(teamId);

  revalidatePath("/", "layout");
}

export async function updateClub(teamId: number) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("id", user.id)
    .maybeSingle();
  const previousTeamId = profile?.api_football_team_id ?? null;

  const { error } = await supabase
    .from("profiles")
    .update({ api_football_team_id: teamId, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  // Close the stint at the club just left and open a new one at the
  // destination — the "Arquivo" (past clubs) feature is built entirely on
  // this history, so it has to stay accurate every time the club changes.
  if (previousTeamId !== teamId) {
    const now = new Date().toISOString();
    if (previousTeamId) {
      const { data: closedStint } = await supabase
        .from("coaching_stints")
        .update({ ended_at: now })
        .eq("team_id", previousTeamId)
        .is("ended_at", null)
        .select("id")
        .maybeSingle();

      // Freeze the squad as it stood right before leaving — the live
      // API-Football squad moves on with real transfers, so this is the
      // only place that will ever show "the squad I actually had there".
      if (closedStint) {
        const [squad, manualRows] = await Promise.all([
          getSquad(previousTeamId).catch(() => []),
          getManualPlayers(supabase, previousTeamId, closedStint.id),
        ]);
        const players = withManualPlayers(squad, manualRows)[0]?.players ?? [];
        if (players.length > 0) {
          await supabase.from("archived_squad_players").insert(
            players.map((p) => ({
              stint_id: closedStint.id,
              player_id: p.id,
              name: p.name,
              photo: p.photo,
              number: p.number,
              position: p.position,
            })),
          );
        }
      }
    }
    await supabase.from("coaching_stints").insert({ team_id: teamId, started_at: now });
  }
}

export type InviteState = { error?: string; invitePath?: string };

export async function createInvite(
  _prevState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const email = (formData.get("email") as string)?.trim();
  // Every invite is view-only for now ("Edição" is hidden until it has
  // permissions of its own), whatever the form sends.
  const role = "viewer";
  const locale = (formData.get("locale") as string) || "pt";
  if (!email) return { error: "invalid-email" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-authenticated" };

  const token = randomUUID();
  const { error } = await supabase.from("invites").insert({
    email,
    role,
    token,
    invited_by: user.id,
  });

  if (error) return { error: error.message };

  return { invitePath: `/${locale}/register?token=${token}` };
}

// Cancels an invite that hasn't been used yet (the link stops working).
export async function cancelInvite(inviteId: string) {
  const { supabase, coachId } = await requireCoach();
  const { data, error } = await supabase
    .from("invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .eq("invited_by", coachId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Invite not cancelled");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // "/" (no locale prefix) is deliberate — proxy.ts already redirects a
  // signed-out visitor there to /{locale}/login, so this doesn't need to
  // know the current locale.
  redirect("/");
}

export type ProfileFormState = { error?: string; success?: boolean };

export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not-authenticated" };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName || null,
      phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  return { success: true };
}

export async function updateAvatarUrl(avatarUrl: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
}

async function requireCoach() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "coach") throw new Error("Not authorized");
  return { supabase, coachId: user.id };
}

export async function updateMemberRole(memberId: string, role: "member" | "viewer") {
  const { supabase, coachId } = await requireCoach();
  if (memberId === coachId) throw new Error("Cannot change your own role");

  const { error } = await supabase
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) throw new Error(error.message);
}

export async function setMemberStatus(memberId: string, status: "active" | "revoked") {
  const { supabase, coachId } = await requireCoach();
  if (memberId === coachId) throw new Error("Cannot change your own status");

  const { error } = await supabase
    .from("profiles")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) throw new Error(error.message);
}

export type PlayerStatus = "available" | "doubtful" | "injured" | "suspended" | "unavailable";

export async function setPlayerAvailability(
  teamId: number,
  playerId: number,
  playerName: string,
  status: PlayerStatus,
) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      status,
      stint_id: stintId,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );

  if (error) throw new Error(error.message);
}

// Player notes and club notes share one set of actions — same shape, just
// a different table (club notes additionally carry @mentions).
const NOTE_TABLE = { player: "player_notes", club: "club_notes" } as const;
type NoteKindArg = keyof typeof NOTE_TABLE;

// Mirrors MAX_PINNED_NOTES in notes/noteShared.ts ("use server" files can
// only export async functions, so it can't be imported from here).
const MAX_PINNED_NOTES = 3;

export type NoteActionResult = { error?: "pinLimit" };

function cleanRemindAt(remindAt: string | null) {
  return remindAt && /^\d{4}-\d{2}-\d{2}$/.test(remindAt) ? remindAt : null;
}

function cleanMentions(ids: number[]) {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

async function pinnedNotesCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: NoteKindArg,
  teamId: number,
  playerId: number | null,
) {
  // Player notes follow the player across clubs (see the player page), so
  // their pin limit is per player; club notes are per club.
  let query = supabase
    .from(NOTE_TABLE[kind])
    .select("id", { count: "exact", head: true })
    .not("pinned_at", "is", null);
  query =
    kind === "player" && playerId != null
      ? query.eq("player_id", playerId)
      : query.eq("team_id", teamId);
  const { count } = await query;
  return count ?? 0;
}

export interface NewNoteInput {
  kind: NoteKindArg;
  teamId: number;
  playerId: number | null;
  content: string;
  mentionedPlayerIds: number[];
  remindAt: string | null;
  pinned: boolean;
}

export async function addNote(input: NewNoteInput): Promise<NoteActionResult> {
  const { supabase } = await requireCoach();
  const content = input.content.trim();
  if (!content) throw new Error("Empty note");
  if (input.kind === "player" && input.playerId == null) throw new Error("Missing player");

  let pinned = input.pinned;
  let result: NoteActionResult = {};
  if (
    pinned &&
    (await pinnedNotesCount(supabase, input.kind, input.teamId, input.playerId)) >= MAX_PINNED_NOTES
  ) {
    // Still save the note — just not pinned — and let the UI say why.
    pinned = false;
    result = { error: "pinLimit" };
  }

  const common = {
    team_id: input.teamId,
    content,
    remind_at: cleanRemindAt(input.remindAt),
    pinned_at: pinned ? new Date().toISOString() : null,
  };
  const { error } =
    input.kind === "player"
      ? await supabase.from("player_notes").insert({ ...common, player_id: input.playerId })
      : await supabase
          .from("club_notes")
          .insert({ ...common, mentioned_player_ids: cleanMentions(input.mentionedPlayerIds) });

  if (error) throw new Error(error.message);
  return result;
}

export async function updateNote(
  kind: NoteKindArg,
  noteId: string,
  input: { content: string; mentionedPlayerIds: number[]; remindAt: string | null },
) {
  const { supabase } = await requireCoach();
  const content = input.content.trim();
  if (!content) throw new Error("Empty note");

  const update = {
    content,
    remind_at: cleanRemindAt(input.remindAt),
    updated_at: new Date().toISOString(),
    ...(kind === "club" ? { mentioned_player_ids: cleanMentions(input.mentionedPlayerIds) } : {}),
  };
  const { error } = await supabase.from(NOTE_TABLE[kind]).update(update).eq("id", noteId);

  if (error) throw new Error(error.message);
}

// Pinning/reminders don't touch updated_at — they aren't an edit of the
// note's text.
export async function setNotePinned(
  kind: NoteKindArg,
  noteId: string,
  pinned: boolean,
): Promise<NoteActionResult> {
  const { supabase } = await requireCoach();

  if (pinned) {
    const { data: row, error: readError } = await supabase
      .from(NOTE_TABLE[kind])
      .select(kind === "player" ? "team_id, player_id" : "team_id")
      .eq("id", noteId)
      .maybeSingle<{ team_id: number; player_id?: number }>();
    if (readError) throw new Error(readError.message);
    if (!row) return {};
    const count = await pinnedNotesCount(supabase, kind, row.team_id, row.player_id ?? null);
    if (count >= MAX_PINNED_NOTES) return { error: "pinLimit" };
  }

  const { error } = await supabase
    .from(NOTE_TABLE[kind])
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq("id", noteId);

  if (error) throw new Error(error.message);
  return {};
}

export async function setNoteReminder(kind: NoteKindArg, noteId: string, remindAt: string | null) {
  const { supabase } = await requireCoach();

  const { error } = await supabase
    .from(NOTE_TABLE[kind])
    .update({ remind_at: cleanRemindAt(remindAt) })
    .eq("id", noteId);

  if (error) throw new Error(error.message);
}

export async function deleteNote(kind: NoteKindArg, noteId: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase.from(NOTE_TABLE[kind]).delete().eq("id", noteId);

  if (error) throw new Error(error.message);
}

// --- Hand-added squad players ----------------------------------------------

export interface ApiPlayerSearchResult {
  id: number;
  name: string;
  photo: string | null;
  age: number | null;
  nationality: string | null;
  birthDate: string | null;
  position: string | null;
  number: number | null;
}

export async function searchApiPlayers(
  query: string,
): Promise<{ results: ApiPlayerSearchResult[]; error?: ApiFootballReason }> {
  await requireCoach();
  const q = query.trim();
  if (q.length < 3) return { results: [] };
  try {
    const rows = await searchPlayerProfiles(q);
    return {
      results: rows.slice(0, 20).map(({ player }) => ({
        id: player.id,
        name: player.name,
        photo: player.photo || null,
        age: player.age,
        nationality: player.nationality,
        birthDate: player.birth?.date ?? null,
        position: player.position ?? null,
        number: player.number ?? null,
      })),
    };
  } catch (err) {
    return { results: [], error: err instanceof ApiFootballError ? err.reason : "unknown" };
  }
}

export interface ManualPlayerInput {
  name: string;
  position: "Goalkeeper" | "Defender" | "Midfielder" | "Attacker";
  number: number | null;
  birthDate: string | null;
  nationality: string | null;
  photoUrl: string | null;
}

const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;

function cleanManualPlayer(input: ManualPlayerInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Missing name");
  if (!POSITIONS.includes(input.position)) throw new Error("Invalid position");
  return {
    name,
    position: input.position,
    number:
      input.number != null && Number.isInteger(input.number) && input.number >= 0 && input.number < 1000
        ? input.number
        : null,
    birth_date: input.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) ? input.birthDate : null,
    nationality: input.nationality?.trim() || null,
    photo_url: input.photoUrl || null,
  };
}

// `apiPlayerId` set = picked from an API search, so the player keeps their
// real API id (no merge ever needed); otherwise the table hands out a
// negative id.
export async function addManualPlayer(
  teamId: number,
  input: ManualPlayerInput,
  apiPlayerId: number | null = null,
) {
  const { supabase } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const row = {
    ...cleanManualPlayer(input),
    team_id: teamId,
    stint_id: stintId,
    ...(apiPlayerId != null && apiPlayerId > 0 ? { id: apiPlayerId } : {}),
  };
  const { error } = await supabase.from("manual_squad_players").insert(row);
  if (error) throw new Error(error.message);
}

export async function updateManualPlayer(playerId: number, input: ManualPlayerInput) {
  const { supabase } = await requireCoach();

  const { error } = await supabase
    .from("manual_squad_players")
    .update(cleanManualPlayer(input))
    .eq("id", playerId);
  if (error) throw new Error(error.message);
}

export async function deleteManualPlayer(playerId: number) {
  const { supabase } = await requireCoach();

  const { error } = await supabase.from("manual_squad_players").delete().eq("id", playerId);
  if (error) throw new Error(error.message);
}

export async function mergeManualPlayer(manualPlayerId: number, apiPlayerId: number) {
  const { supabase } = await requireCoach();

  const { error } = await supabase.rpc("merge_manual_player", {
    p_manual_id: manualPlayerId,
    p_api_id: apiPlayerId,
  });
  if (error) throw new Error(error.message);

  // The preferred foot lives outside the merge function's tables: hand it
  // over too (the manual player's wins, like the rest of the merge).
  const { data: manualTraits } = await supabase
    .from("player_traits")
    .select("preferred_foot")
    .eq("player_id", manualPlayerId)
    .maybeSingle();
  if (manualTraits) {
    if (manualTraits.preferred_foot) {
      await supabase
        .from("player_traits")
        .upsert(
          { player_id: apiPlayerId, preferred_foot: manualTraits.preferred_foot, updated_at: new Date().toISOString() },
          { onConflict: "player_id" },
        );
    }
    await supabase.from("player_traits").delete().eq("player_id", manualPlayerId);
  }
  revalidatePath("/", "layout");
}

export async function dismissMergeSuggestion(manualPlayerId: number, apiPlayerId: number) {
  const { supabase } = await requireCoach();

  const { error } = await supabase
    .from("manual_player_merge_dismissals")
    .insert({ manual_player_id: manualPlayerId, api_player_id: apiPlayerId });
  if (error) throw new Error(error.message);
}

export type DossierCategory =
  | "monthly_plan"
  | "individual_eval"
  | "collective_eval"
  | "training_unit"
  // Player dossier only.
  | "individual_plan"
  | "medical_report"
  | "player_other";

// Categories whose files belong to one player (the rest are club-wide).
const PLAYER_DOSSIER_CATEGORIES: DossierCategory[] = [
  "individual_eval",
  "individual_plan",
  "medical_report",
  "player_other",
];

export interface DossierFileInput {
  category: DossierCategory;
  variant: "projected" | "real" | null;
  // "YYYY-MM" — stored as the first day of that month.
  period: string | null;
  title: string;
  storagePath: string;
  fileSize: number;
  // Only for individual_eval.
  player: { id: number; name: string } | null;
}

// The PDF itself is uploaded straight from the browser to the private
// "team-dossier" bucket; this only records it once the upload succeeded.
export async function addDossierFile(teamId: number, input: DossierFileInput) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error } = await supabase.from("team_dossier_files").insert({
    team_id: teamId,
    stint_id: stintId,
    category: input.category,
    variant: input.category === "monthly_plan" ? (input.variant ?? "projected") : null,
    period: input.period ? `${input.period}-01` : null,
    title: input.title,
    storage_path: input.storagePath,
    file_size: input.fileSize,
    player_id: PLAYER_DOSSIER_CATEGORIES.includes(input.category) ? (input.player?.id ?? null) : null,
    player_name: PLAYER_DOSSIER_CATEGORIES.includes(input.category) ? (input.player?.name ?? null) : null,
    uploaded_by: coachId,
  });

  if (error) {
    await supabase.storage.from("team-dossier").remove([input.storagePath]);
    throw new Error(error.message);
  }
}

// Arquivo → "Apagar período". The database function removes the spell and
// everything tied to it in one go (see migration 0055) and hands back the
// dossier files it dropped, whose actual files are removed here.
export async function deleteArchivedStint(stintId: string) {
  const { supabase } = await requireCoach();

  const { data, error } = await supabase.rpc("delete_archived_stint", { p_stint_id: stintId });
  if (error) throw new Error(error.message);

  const paths = (data as string[] | null) ?? [];
  if (paths.length > 0) await supabase.storage.from("team-dossier").remove(paths);
  revalidatePath("/", "layout");
}

export async function deleteDossierFile(fileId: string) {
  const { supabase } = await requireCoach();

  const { data: row, error: readError } = await supabase
    .from("team_dossier_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!row) return;

  const { error } = await supabase.from("team_dossier_files").delete().eq("id", fileId);
  if (error) throw new Error(error.message);

  await supabase.storage.from("team-dossier").remove([row.storage_path]);
}

export async function setPlayerExcluded(
  teamId: number,
  playerId: number,
  playerName: string,
  excluded: boolean,
) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      excluded,
      stint_id: stintId,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );

  if (error) throw new Error(error.message);
}

// A coach dismissing an API-reported sidelined reason as not real — status
// goes back to available and the reason is remembered so it doesn't prompt
// again. Confirming one as real goes through confirmInjuryFromApi instead,
// since a real injury needs a description + expected return, same as a
// manually-started one.
export async function dismissApiInjury(
  teamId: number,
  playerId: number,
  playerName: string,
  injuryKey: string,
) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      status: "available",
      last_seen_injury_key: injuryKey,
      stint_id: stintId,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );

  if (error) throw new Error(error.message);
}

export interface InjuryDetailsInput {
  description: string;
  expectedReturnAt: string | null;
}

// Marking a player injured — whether by hand from the status dropdown, or
// by confirming one the API flagged — always opens an internal injury
// record (player_injuries), so the injury history a coach sees is built
// from what was actually confirmed, not just from a status flag.
export async function startPlayerInjury(
  teamId: number,
  playerId: number,
  playerName: string,
  input: InjuryDetailsInput,
) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error: injuryError } = await supabase.from("player_injuries").insert({
    team_id: teamId,
    player_id: playerId,
    stint_id: stintId,
    description: input.description,
    source: "manual",
    expected_return_at: input.expectedReturnAt,
    created_by: coachId,
    updated_by: coachId,
  });
  if (injuryError) throw new Error(injuryError.message);

  const { error: availabilityError } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      status: "injured",
      stint_id: stintId,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );
  if (availabilityError) throw new Error(availabilityError.message);
}

export async function confirmInjuryFromApi(
  teamId: number,
  playerId: number,
  playerName: string,
  injuryKey: string,
  input: InjuryDetailsInput,
) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error: injuryError } = await supabase.from("player_injuries").insert({
    team_id: teamId,
    player_id: playerId,
    stint_id: stintId,
    description: input.description,
    source: "api",
    api_injury_key: injuryKey,
    expected_return_at: input.expectedReturnAt,
    created_by: coachId,
    updated_by: coachId,
  });
  if (injuryError) throw new Error(injuryError.message);

  const { error: availabilityError } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      status: "injured",
      last_seen_injury_key: injuryKey,
      stint_id: stintId,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );
  if (availabilityError) throw new Error(availabilityError.message);
}

// The coach confirming a player has actually come back — closes the injury
// episode and puts availability back to "available".
export async function confirmPlayerReturn(
  teamId: number,
  playerId: number,
  playerName: string,
  injuryId: string,
  actualReturnAt: string,
) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error: injuryError } = await supabase
    .from("player_injuries")
    .update({
      actual_return_at: actualReturnAt,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    })
    .eq("id", injuryId);
  if (injuryError) throw new Error(injuryError.message);

  const { error: availabilityError } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      status: "available",
      stint_id: stintId,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );
  if (availabilityError) throw new Error(availabilityError.message);
}

// The expected return date was a guess — let the coach push it back instead
// of confirming a return that hasn't actually happened yet.
export async function updateInjuryExpectedReturn(injuryId: string, expectedReturnAt: string | null) {
  const { supabase, coachId } = await requireCoach();

  const { error } = await supabase
    .from("player_injuries")
    .update({
      expected_return_at: expectedReturnAt,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    })
    .eq("id", injuryId);

  if (error) throw new Error(error.message);
}

export async function setPlayerHeight(teamId: number, playerId: number, heightCm: number | null) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error } = await supabase.from("player_body_metrics").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      height_cm: heightCm,
      stint_id: stintId,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );

  if (error) throw new Error(error.message);
}

// The coach's own read of a player. Positions go with the current spell
// (same row as the height); the preferred foot goes with the player, for
// good — no team, no spell.
export async function setPlayerProfile(
  teamId: number,
  playerId: number,
  input: { primaryPosition: string | null; secondaryPosition: string | null; preferredFoot: string | null },
) {
  const { supabase, coachId } = await requireCoach();

  const primary = isDetailedPosition(input.primaryPosition) ? input.primaryPosition : null;
  const secondary =
    primary && isDetailedPosition(input.secondaryPosition) && input.secondaryPosition !== primary
      ? input.secondaryPosition
      : null;
  const foot = isPreferredFoot(input.preferredFoot) ? input.preferredFoot : null;
  const now = new Date().toISOString();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error: positionError } = await supabase.from("player_body_metrics").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      stint_id: stintId,
      primary_position: primary,
      secondary_position: secondary,
      updated_at: now,
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );
  if (positionError) throw new Error(positionError.message);

  const { error: footError } = await supabase
    .from("player_traits")
    .upsert(
      { player_id: playerId, preferred_foot: foot, updated_at: now, updated_by: coachId },
      { onConflict: "player_id" },
    );
  if (footError) throw new Error(footError.message);

  revalidatePath("/", "layout");
}

// Brings the positions of the last spell at this club into the current one
// — only for players who have none yet here. Worked out again on the
// server, so it can't copy more than the banner promised.
export async function copyPreviousPositions(teamId: number): Promise<number> {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);
  if (!stintId) return 0;

  const current = await loadPlayerProfiles(supabase, { teamId, stintId });
  const source = await loadCopyablePositions(supabase, { teamId, stintId, current });
  if (!source) return 0;

  const now = new Date().toISOString();
  const { error } = await supabase.from("player_body_metrics").upsert(
    source.rows.map((row) => ({
      team_id: teamId,
      player_id: row.playerId,
      stint_id: stintId,
      primary_position: row.primaryPosition,
      secondary_position: row.secondaryPosition,
      updated_at: now,
      updated_by: coachId,
    })),
    { onConflict: "team_id,player_id,stint_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  return source.rows.length;
}

export async function addPlayerWeightEntry(
  teamId: number,
  playerId: number,
  weightKg: number,
  recordedAt: string,
) {
  const { supabase, coachId } = await requireCoach();

  const { error } = await supabase.from("player_weight_log").insert({
    team_id: teamId,
    player_id: playerId,
    weight_kg: weightKg,
    recorded_at: recordedAt,
    created_by: coachId,
  });

  if (error) throw new Error(error.message);
}

export async function deletePlayerWeightEntry(id: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase.from("player_weight_log").delete().eq("id", id);

  if (error) throw new Error(error.message);
}

// Mirrors "Estatísticas da época"'s field set exactly (see StatGroup* in
// the player page) — hand-entered totals kept alongside the API-Football
// ones, not overwriting them, so the coach can compare the two over time.
export interface PlayerManualStatsInput {
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  saves: number | null;
  conceded: number | null;
  lineups: number | null;
  rating: number | null;
  shotsTotal: number | null;
  shotsOn: number | null;
  dribbleAttempts: number | null;
  dribbleSuccess: number | null;
  tackles: number | null;
  interceptions: number | null;
  duelsTotal: number | null;
  duelsWon: number | null;
  passesTotal: number | null;
  passesKey: number | null;
  foulsDrawn: number | null;
  foulsCommitted: number | null;
  yellowCards: number | null;
  redCards: number | null;
}

export async function setPlayerManualStats(
  teamId: number,
  playerId: number,
  stats: PlayerManualStatsInput,
) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error } = await supabase.from("player_manual_stats").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      stint_id: stintId,
      appearances: stats.appearances,
      minutes: stats.minutes,
      goals: stats.goals,
      assists: stats.assists,
      saves: stats.saves,
      conceded: stats.conceded,
      lineups: stats.lineups,
      rating: stats.rating,
      shots_total: stats.shotsTotal,
      shots_on: stats.shotsOn,
      dribble_attempts: stats.dribbleAttempts,
      dribble_success: stats.dribbleSuccess,
      tackles: stats.tackles,
      interceptions: stats.interceptions,
      duels_total: stats.duelsTotal,
      duels_won: stats.duelsWon,
      passes_total: stats.passesTotal,
      passes_key: stats.passesKey,
      fouls_drawn: stats.foulsDrawn,
      fouls_committed: stats.foulsCommitted,
      yellow_cards: stats.yellowCards,
      red_cards: stats.redCards,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id,stint_id" },
  );

  if (error) throw new Error(error.message);
}

export interface TeamManualStatsInput {
  played: number | null;
  wins: number | null;
  draws: number | null;
  loses: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  cleanSheets: number | null;
  playedHome: number | null;
  playedAway: number | null;
  winsHome: number | null;
  winsAway: number | null;
  drawsHome: number | null;
  drawsAway: number | null;
  losesHome: number | null;
  losesAway: number | null;
  goalsForHome: number | null;
  goalsForAway: number | null;
  goalsAgainstHome: number | null;
  goalsAgainstAway: number | null;
  cleanSheetsHome: number | null;
  cleanSheetsAway: number | null;
  biggestWinGoalsFor: number | null;
  biggestWinGoalsAgainst: number | null;
  biggestLossGoalsFor: number | null;
  biggestLossGoalsAgainst: number | null;
  penaltyScored: number | null;
  penaltyMissed: number | null;
}

export async function setTeamManualStats(teamId: number, stats: TeamManualStatsInput) {
  const { supabase, coachId } = await requireCoach();
  const stintId = await getCurrentStintId(supabase, teamId);

  const { error } = await supabase.from("team_manual_stats").upsert(
    {
      team_id: teamId,
      stint_id: stintId,
      played: stats.played,
      wins: stats.wins,
      draws: stats.draws,
      loses: stats.loses,
      goals_for: stats.goalsFor,
      goals_against: stats.goalsAgainst,
      clean_sheets: stats.cleanSheets,
      played_home: stats.playedHome,
      played_away: stats.playedAway,
      wins_home: stats.winsHome,
      wins_away: stats.winsAway,
      draws_home: stats.drawsHome,
      draws_away: stats.drawsAway,
      loses_home: stats.losesHome,
      loses_away: stats.losesAway,
      goals_for_home: stats.goalsForHome,
      goals_for_away: stats.goalsForAway,
      goals_against_home: stats.goalsAgainstHome,
      goals_against_away: stats.goalsAgainstAway,
      clean_sheets_home: stats.cleanSheetsHome,
      clean_sheets_away: stats.cleanSheetsAway,
      biggest_win_goals_for: stats.biggestWinGoalsFor,
      biggest_win_goals_against: stats.biggestWinGoalsAgainst,
      biggest_loss_goals_for: stats.biggestLossGoalsFor,
      biggest_loss_goals_against: stats.biggestLossGoalsAgainst,
      penalty_scored: stats.penaltyScored,
      penalty_missed: stats.penaltyMissed,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,stint_id" },
  );

  if (error) throw new Error(error.message);
}
