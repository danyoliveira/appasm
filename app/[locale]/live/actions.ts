"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLiveMatchTeams } from "@/lib/liveStats";
import { getFixtureById, getFixtureLineups } from "@/lib/api-football/cache";
import {
  mapLiveEntryRow,
  emptyLineup,
  type LineupPlayer,
  type LiveEntryInput,
  type LiveEntryRow,
  type LiveMatchInfo,
  type TeamLineup,
} from "./liveStatsShared";

export interface GuestLiveFeed {
  role: "member" | "viewer";
  match: LiveMatchInfo;
  entries: LiveEntryRow[];
}

const SESSION_COLUMNS =
  "id, team_id, preparation_key, member_token, viewer_token, started_at, halftime_at, second_half_at, ended_at, home_lineup, away_lineup, home_lineup_live, away_lineup_live, bench_notes";

function toLineup(rawPlayers: unknown): TeamLineup {
  const fallback = emptyLineup();
  return {
    players:
      Array.isArray(rawPlayers) && rawPlayers.length > 0
        ? (rawPlayers as TeamLineup["players"])
        : fallback.players,
  };
}

// Every mutation below is triggered from the Member link — resolve that
// token to a session id (or bail) once, instead of repeating the lookup.
async function requireSessionIdByMemberToken(token: string): Promise<string> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("live_match_sessions")
    .select("id")
    .eq("member_token", token)
    .maybeSingle();

  if (!session) throw new Error("Invalid link");
  return session.id;
}

// Guests never touch Supabase Auth — the token IS the credential, validated
// and executed here with the admin client, entirely outside RLS.
//
// connectionId (a random id the guest's browser mints once per page load)
// doubles this as a presence heartbeat when provided — every poll from the
// guest view keeps live_match_presence fresh, so the coach's dashboard can
// show who's actually connected right now (see getLiveSessionPresence).
export async function getLiveFeedByToken(
  token: string,
  connectionId?: string,
): Promise<GuestLiveFeed | null> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("live_match_sessions")
    .select(SESSION_COLUMNS)
    .or(`member_token.eq.${token},viewer_token.eq.${token}`)
    .maybeSingle();

  if (!session) return null;

  const role = session.member_token === token ? "member" : "viewer";

  if (connectionId) {
    await admin
      .from("live_match_presence")
      .upsert(
        { session_id: session.id, connection_id: connectionId, role, last_seen_at: new Date().toISOString() },
        { onConflict: "session_id,connection_id" },
      )
      .then(
        () => {},
        () => {}, // Presence is a nice-to-have — never let it break the feed fetch.
      );
  }

  const teams = await resolveLiveMatchTeams(session.preparation_key, session.team_id);
  if (!teams) return null;

  const { data: entriesData } = await admin
    .from("live_match_entries")
    .select("id, event_type, team_side, minute, extra_minute, player_name, notes, created_at, created_by_label")
    .eq("session_id", session.id)
    .order("created_at", { ascending: false });

  return {
    role,
    match: {
      sessionId: session.id,
      homeName: teams.homeName,
      homeLogo: teams.homeLogo,
      awayName: teams.awayName,
      awayLogo: teams.awayLogo,
      startedAt: session.started_at,
      halftimeAt: session.halftime_at,
      secondHalfAt: session.second_half_at,
      endedAt: session.ended_at,
      homeLineup: toLineup(session.home_lineup),
      awayLineup: toLineup(session.away_lineup),
      // Before the first kickoff there's no live copy yet — mirror the
      // pre-game config so nothing renders empty.
      homeLineupLive: toLineup(session.home_lineup_live ?? session.home_lineup),
      awayLineupLive: toLineup(session.away_lineup_live ?? session.away_lineup),
      benchNotes: session.bench_notes,
    },
    entries: (entriesData ?? []).map(mapLiveEntryRow),
  };
}

export async function addLiveEntryByToken(token: string, input: LiveEntryInput, authorLabel: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin.from("live_match_entries").insert({
    session_id: sessionId,
    kind: "event",
    event_type: input.eventType,
    team_side: input.teamSide,
    minute: input.minute,
    extra_minute: input.extraMinute,
    player_name: input.playerName.trim() || null,
    notes: input.notes.trim() || null,
    created_by_label: authorLabel.trim() || null,
  });

  if (error) throw new Error(error.message);
}

export async function deleteLiveEntryByToken(token: string, entryId: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin
    .from("live_match_entries")
    .delete()
    .eq("id", entryId)
    .eq("session_id", sessionId);

  if (error) throw new Error(error.message);
}

export interface AutoLineupResult {
  home: LineupPlayer[];
  away: LineupPlayer[];
}

