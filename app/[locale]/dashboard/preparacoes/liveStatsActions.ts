"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  mapLiveEntryRow,
  emptyLineup,
  type LiveEntryInput,
  type LiveEntryRow,
  type TeamLineup,
} from "../../live/liveStatsShared";

async function requireProfile() {
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

  return { supabase, user, profile };
}

function requireEditor(profile: { role: string } | null) {
  if (!profile || profile.role === "viewer") throw new Error("Not authorized");
}

function requireManager(profile: { role: string } | null) {
  if (!profile || (profile.role !== "coach" && profile.role !== "asm")) {
    throw new Error("Not authorized");
  }
}

export interface LiveSessionInfo {
  id: string;
  memberLink: string;
  viewerLink: string;
  startedAt: string | null;
  endedAt: string | null;
  homeLineup: TeamLineup;
  awayLineup: TeamLineup;
  benchNotes: string | null;
}

const SESSION_COLUMNS =
  "id, member_token, viewer_token, started_at, ended_at, home_lineup, away_lineup, bench_notes";

function toSessionInfo(row: {
  id: string;
  member_token: string;
  viewer_token: string;
  started_at: string | null;
  ended_at: string | null;
  home_lineup: unknown;
  away_lineup: unknown;
  bench_notes: string | null;
}): LiveSessionInfo {
  const fallback = emptyLineup();
  return {
    id: row.id,
    memberLink: `/live/${row.member_token}`,
    viewerLink: `/live/${row.viewer_token}`,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    homeLineup: {
      players: Array.isArray(row.home_lineup) && row.home_lineup.length > 0
        ? (row.home_lineup as TeamLineup["players"])
        : fallback.players,
    },
    awayLineup: {
      players: Array.isArray(row.away_lineup) && row.away_lineup.length > 0
        ? (row.away_lineup as TeamLineup["players"])
        : fallback.players,
    },
    benchNotes: row.bench_notes,
  };
}

export async function getLiveSession(preparationKey: string): Promise<LiveSessionInfo | null> {
  const { supabase } = await requireProfile();
  const { data } = await supabase
    .from("live_match_sessions")
    .select(SESSION_COLUMNS)
    .eq("preparation_key", preparationKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? toSessionInfo(data) : null;
}

export async function createLiveSession(preparationKey: string): Promise<LiveSessionInfo> {
  const { supabase, user, profile } = await requireProfile();
  requireManager(profile);
  const teamId = profile!.api_football_team_id;
  if (!teamId) throw new Error("No club selected yet");

  const existing = await getLiveSession(preparationKey);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("live_match_sessions")
    .insert({ team_id: teamId, preparation_key: preparationKey, created_by: user.id })
    .select(SESSION_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
  return toSessionInfo(data);
}

export async function saveLineup(sessionId: string, side: "home" | "away", lineup: TeamLineup) {
  const { supabase, profile } = await requireProfile();
  requireEditor(profile);

  const { error } = await supabase
    .from("live_match_sessions")
    .update(side === "home" ? { home_lineup: lineup.players } : { away_lineup: lineup.players })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function saveBenchNotes(sessionId: string, notes: string) {
  const { supabase, profile } = await requireProfile();
  requireEditor(profile);

  const { error } = await supabase
    .from("live_match_sessions")
    .update({ bench_notes: notes.trim() || null })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function setLiveSessionStatus(sessionId: string, action: "start" | "end") {
  const { supabase, profile } = await requireProfile();
  requireManager(profile);

  const { error } = await supabase
    .from("live_match_sessions")
    .update(
      action === "start"
        ? { started_at: new Date().toISOString(), ended_at: null }
        : { ended_at: new Date().toISOString() },
    )
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function getLiveEntries(sessionId: string): Promise<LiveEntryRow[]> {
  const { supabase } = await requireProfile();
  const { data } = await supabase
    .from("live_match_entries")
    .select("id, event_type, team_side, minute, extra_minute, player_name, notes, created_at, created_by_label")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  return (data ?? []).map(mapLiveEntryRow);
}

export async function addLiveEntry(sessionId: string, input: LiveEntryInput) {
  const { supabase, user, profile } = await requireProfile();
  requireEditor(profile);

  const { error } = await supabase.from("live_match_entries").insert({
    session_id: sessionId,
    kind: "event",
    event_type: input.eventType,
    team_side: input.teamSide,
    minute: input.minute,
    extra_minute: input.extraMinute,
    player_name: input.playerName.trim() || null,
    notes: input.notes.trim() || null,
    created_by: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export async function deleteLiveEntry(id: string) {
  const { supabase, profile } = await requireProfile();
  requireEditor(profile);

  const { error } = await supabase.from("live_match_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}
