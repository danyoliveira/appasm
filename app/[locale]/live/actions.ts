"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { effectiveSessionConfig, isCollectiveKey, isGkKey, type LiveStatConfig } from "./liveStatConfig";
import { loadTeamStatConfig } from "@/lib/liveStatConfigServer";
import type { Locale } from "@/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLiveMatchTeams } from "@/lib/liveStats";
import { getFixtureById, getFixtureLineups, getFixtureStatistics, getSquad } from "@/lib/api-football/cache";
import { MANUAL_PLAYER_COLUMNS, withManualPlayers, type ManualSquadPlayerRow } from "@/lib/manualPlayers";
import { orderSquadLikeGeneralTab } from "../(app)/club/playerShared";
import {
  buildFixtureStatSections,
  type FixtureStatSections,
} from "../(app)/club/fixture/[fixtureId]/fixtureStatsHelpers";
import {
  mapLiveEntryRow,
  toLineup,
  computeCollectiveStats,
  computeGkStats,
  type CollectiveCounterKey,
  type CollectiveStats,
  type GkCounterKey,
  type GkOutcome,
  type LiveSquadPlayer,
  type GkStats,
  type LineupPlayer,
  type LiveEntryInput,
  type LiveEntryRow,
  type LiveMatchInfo,
  type PossessionSide,
  type TeamLineup,
} from "./liveStatsShared";

export interface GuestLiveFeed {
  role: "member" | "viewer" | "gk_coach";
  match: LiveMatchInfo;
  entries: LiveEntryRow[];
  collectiveStats: CollectiveStats;
  gkStats: GkStats;
  // The fields this game shows — frozen at kickoff, the club's current
  // ones before it.
  statConfig: LiveStatConfig;
}

const SESSION_COLUMNS =
  "id, team_id, preparation_key, member_token, viewer_token, gk_token, started_at, halftime_at, second_half_at, ended_at, home_lineup, away_lineup, home_lineup_live, away_lineup_live, bench_notes, stat_config";

// Most mutations below are triggered from the Member link — resolve that
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

// The GK stat endpoints alone also accept the GK Coach link — that link has
// no access to anything else (lineup, formation, events, collective stats,
// clock), enforced simply by which actions call this instead of the
// member-only helper above.
async function requireSessionIdByMemberOrGkToken(token: string): Promise<string> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("live_match_sessions")
    .select("id")
    .or(`member_token.eq.${token},gk_token.eq.${token}`)
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
    .or(`member_token.eq.${token},viewer_token.eq.${token},gk_token.eq.${token}`)
    .maybeSingle();

  if (!session) return null;

  const role = session.member_token === token ? "member" : session.gk_token === token ? "gk_coach" : "viewer";

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

  const statConfig = effectiveSessionConfig(
    session,
    session.started_at ? null : await loadTeamStatConfig(admin, session.team_id),
  );

  const { data: entriesData } = await admin
    .from("live_match_entries")
    .select(
      "id, kind, event_type, team_side, stat_key, stat_value, minute, extra_minute, player_name, player_id, notes, created_at, created_by_label",
    )
    .eq("session_id", session.id)
    .order("created_at", { ascending: false });

  const allEntries = entriesData ?? [];

  return {
    role,
    match: {
      sessionId: session.id,
      preparationKey: session.preparation_key,
      homeName: teams.homeName,
      homeLogo: teams.homeLogo,
      awayName: teams.awayName,
      awayLogo: teams.awayLogo,
      ourSide: teams.ourSide,
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
    entries: allEntries.filter((r) => r.kind === "event").map(mapLiveEntryRow),
    collectiveStats: computeCollectiveStats(
      allEntries.filter((r) => r.kind === "stat"),
      session.ended_at,
    ),
    gkStats: computeGkStats(allEntries.filter((r) => r.kind === "stat")),
    statConfig,
  };
}

// Our squad for the lineup editor — loaded once with the page (not on every
// feed poll). Same list as the club's squad: API players + hand-added ones
// of the current stint, excluded players left out, goalkeepers first.
export async function getLiveSquadByToken(token: string): Promise<LiveSquadPlayer[]> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("live_match_sessions")
    .select("team_id")
    .or(`member_token.eq.${token},viewer_token.eq.${token},gk_token.eq.${token}`)
    .maybeSingle();
  if (!session) return [];
  const teamId = session.team_id as number;

  const { data: stint } = await admin
    .from("coaching_stints")
    .select("id")
    .eq("team_id", teamId)
    .is("ended_at", null)
    .maybeSingle();

  const [apiSquad, { data: manualRows }, { data: availability }] = await Promise.all([
    getSquad(teamId).catch(() => []),
    admin
      .from("manual_squad_players")
      .select(MANUAL_PLAYER_COLUMNS)
      .eq("team_id", teamId)
      .is("merged_into_player_id", null)
      .eq("stint_id", stint?.id ?? ""),
    admin
      .from("player_availability")
      .select("player_id, excluded")
      .eq("team_id", teamId)
      .eq("stint_id", stint?.id ?? ""),
  ]);

  const excluded = new Set((availability ?? []).filter((a) => a.excluded).map((a) => a.player_id));
  const squad = withManualPlayers(apiSquad, (manualRows ?? []) as ManualSquadPlayerRow[]);
  return orderSquadLikeGeneralTab(
    (squad[0]?.players ?? []).filter((p) => !excluded.has(p.id)),
    new Map(),
  ).map((p) => ({ id: p.id, name: p.name, number: p.number, photo: p.photo || null, position: p.position }));
}

