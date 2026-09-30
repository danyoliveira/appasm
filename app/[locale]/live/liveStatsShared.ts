import { DEFAULT_LIVE_STAT_CONFIG, isCollectiveKey, isGkKey } from "./liveStatConfig";

export const LIVE_EVENT_TYPES = ["goal", "assist", "yellow_card", "red_card", "substitution"] as const;
export type LiveEventType = (typeof LIVE_EVENT_TYPES)[number];

export const LIVE_EVENT_ICON: Record<LiveEventType, string> = {
  goal: "⚽",
  assist: "🅰️",
  yellow_card: "🟨",
  red_card: "🟥",
  substitution: "🔁",
};

export interface LiveEntryInput {
  eventType: LiveEventType;
  teamSide: "home" | "away";
  minute: number | null;
  extraMinute: number | null;
  playerName: string;
  // Our own squad player this event is about, when the lineup links it.
  playerId?: number | null;
  notes: string;
}

export interface LiveEntryRow {
  id: string;
  playerId: number | null;
  eventType: LiveEventType | null;
  teamSide: "home" | "away" | null;
  minute: number | null;
  extraMinute: number | null;
  playerName: string | null;
  notes: string | null;
  createdAt: string;
  authorLabel: string | null;
}

export const STARTING_XI_SIZE = 11;

// Our squad as offered in the lineup editor (goalkeepers first).
export interface LiveSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  photo: string | null;
  position: string;
}

// The linked squad player id of whoever is listed under this name.
export function lineupPlayerId(players: LineupPlayer[], name: string | null | undefined): number | null {
  if (!name) return null;
  return players.find((p) => p.name === name)?.playerId ?? null;
}

// "Preencher com o plantel": a plausible 4-3-3 as the starting XI — one
// goalkeeper, four defenders, three midfielders, three forwards, each in
// squad order — and everyone else on the bench. The coach then adjusts.
// (Taking "the first eleven" of a squad sorted by position gave a keeper
// and ten defenders.) A squad short in one line is topped up from the rest.
const XI_SHAPE: [string, number][] = [
  ["Goalkeeper", 1],
  ["Defender", 4],
  ["Midfielder", 3],
  ["Attacker", 3],
];

export function lineupFromSquad(squad: LiveSquadPlayer[]): LineupPlayer[] {
  const starters: LiveSquadPlayer[] = [];
  for (const [position, count] of XI_SHAPE) {
    starters.push(...squad.filter((p) => p.position === position).slice(0, count));
  }
  // Top up with outfield players first — a second goalkeeper only if
  // there is truly nobody else.
  const leftovers = [
    ...squad.filter((p) => p.position !== "Goalkeeper"),
    ...squad.filter((p) => p.position === "Goalkeeper"),
  ];
  for (const p of leftovers) {
    if (starters.length >= STARTING_XI_SIZE) break;
    if (!starters.includes(p)) starters.push(p);
  }
  const starterIds = new Set(starters.map((p) => p.id));
  const bench = squad.filter((p) => !starterIds.has(p.id));
  const toLineupPlayer = (p: LiveSquadPlayer, starting: boolean): LineupPlayer => ({
    number: p.number,
    name: p.name,
    playerId: p.id,
    starting,
    x: null,
    y: null,
  });
  // Drawn as the 4-3-3 it was picked as — the pitch's generic fallback is a
  // 4-4-2, which would put a forward in midfield.
  const isFullShape =
    starters.length === STARTING_XI_SIZE &&
    XI_SHAPE.every(([position, count]) => starters.filter((p) => p.position === position).length === count);
  const startingXi = starters.map((p) => toLineupPlayer(p, true));
  return [
    ...(isFullShape ? applyFormation(startingXi, [4, 3, 3]) : startingXi),
    ...bench.map((p) => toLineupPlayer(p, false)),
  ];
}

export interface LineupPlayer {
  number: number | null;
  name: string;
  // The real squad player (negative = hand-added to our squad). Absent or
  // null for free-text names and lineups from before this. Also set for an
  // opponent picked from their API squad — anything that credits *our*
  // players must check the side, not just this id.
  playerId?: number | null;
  starting: boolean;
  // Only ever set for starting players, once placed on the formation pitch.
  x: number | null;
  y: number | null;
}

