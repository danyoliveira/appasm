"use server";

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  ApiFootballError,
  type TeamSearchResult,
  type ApiFootballReason,
} from "@/lib/api-football/client";
import { getTeamsByCountry } from "@/lib/api-football/cache";

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