// The opponent's squad for the match sheet — same picker and "Preencher com
// o plantel" as our own side, instead of typing 18 names by hand. Empty for
// an opponent that isn't in API-Football.
export async function getLiveOpponentSquadByToken(token: string): Promise<LiveSquadPlayer[]> {
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("live_match_sessions")
    .select("team_id, preparation_key")
    .or(`member_token.eq.${token},viewer_token.eq.${token},gk_token.eq.${token}`)
    .maybeSingle();
  if (!session) return [];
  const teams = await resolveLiveMatchTeams(session.preparation_key, session.team_id as number).catch(() => null);
  if (!teams?.opponentTeamId) return [];
  const squad = await getSquad(teams.opponentTeamId).catch(() => []);
  return orderSquadLikeGeneralTab(squad[0]?.players ?? [], new Map()).map((p) => ({
    id: p.id,
    name: p.name,
    number: p.number,
    photo: p.photo || null,
    position: p.position,
  }));
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
    player_id: input.playerId ?? null,
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

// Each tap is its own row — the count is just how many rows match a given
// team/stat_key, so there's nothing to "update", only insert (below) and
// undo (further down).
export async function addCollectiveStatByToken(
  token: string,
  statKey: CollectiveCounterKey,
  teamSide: "home" | "away",
) {
  if (!isCollectiveKey(statKey)) throw new Error("Invalid stat");
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin.from("live_match_entries").insert({
    session_id: sessionId,
    kind: "stat",
    stat_key: statKey,
    team_side: teamSide,
  });

  if (error) throw new Error(error.message);
}

// "-1" on a counter — there's no specific row for the guest to pick (taps
// aren't shown as a feed), so this removes whichever tap of that stat/team
// was most recent, same undo-the-last-action idea as deleteLiveEntryByToken.
export async function undoCollectiveStatByToken(
  token: string,
  statKey: CollectiveCounterKey,
  teamSide: "home" | "away",
) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { data: last } = await admin
    .from("live_match_entries")
    .select("id")
    .eq("session_id", sessionId)
    .eq("kind", "stat")
    .eq("stat_key", statKey)
    .eq("team_side", teamSide)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return;

  const { error } = await admin.from("live_match_entries").delete().eq("id", last.id);
  if (error) throw new Error(error.message);
}

// Logs "possession changed to X now" — computeCollectiveStats derives
// per-side totals from the gaps between consecutive rows of these.
export async function setPossessionByToken(token: string, side: PossessionSide) {
  const sessionId = await requireSessionIdByMemberToken(token);
  const admin = createAdminClient();

  const { error } = await admin.from("live_match_entries").insert({
    session_id: sessionId,
    kind: "stat",
    stat_key: "possession",
    stat_value: side,
  });

  if (error) throw new Error(error.message);
}

// Marks who's in goal for a side right now — logged the same way as a
// possession change (a "state changed to X" row), so computeGkStats can
// tell which player each GK counter tap below belongs to.
export async function setGkByToken(
  token: string,
  side: "home" | "away",
  playerName: string,
  playerId: number | null = null,
) {
  const sessionId = await requireSessionIdByMemberOrGkToken(token);
  const admin = createAdminClient();

  const { error } = await admin.from("live_match_entries").insert({
    session_id: sessionId,
    kind: "stat",
    stat_key: "gk_selection",
    team_side: side,
    player_name: playerName,
    player_id: playerId,
  });

  if (error) throw new Error(error.message);
}

// Looks up whichever player is currently marked as `side`'s goalkeeper —
// shared by addGkStatByToken/undoGkStatByToken so a tap always lands on
// the right player even if the client's own copy of the selection is
// slightly stale (e.g. two coaches on the bench with two phones).
async function currentGk(
  admin: ReturnType<typeof createAdminClient>,
  sessionId: string,
  side: "home" | "away",
): Promise<{ name: string; playerId: number | null } | null> {
  const { data } = await admin
    .from("live_match_entries")
    .select("player_name, player_id")
    .eq("session_id", sessionId)
    .eq("kind", "stat")
    .eq("stat_key", "gk_selection")
    .eq("team_side", side)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.player_name ? { name: data.player_name, playerId: data.player_id ?? null } : null;
}