export interface TeamLineup {
  players: LineupPlayer[];
}

export function emptyLineup(): TeamLineup {
  return {
    players: Array.from({ length: STARTING_XI_SIZE }, () => ({
      number: null,
      name: "",
      starting: true,
      x: null,
      y: null,
    })),
  };
}

// A saved lineup's `players` jsonb column starts out empty ([]) — falls
// back to the 11 blank starting slots above until someone actually enters
// one. Shared by the token-based guest actions and the authenticated
// dashboard's recap action, so both read the same stored shape the same way.
export function toLineup(rawPlayers: unknown): TeamLineup {
  const fallback = emptyLineup();
  return {
    players:
      Array.isArray(rawPlayers) && rawPlayers.length > 0
        ? (rawPlayers as TeamLineup["players"])
        : fallback.players,
  };
}

// Simple default rows (GK / back / mid / forward) so the formation pitch
// isn't a blank canvas — a generic 4-4-2-ish spread the coach then drags
// into whatever the actual shape is.
const DEFAULT_ROWS: { count: number; y: number }[] = [
  { count: 1, y: 90 },
  { count: 4, y: 68 },
  { count: 4, y: 42 },
  { count: 2, y: 16 },
];

// One-tap systems for the formation step: outfield lines from the back
// forward. The goalkeeper is always the first starter.
export const FORMATION_PRESETS: { label: string; lines: number[] }[] = [
  { label: "4-3-3", lines: [4, 3, 3] },
  { label: "4-4-2", lines: [4, 4, 2] },
  { label: "4-2-3-1", lines: [4, 2, 3, 1] },
  { label: "3-5-2", lines: [3, 5, 2] },
  { label: "3-4-3", lines: [3, 4, 3] },
  { label: "5-3-2", lines: [5, 3, 2] },
];

// Pitch spots for a system, in starter order (keeper, then each line left
// to right): the keeper on his line, the outfield lines spread evenly from
// the back (y 70) to the front (y 16).
export function formationPositions(lines: number[]): { x: number; y: number }[] {
  const spots = [{ x: 50, y: 90 }];
  const back = 70;
  const front = 16;
  lines.forEach((count, row) => {
    const y = lines.length === 1 ? (back + front) / 2 : back - ((back - front) * row) / (lines.length - 1);
    const step = 100 / (count + 1);
    for (let i = 0; i < count; i += 1) spots.push({ x: step * (i + 1), y });
  });
  return spots;
}

// Puts the starting XI (in its current order) into a system. Players past
// the eleven spots keep where they were.
export function applyFormation(starters: LineupPlayer[], lines: number[]): LineupPlayer[] {
  const spots = formationPositions(lines);
  return starters.map((p, i) => (spots[i] ? { ...p, x: spots[i].x, y: spots[i].y } : p));
}

// The pitch label is tight — the surname alone reads better than a cramped,
// truncated full name.
export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

export function defaultFormationPosition(index: number): { x: number; y: number } {
  let remaining = index;
  for (const row of DEFAULT_ROWS) {
    if (remaining < row.count) {
      const step = 100 / (row.count + 1);
      return { x: step * (remaining + 1), y: row.y };
    }
    remaining -= row.count;
  }
  return { x: 50, y: 50 };
}

// Same phase math MatchClock uses to display the running clock, reused here
// to stamp a `minute` on events logged by tapping a player mid-match.
export function currentMatchMinute(match: {
  startedAt: string | null;
  halftimeAt: string | null;
  secondHalfAt: string | null;
  endedAt: string | null;
}): number | null {
  if (!match.startedAt) return null;
  const started = new Date(match.startedAt).getTime();
  const halftime = match.halftimeAt ? new Date(match.halftimeAt).getTime() : null;
  const secondHalf = match.secondHalfAt ? new Date(match.secondHalfAt).getTime() : null;
  const ended = match.endedAt ? new Date(match.endedAt).getTime() : null;

  let elapsedMs: number;
  if (secondHalf != null) {
    // The second half starts at 45', regardless of first-half stoppage time.
    elapsedMs = 45 * 60000 + ((ended ?? Date.now()) - secondHalf);
  } else if (halftime != null) {
    elapsedMs = halftime - started;
  } else {
    elapsedMs = (ended ?? Date.now()) - started;
  }
  // Football counts from 1: a goal at 0:35 is in the 1st minute, one at
  // 45:20 in the 46th.
  return Math.max(0, Math.floor(elapsedMs / 60000)) + 1;
}

