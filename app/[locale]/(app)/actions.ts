"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApiFootballError,
  searchTeams,
  type TeamSearchResult,
  type ApiFootballReason,
} from "@/lib/api-football/client";
import { getTeamsByCountry, getSquad } from "@/lib/api-football/cache";
import { getCurrentStintId } from "@/lib/coachingStints";
import type { VideoCategory } from "./preparations/videoCategories";

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

export async function createManualPreparation(opponentTeamId: number, matchDateIso: string) {
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
      opponent_team_id: opponentTeamId,
      match_date: matchDateIso,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return data.id as string;
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
        const squad = await getSquad(previousTeamId).catch(() => []);
        const players = squad[0]?.players ?? [];
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
  const role = (formData.get("role") as string) === "viewer" ? "viewer" : "member";
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

export async function addPlayerNote(teamId: number, playerId: number, content: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase
    .from("player_notes")
    .insert({ team_id: teamId, player_id: playerId, content });

  if (error) throw new Error(error.message);
}

export async function updatePlayerNote(noteId: string, content: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase
    .from("player_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", noteId);

  if (error) throw new Error(error.message);
}

export async function deletePlayerNote(noteId: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase.from("player_notes").delete().eq("id", noteId);

  if (error) throw new Error(error.message);
}

export async function addClubNote(teamId: number, content: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase.from("club_notes").insert({ team_id: teamId, content });

  if (error) throw new Error(error.message);
}

export async function updateClubNote(noteId: string, content: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase
    .from("club_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", noteId);

  if (error) throw new Error(error.message);
}

export async function deleteClubNote(noteId: string) {
  const { supabase } = await requireCoach();

  const { error } = await supabase.from("club_notes").delete().eq("id", noteId);

  if (error) throw new Error(error.message);
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