function toAutoLineupPlayers(
  entries: { player: { name: string; number: number } }[],
  starting: boolean,
): LineupPlayer[] {
  return entries.map((e) => ({
    number: e.player.number ?? null,
    name: e.player.name,
    starting,
    x: null,
    y: null,
  }));
}

// Only a real API-Football fixture (numeric preparation key) can have an
// official lineup to pull — manual preparations have no external match.
// API-Football only publishes lineups shortly before kickoff, so this is
// commonly null right up until then; the guest UI just hides the button.
export async function fetchAutoLineupByToken(token: string): Promise<AutoLineupResult | null> {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("live_match_sessions")
    .select("preparation_key")
    .eq("id", sessionId)
    .single();

  const fixtureId = session ? Number(session.preparation_key) : NaN;
  if (!session || Number.isNaN(fixtureId)) return null;

  const [fixtureResult, lineups] = await Promise.all([
    getFixtureById(fixtureId).catch(() => []),
    getFixtureLineups(fixtureId).catch(() => []),
  ]);
  const fixture = fixtureResult[0];
  if (!fixture || lineups.length < 2) return null;

  const homeTeamId = fixture.teams.home.id;
  const homeLineup = lineups.find((l) => l.team.id === homeTeamId);
  const awayLineup = lineups.find((l) => l.team.id !== homeTeamId);
  if (!homeLineup?.startXI.length || !awayLineup?.startXI.length) return null;

  return {
    home: [...toAutoLineupPlayers(homeLineup.startXI, true), ...toAutoLineupPlayers(homeLineup.substitutes, false)],
    away: [...toAutoLineupPlayers(awayLineup.startXI, true), ...toAutoLineupPlayers(awayLineup.substitutes, false)],
  };
}

export async function saveLineupByToken(token: string, side: "home" | "away", lineup: TeamLineup) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin
    .from("live_match_sessions")
    .update(side === "home" ? { home_lineup: lineup.players } : { away_lineup: lineup.players })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

// The live working copy — every Modo Jogo mutation from kickoff onward
// (drags, subs, red cards) goes here instead of home_lineup/away_lineup, so
// the pre-game Ficha de Jogo/Formação Tática record stays untouched forever.
export async function saveLiveLineupByToken(token: string, side: "home" | "away", lineup: TeamLineup) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin
    .from("live_match_sessions")
    .update(side === "home" ? { home_lineup_live: lineup.players } : { away_lineup_live: lineup.players })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

export async function saveBenchNotesByToken(token: string, notes: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin
    .from("live_match_sessions")
    .update({ bench_notes: notes.trim() || null })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

// The match clock's four milestones — all guest-triggered from inside Modo
// Jogo (there's no dashboard "Iniciar jogo" anymore). Kickoff locks the
// wizard tabs; the other three just log a timestamp for the clock display.
export async function markKickoffByToken(token: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  // Seed the live working copy from the pre-game config right at kickoff —
  // from here on, Modo Jogo mutates home_lineup_live/away_lineup_live only.
  const { data: session } = await admin
    .from("live_match_sessions")
    .select("home_lineup, away_lineup")
    .eq("id", sessionId)
    .single();

  const { error } = await admin
    .from("live_match_sessions")
    .update({
      started_at: new Date().toISOString(),
      halftime_at: null,
      second_half_at: null,
      ended_at: null,
      home_lineup_live: session?.home_lineup ?? null,
      away_lineup_live: session?.away_lineup ?? null,
    })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

export async function markHalftimeByToken(token: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin
    .from("live_match_sessions")
    .update({ halftime_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

export async function markSecondHalfByToken(token: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin
    .from("live_match_sessions")
    .update({ second_half_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

export async function markFullTimeByToken(token: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin
    .from("live_match_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}

// Puts everything back to how it was right at kickoff — clock, the live
// lineup (re-seeded from the untouched pre-game config, undoing in-match
// drags/subs/red cards), and the logged events feed. Bench notes are
// untouched — those aren't match state. home_lineup/away_lineup themselves
// were never written to after kickoff, so they're always the right source.
export async function restartLiveSessionByToken(token: string) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { data: session } = await admin
    .from("live_match_sessions")
    .select("home_lineup, away_lineup")
    .eq("id", sessionId)
    .single();

  const { error } = await admin
    .from("live_match_sessions")
    .update({
      started_at: null,
      halftime_at: null,
      second_half_at: null,
      ended_at: null,
      home_lineup_live: session?.home_lineup ?? null,
      away_lineup_live: session?.away_lineup ?? null,
    })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

  const { error: deleteError } = await admin.from("live_match_entries").delete().eq("session_id", sessionId);
  if (deleteError) throw new Error(deleteError.message);
}