// Bakes in the pitch's own default-computed slot for every starting player
// whose position isn't explicit yet (x/y still null — an auto/random-filled
// lineup nobody dragged). Must run *before* the starting set's composition
// changes: LiveFormationPitch falls back to defaultFormationPosition(index
// within the starting-only list) when rendering, so removing or adding one
// starter shifts everyone after them to a different index — and therefore a
// different default slot — the instant the list is re-filtered. Freezing
// first means the players who were already on screen stay exactly where
// they were drawn, instead of sliding into each other.
function freezeStartingPositions(players: LineupPlayer[]): LineupPlayer[] {
  const startingPlayers = players.filter((p) => p.starting);
  return players.map((p) => {
    if (!p.starting || (p.x != null && p.y != null)) return p;
    const pos = defaultFormationPosition(startingPlayers.indexOf(p));
    return { ...p, x: pos.x, y: pos.y };
  });
}

// Swaps one starting player off for one bench player on, within a team's
// full players array. Matched by name (the only stable identifier a click
// site has) rather than array index/reference, since the array may have
// been refetched by the 4s poll between the two taps that make a sub. The
// incoming player inherits the outgoing player's (now-frozen) pitch
// position, and every other starter's frozen position comes along
// unchanged — nobody moves, nobody overlaps.
export function applySubstitution(
  players: LineupPlayer[],
  outPlayerName: string,
  inPlayerName: string,
): LineupPlayer[] {
  const frozen = freezeStartingPositions(players);
  const outPlayer = frozen.find((p) => p.starting && p.name === outPlayerName);
  const pos = outPlayer ? { x: outPlayer.x, y: outPlayer.y } : { x: null, y: null };
  return frozen.map((p) => {
    if (p.starting && p.name === outPlayerName) return { ...p, starting: false, x: null, y: null };
    if (!p.starting && p.name === inPlayerName) return { ...p, starting: true, x: pos.x, y: pos.y };
    return p;
  });
}

// A red card sends the player off — no one comes on for them, so this is
// applySubstitution's removal half on its own. Same freeze-first reasoning:
// shrinking the starting list by one shouldn't reshuffle who's left.
export function removeFromField(players: LineupPlayer[], playerName: string): LineupPlayer[] {
  const frozen = freezeStartingPositions(players);
  return frozen.map((p) =>
    p.starting && p.name === playerName ? { ...p, starting: false, x: null, y: null } : p,
  );
}

// Undoes removeFromField — deleting a mistaken red card puts the player back
// on the pitch. x/y stay null for *them* (there's no vacated slot to inherit
// here, unlike a substitution) — LiveFormationPitch falls back to a default
// formation slot for an unplaced starter. The rest of the XI is frozen first
// so re-inserting this player doesn't shift anyone else's slot instead.
export function restoreToField(players: LineupPlayer[], playerName: string): LineupPlayer[] {
  const frozen = freezeStartingPositions(players);
  return frozen.map((p) =>
    !p.starting && p.name === playerName ? { ...p, starting: true, x: null, y: null } : p,
  );
}

// Collective stats — counted per team, never tied to a specific player
// (unlike goals/cards/subs above). Stored as `kind: "stat"` rows on the same
// live_match_entries table (stat_key/stat_value already exist on it for
// exactly this), so no schema change was needed to add this.
//
// Which counters a club uses is configurable (liveStatConfig.ts) — counting
// takes every collective key it finds; the built-in keys below are just the
// default set (and what the demo generator uses).
export const COLLECTIVE_COUNTER_KEYS = DEFAULT_LIVE_STAT_CONFIG.collective.map((f) => f.key);
export type CollectiveCounterKey = string;

