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
  notes: string;
}

export interface LiveEntryRow {
  id: string;
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

export interface LineupPlayer {
  number: number | null;
  name: string;
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

// Simple default rows (GK / back / mid / forward) so the formation pitch
// isn't a blank canvas — a generic 4-4-2-ish spread the coach then drags
// into whatever the actual shape is.
const DEFAULT_ROWS: { count: number; y: number }[] = [
  { count: 1, y: 90 },
  { count: 4, y: 68 },
  { count: 4, y: 42 },
  { count: 2, y: 16 },
];

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
  if (secondHalf != null && halftime != null) {
    elapsedMs = halftime - started + ((ended ?? Date.now()) - secondHalf);
  } else if (halftime != null) {
    elapsedMs = halftime - started;
  } else {
    elapsedMs = (ended ?? Date.now()) - started;
  }
  return Math.max(0, Math.floor(elapsedMs / 60000));
}

// Swaps one starting player off for one bench player on, within a team's
// full players array. Matched by name (the only stable identifier a click
// site has) rather than array index/reference, since the array may have
// been refetched by the 4s poll between the two taps that make a sub. The
// incoming player inherits the outgoing player's pitch position.
export function applySubstitution(
  players: LineupPlayer[],
  outPlayerName: string,
  inPlayerName: string,
): LineupPlayer[] {
  const outPlayer = players.find((p) => p.starting && p.name === outPlayerName);
  const pos = outPlayer ? { x: outPlayer.x, y: outPlayer.y } : { x: null, y: null };
  return players.map((p) => {
    if (p.starting && p.name === outPlayerName) return { ...p, starting: false, x: null, y: null };
    if (!p.starting && p.name === inPlayerName) return { ...p, starting: true, x: pos.x, y: pos.y };
    return p;
  });
}

// A red card sends the player off — no one comes on for them, so this is
// applySubstitution's removal half on its own.
export function removeFromField(players: LineupPlayer[], playerName: string): LineupPlayer[] {
  return players.map((p) =>
    p.starting && p.name === playerName ? { ...p, starting: false, x: null, y: null } : p,
  );
}

// Undoes removeFromField — deleting a mistaken red card puts the player back
// on the pitch. x/y stay null: LiveFormationPitch falls back to a default
// formation slot for an unplaced starter, since the old spot wasn't kept.
export function restoreToField(players: LineupPlayer[], playerName: string): LineupPlayer[] {
  return players.map((p) =>
    !p.starting && p.name === playerName ? { ...p, starting: true, x: null, y: null } : p,
  );
}

export interface LiveMatchInfo {
  sessionId: string;
  homeName: string;
  awayName: string;
  homeLogo: string;
  awayLogo: string;
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