export async function addGkStatByToken(
  token: string,
  side: "home" | "away",
  statKey: GkCounterKey,
  outcome: GkOutcome = "complete",
) {
  if (!isGkKey(statKey)) throw new Error("Invalid stat");
  const sessionId = await requireSessionIdByMemberOrGkToken(token);
  const admin = createAdminClient();

  const gk = await currentGk(admin, sessionId, side);
  if (!gk) return;
  const gkName = gk.name;

  const { error } = await admin.from("live_match_entries").insert({
    session_id: sessionId,
    kind: "stat",
    stat_key: statKey,
    stat_value: outcome === "incomplete" ? "incomplete" : "complete",
    team_side: side,
    player_name: gkName,
    player_id: gk.playerId,
  });

  if (error) throw new Error(error.message);
}

export async function undoGkStatByToken(
  token: string,
  side: "home" | "away",
  statKey: GkCounterKey,
  outcome: GkOutcome = "complete",
) {
  const sessionId = await requireSessionIdByMemberOrGkToken(token);
  const admin = createAdminClient();

  const gk = await currentGk(admin, sessionId, side);
  if (!gk) return;
  const gkName = gk.name;

  const { data: last } = await admin
    .from("live_match_entries")
    .select("id")
    .eq("session_id", sessionId)
    .eq("kind", "stat")
    .eq("stat_key", statKey)
    .eq("team_side", side)
    .eq("player_name", gkName)
    // "complete" also matches rows from before the complete/incomplete
    // split (no stat_value), which count as completed.
    .or(outcome === "incomplete" ? "stat_value.eq.incomplete" : "stat_value.eq.complete,stat_value.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return;

  const { error } = await admin.from("live_match_entries").delete().eq("id", last.id);
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

export interface FixtureExternalStats extends FixtureStatSections {
  homeLogo: string;
  awayLogo: string;
}

// The same "Estatísticas do jogo" API-Football bars shown on /club/fixture/
// <id> — no session/token needed, just the preparation key: manual preps
// (opponent outside the fixture list) have no real fixture to pull from and
// return null, same as fetchAutoLineupByToken. Callable from both the
// authenticated dashboard and the token-based guest link, since it's the
// same public match data either way.
export async function getFixtureExternalStats(
  preparationKey: string,
  locale: Locale,
): Promise<FixtureExternalStats | null> {
  const fixtureId = Number(preparationKey);
  if (Number.isNaN(fixtureId)) return null;

  const [fixtureResult, statistics] = await Promise.all([
    getFixtureById(fixtureId).catch(() => []),
    getFixtureStatistics(fixtureId).catch(() => []),
  ]);
  const fixture = fixtureResult[0];
  if (!fixture) return null;

  const homeStats = statistics.find((s) => s.team.id === fixture.teams.home.id);
  const awayStats = statistics.find((s) => s.team.id === fixture.teams.away.id);
  if (!homeStats || !awayStats) return null;

  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { headline, sections } = buildFixtureStatSections(homeStats, awayStats, locale, t);
  if (headline.length === 0 && sections.every((s) => s.rows.length === 0)) return null;

  return {
    homeLogo: fixture.teams.home.logo,
    awayLogo: fixture.teams.away.logo,
    headline,
    sections,
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
    .select("home_lineup, away_lineup, team_id")
    .eq("id", sessionId)
    .single();

  // Freeze the club's fields as they are now — later config changes only
  // reach the games after this one.
  const statConfig = session ? await loadTeamStatConfig(admin, session.team_id) : null;

  const { error } = await admin
    .from("live_match_sessions")
    .update({
      started_at: new Date().toISOString(),
      stat_config: statConfig,
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
  await carryScoreToManualGame(admin, sessionId);
}

// A manual game has no API-Football result, so at full time the score
// logged in ASM Live Mode becomes its final score — unless the coach already
// typed one in by hand. (API fixtures take the Live Mode score only for
// display, while API-Football has none — see lib/liveScores.ts.)
async function carryScoreToManualGame(admin: ReturnType<typeof createAdminClient>, sessionId: string) {
  const { data: session } = await admin
    .from("live_match_sessions")
    .select("preparation_key")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.preparation_key.startsWith("manual-")) return;
  const manualId = session.preparation_key.slice("manual-".length);

  const [{ data: manualRow }, { data: goals }] = await Promise.all([
    admin.from("manual_preparations").select("is_home, goals_for, goals_against").eq("id", manualId).maybeSingle(),
    admin
      .from("live_match_entries")
      .select("team_side")
      .eq("session_id", sessionId)
      .eq("kind", "event")
      .eq("event_type", "goal"),
  ]);
  if (!manualRow || manualRow.goals_for != null || manualRow.goals_against != null) return;

  const home = (goals ?? []).filter((g) => g.team_side === "home").length;
  const away = (goals ?? []).filter((g) => g.team_side === "away").length;
  await admin
    .from("manual_preparations")
    .update({
      goals_for: manualRow.is_home ? home : away,
      goals_against: manualRow.is_home ? away : home,
    })
    .eq("id", manualId);
  revalidatePath("/", "layout");
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
      stat_config: null,
      home_lineup_live: session?.home_lineup ?? null,
      away_lineup_live: session?.away_lineup ?? null,
    })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);

  const { error: deleteError } = await admin.from("live_match_entries").delete().eq("session_id", sessionId);
  if (deleteError) throw new Error(deleteError.message);
}