// Counts per field key; a field with no taps may be missing — read with statOf.
export type CollectiveStatsSide = Record<string, number>;

export const statOf = (side: Record<string, number> | null | undefined, key: string): number => side?.[key] ?? 0;

export type PossessionSide = "home" | "away" | "neutral";

export interface CollectiveStats {
  home: CollectiveStatsSide;
  away: CollectiveStatsSide;
  // Cumulative milliseconds attributed to each side/neutral since kickoff —
  // % of possession is derived from these three on the client.
  possessionMsHome: number;
  possessionMsAway: number;
  possessionMsNeutral: number;
  currentPossession: PossessionSide | null;
  // Timestamp of the most recent stat tap (any kind) — lets the UI flag the
  // Estatísticas tab as having unseen activity when it's not the active one.
  lastStatAt: string | null;
}

export function emptyCollectiveStatsSide(): CollectiveStatsSide {
  return {};
}

// Raw `kind: "stat"` rows -> aggregated totals. Counters are just a tally of
// matching rows; possession is reconstructed from consecutive "possession
// changed to X" rows, attributing the time between each pair to whichever
// side was current at the start of that interval (the last, still-open
// interval runs up to `now`, or to full-time if the match already ended).
export function computeCollectiveStats(
  rows: { stat_key: string | null; stat_value: string | null; team_side: string | null; created_at: string }[],
  endedAt: string | null,
): CollectiveStats {
  const home = emptyCollectiveStatsSide();
  const away = emptyCollectiveStatsSide();

  for (const row of rows) {
    if (row.team_side !== "home" && row.team_side !== "away") continue;
    if (!isCollectiveKey(row.stat_key)) continue;
    const bucket = row.team_side === "home" ? home : away;
    bucket[row.stat_key] = (bucket[row.stat_key] ?? 0) + 1;
  }

  const possessionRows = rows
    .filter((r) => r.stat_key === "possession")
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let possessionMsHome = 0;
  let possessionMsAway = 0;
  let possessionMsNeutral = 0;
  let currentPossession: PossessionSide | null = null;
  const closeAt = endedAt ? new Date(endedAt).getTime() : Date.now();

  possessionRows.forEach((row, i) => {
    const side = row.stat_value as PossessionSide;
    currentPossession = side;
    const start = new Date(row.created_at).getTime();
    const end = i + 1 < possessionRows.length ? new Date(possessionRows[i + 1].created_at).getTime() : closeAt;
    const durationMs = Math.max(0, end - start);
    if (side === "home") possessionMsHome += durationMs;
    else if (side === "away") possessionMsAway += durationMs;
    else possessionMsNeutral += durationMs;
  });

  // rows here is every "kind: stat" row for the session — computeGkStats
  // gets the same unfiltered set, so this has to filter down to collective-
  // only stat_keys itself, or a GK tap would falsely flag this tab (and any
  // future stat category would too) as having new activity.
  const lastStatAt = rows
    .filter((r) => r.stat_key === "possession" || isCollectiveKey(r.stat_key))
    .reduce<string | null>((latest, r) => {
      if (!latest) return r.created_at;
      return new Date(r.created_at).getTime() > new Date(latest).getTime() ? r.created_at : latest;
    }, null);

  return { home, away, possessionMsHome, possessionMsAway, possessionMsNeutral, currentPossession, lastStatAt };
}

// Modo GK — same "kind: stat" rows, but scoped to whichever player is
// currently marked as each team's goalkeeper (stat_key: "gk_selection",
// player_name carries who) rather than the whole team. Switching the
// selected keeper doesn't lose the old one's tally — it's still in the
// rows, just not what's being summed until they're picked again.
//
// The actions (and their groups) are configurable too — counting takes
// every "gk_" key; the built-in keys below are the default set.
export const GK_COUNTER_KEYS = DEFAULT_LIVE_STAT_CONFIG.gkGroups.flatMap((g) => g.fields.map((f) => f.key));
export type GkCounterKey = string;

// Counts per action key; missing = 0 (read with statOf).
export type GkStatsSide = Record<string, number>;

