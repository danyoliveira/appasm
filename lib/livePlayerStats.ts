import type { LineupPlayer } from "@/app/[locale]/live/liveStatsShared";

// What ASM Live Mode recorded for one of our squad players in one game.
export interface LivePlayerLine {
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  // Opponent goals while the player was on the pitch (used for goalkeepers).
  conceded: number;
}

// Same, summed over games.
export interface LivePlayerTotals {
  appearances: number;
  lineups: number;
  minutes: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  conceded: number;
}

export interface LiveEventRow {
  event_type: string | null;
  team_side: string | null;
  minute: number | null;
  player_id: number | null;
  player_name: string | null;
  notes: string | null;
}

const REGULATION_MINUTES = 90;

// Per-player numbers for our side of one game, keyed by squad player id —
// only players the lineup links to the squad count. Minutes: starters from
// 0, substitutes from their entry minute, until they're subbed off or sent
// off, or the end of the game (90', or later if events run past it).
export function computeLivePlayerLines({
  lineup,
  events,
  ourSide,
}: {
  lineup: LineupPlayer[];
  events: LiveEventRow[];
  ourSide: "home" | "away";
}): Record<number, LivePlayerLine> {
  const idByName = new Map(
    lineup.filter((p) => p.playerId != null && p.name.trim()).map((p) => [p.name, p.playerId as number]),
  );
  const idOf = (ev: LiveEventRow) => ev.player_id ?? (ev.player_name ? idByName.get(ev.player_name) : undefined) ?? null;

  const endMinute = Math.max(REGULATION_MINUTES, ...events.map((ev) => ev.minute ?? 0));
  const windows = new Map<number, { from: number; to: number; started: boolean }>();
  for (const p of lineup) {
    if (p.starting && p.playerId != null) windows.set(p.playerId, { from: 0, to: endMinute, started: true });
  }

  const ours = events
    .filter((ev) => ev.team_side === ourSide)
    .slice()
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  for (const ev of ours) {
    const minute = ev.minute ?? endMinute;
    if (ev.event_type === "substitution") {
      const inId = idOf(ev);
      if (inId != null && !windows.has(inId)) windows.set(inId, { from: minute, to: endMinute, started: false });
      // The outgoing player is only in the notes: "<label>: <name>".
      const outName = ev.notes?.includes(": ") ? ev.notes.slice(ev.notes.indexOf(": ") + 2).trim() : null;
      const outId = outName ? idByName.get(outName) : undefined;
      const outWindow = outId != null ? windows.get(outId) : undefined;
      if (outWindow) outWindow.to = Math.min(outWindow.to, minute);
    } else if (ev.event_type === "red_card") {
      const id = idOf(ev);
      const window = id != null ? windows.get(id) : undefined;
      if (window) window.to = Math.min(window.to, minute);
    }
  }

  const lines: Record<number, LivePlayerLine> = {};
  const lineFor = (id: number) =>
    (lines[id] ??= {
      started: windows.get(id)?.started ?? false,
      minutes: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      conceded: 0,
    });

  for (const [id, window] of windows) {
    lineFor(id).minutes = Math.max(0, window.to - window.from);
  }
  for (const ev of ours) {
    const id = idOf(ev);
    if (id == null) continue;
    if (ev.event_type === "goal") lineFor(id).goals += 1;
    else if (ev.event_type === "assist") lineFor(id).assists += 1;
    else if (ev.event_type === "yellow_card") lineFor(id).yellowCards += 1;
    else if (ev.event_type === "red_card") lineFor(id).redCards += 1;
  }
  const theirGoals = events.filter((ev) => ev.team_side !== ourSide && ev.event_type === "goal");
  for (const [id, window] of windows) {
    lineFor(id).conceded = theirGoals.filter((ev) => {
      const m = ev.minute ?? endMinute;
      return m >= window.from && m <= window.to;
    }).length;
  }
  return lines;
}

export function aggregateLivePlayerTotals(
  games: { players: Record<number, LivePlayerLine> }[],
): Map<number, LivePlayerTotals> {
  const totals = new Map<number, LivePlayerTotals>();
  for (const game of games) {
    for (const [idKey, line] of Object.entries(game.players)) {
      const id = Number(idKey);
      const t = totals.get(id) ?? {
        appearances: 0,
        lineups: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        conceded: 0,
      };
      if (line.started || line.minutes > 0) t.appearances += 1;
      if (line.started) t.lineups += 1;
      t.minutes += line.minutes;
      t.goals += line.goals;
      t.assists += line.assists;
      t.yellowCards += line.yellowCards;
      t.redCards += line.redCards;
      t.conceded += line.conceded;
      totals.set(id, t);
    }
  }
  return totals;
}
