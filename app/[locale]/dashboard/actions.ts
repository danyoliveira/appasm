"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApiFootballError,
  searchTeams,
  type TeamSearchResult,
  type ApiFootballReason,
} from "@/lib/api-football/client";
import { getTeamsByCountry } from "@/lib/api-football/cache";
import type { VideoCategory } from "./preparacoes/videoCategories";

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

// preparationKey mirrors the /dashboard/preparacoes/[fixtureId] route param
// as-is — either a numeric API-Football fixture id or "manual-<uuid>".
export async function addPreparationVideo(
  preparationKey: string,
  url: string,
  notes: string,
  category: VideoCategory | null,
  playerId: number | null,
  tacticalSnapshotId: string | null,
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
    tactical_snapshot_id: tacticalSnapshotId,
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
  tacticalSnapshotId: string | null,
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
      tactical_snapshot_id: tacticalSnapshotId,
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

  const { error } = await supabase
    .from("profiles")
    .update({ api_football_team_id: teamId, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
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

  const { error } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      status,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id" },
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

export async function setPlayerExcluded(
  teamId: number,
  playerId: number,
  playerName: string,
  excluded: boolean,
) {
  const { supabase, coachId } = await requireCoach();

  const { error } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      excluded,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id" },
  );

  if (error) throw new Error(error.message);
}

export async function resolveApiInjury(
  teamId: number,
  playerId: number,
  playerName: string,
  injuryKey: string,
  isReal: boolean,
) {
  const { supabase, coachId } = await requireCoach();

  const { error } = await supabase.from("player_availability").upsert(
    {
      team_id: teamId,
      player_id: playerId,
      player_name: playerName,
      status: isReal ? "injured" : "available",
      last_seen_injury_key: injuryKey,
      updated_at: new Date().toISOString(),
      updated_by: coachId,
    },
    { onConflict: "team_id,player_id" },
  );

  if (error) throw new Error(error.message);
}