// Each goalkeeper action is recorded as completed or not (stored in the
// row's stat_value). Rows from before this split have no value and count
// as completed — that's what a plain tap meant then.
export const GK_OUTCOMES = ["complete", "incomplete"] as const;
export type GkOutcome = (typeof GK_OUTCOMES)[number];

export function gkOutcomeOf(statValue: string | null | undefined): GkOutcome {
  return statValue === "incomplete" ? "incomplete" : "complete";
}

// % of an action's attempts that were completed, or null with none yet.
export function gkEfficiency(complete: number, incomplete: number): number | null {
  const total = complete + incomplete;
  return total > 0 ? Math.round((complete / total) * 100) : null;
}

export interface GkStatsByPlayer {
  name: string;
  // Linked squad player, when the taps carried one.
  playerId: number | null;
  // Completed actions.
  stats: GkStatsSide;
  incomplete: GkStatsSide;
}

export interface GkStats {
  // Completed actions per side…
  home: GkStatsSide;
  away: GkStatsSide;
  // …and the ones that weren't.
  homeIncomplete: GkStatsSide;
  awayIncomplete: GkStatsSide;
  homeGkName: string | null;
  awayGkName: string | null;
  // Every goalkeeper credited with at least one stat this match, oldest
  // first — home/away above only reflect whoever ended the match in goal,
  // so a mid-match keeper change (sub, red card) would otherwise silently
  // fold an earlier keeper's tally into the wrong name. The post-match
  // recap uses this to show each keeper who actually played separately.
  homeByPlayer: GkStatsByPlayer[];
  awayByPlayer: GkStatsByPlayer[];
  lastStatAt: string | null;
}

export function emptyGkStatsSide(): GkStatsSide {
  return {};
}

// Groups every stat row by whichever goalkeeper was selected at the moment
// each one was tapped (stamped on the row at insert time — see
// addGkStatByToken), independent of who's selected now. Order of first
// appearance, oldest first.
function gkStatsByPlayer(
  rows: {
    stat_key: string | null;
    stat_value?: string | null;
    player_id?: number | null;
    team_side: string | null;
    player_name: string | null;
    created_at: string;
  }[],
  side: "home" | "away",
): GkStatsByPlayer[] {
  const order: string[] = [];
  const totals = new Map<string, { complete: GkStatsSide; incomplete: GkStatsSide; playerId: number | null }>();

  const sorted = rows
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  for (const row of sorted) {
    if (row.team_side !== side || !row.player_name || !isGkKey(row.stat_key)) {
      continue;
    }
    if (!totals.has(row.player_name)) {
      totals.set(row.player_name, {
        complete: emptyGkStatsSide(),
        incomplete: emptyGkStatsSide(),
        playerId: row.player_id ?? null,
      });
      order.push(row.player_name);
    }
    const entry = totals.get(row.player_name)!;
    const bucket = entry[gkOutcomeOf(row.stat_value)];
    bucket[row.stat_key] = (bucket[row.stat_key] ?? 0) + 1;
    if (entry.playerId == null && row.player_id != null) entry.playerId = row.player_id;
  }

  return order.map((name) => ({
    name,
    playerId: totals.get(name)!.playerId,
    stats: totals.get(name)!.complete,
    incomplete: totals.get(name)!.incomplete,
  }));
}

export function computeGkStats(
  rows: {
    stat_key: string | null;
    stat_value?: string | null;
    player_id?: number | null;
    team_side: string | null;
    player_name: string | null;
    created_at: string;
  }[],
): GkStats {
  const selectionRows = rows
    .filter((r) => r.stat_key === "gk_selection")
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let homeGkName: string | null = null;
  let awayGkName: string | null = null;
  for (const row of selectionRows) {
    if (row.team_side === "home") homeGkName = row.player_name;
    else if (row.team_side === "away") awayGkName = row.player_name;
  }

  const home = emptyGkStatsSide();
  const away = emptyGkStatsSide();
  const homeIncomplete = emptyGkStatsSide();
  const awayIncomplete = emptyGkStatsSide();
  for (const row of rows) {
    if (!isGkKey(row.stat_key)) continue;
    const key = row.stat_key;
    const incomplete = gkOutcomeOf(row.stat_value) === "incomplete";
    const bump = (side: GkStatsSide) => (side[key] = (side[key] ?? 0) + 1);
    if (row.team_side === "home" && row.player_name && row.player_name === homeGkName) {
      bump(incomplete ? homeIncomplete : home);
    } else if (row.team_side === "away" && row.player_name && row.player_name === awayGkName) {
      bump(incomplete ? awayIncomplete : away);
    }
  }

  const lastStatAt = rows
    .filter((r) => r.stat_key === "gk_selection" || isGkKey(r.stat_key))
    .reduce<string | null>((latest, r) => {
      if (!latest) return r.created_at;
      return new Date(r.created_at).getTime() > new Date(latest).getTime() ? r.created_at : latest;
    }, null);

  return {
    home,
    away,
    homeIncomplete,
    awayIncomplete,
    homeGkName,
    awayGkName,
    homeByPlayer: gkStatsByPlayer(rows, "home"),
    awayByPlayer: gkStatsByPlayer(rows, "away"),
    lastStatAt,
  };
}

export interface LiveMatchInfo {
  sessionId: string;
  // The fixture_preparations key this session belongs to — a numeric
  // API-Football fixture id for a real match, or an opaque manual-prep key.
  // Only the former has "Externa" (API-Football) stats to show in the recap.
  preparationKey: string;
  homeName: string;
  awayName: string;
  homeLogo: string;
  awayLogo: string;
  // Which side (home/away) is the coach's own club — Modo GK only tracks
  // our own goalkeeper, so it needs to know which lineup that is.
  ourSide: "home" | "away";
  startedAt: string | null;
  halftimeAt: string | null;
  secondHalfAt: string | null;
  endedAt: string | null;
  // The pre-game config — wizard-owned, editable only until kickoff, frozen
  // forever after (the permanent Ficha de Jogo/Formação Tática record).
  homeLineup: TeamLineup;
  awayLineup: TeamLineup;
  // The live working copy Modo Jogo actually drags/subs/dismisses players
  // in, from kickoff onward — kept separate so match-time changes never
  // touch the record above. Before the first kickoff this mirrors homeLineup
  // /awayLineup (nothing has diverged yet).
  homeLineupLive: TeamLineup;
  awayLineupLive: TeamLineup;
  benchNotes: string | null;
}

// Shape of a raw `live_match_entries` row as returned by Supabase — used by
// both the authenticated and guest/token actions to avoid two copies of the
// same mapping.
export function mapLiveEntryRow(row: {
  id: string;
  player_id?: number | null;
  event_type: string | null;
  team_side: string | null;
  minute: number | null;
  extra_minute: number | null;
  player_name: string | null;
  notes: string | null;
  created_at: string;
  created_by_label: string | null;
}): LiveEntryRow {
  return {
    id: row.id,
    playerId: row.player_id ?? null,
    eventType: row.event_type as LiveEventType | null,
    teamSide: row.team_side as "home" | "away" | null,
    minute: row.minute,
    extraMinute: row.extra_minute,
    playerName: row.player_name,
    notes: row.notes,
    createdAt: row.created_at,
    authorLabel: row.created_by_label,
  };
}

// The final score is never tracked as its own field — it's just a tally of
// "goal" events per side, same source the live feed already renders from.
export function countGoals(entries: LiveEntryRow[], side: "home" | "away"): number {
  return entries.filter((e) => e.eventType === "goal" && e.teamSide === side).length;
}

// Icons for events already logged, keyed by player name — covers both the
// pitch and the substitutes list, and a player subbed off keeps whatever
// they logged while still on. Shared by the live formation pitch and the
// post-match recap (same events, same rendering).
export function eventIconsByName(entries: LiveEntryRow[], side: "home" | "away"): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const entry of entries) {
    if (entry.teamSide !== side || !entry.eventType || !entry.playerName) continue;
    (map[entry.playerName] ??= []).push(LIVE_EVENT_ICON[entry.eventType]);
  }
  return map;
}
