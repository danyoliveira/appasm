import type { FixtureEvent, FixtureLineup, FixtureTeamStatistics } from "@/lib/api-football/client";
import { activeCollectiveFields, type LiveStatConfig } from "@/app/[locale]/live/liveStatConfig";
import {
  computeCollectiveStats,
  defaultFormationPosition,
  type LineupPlayer,
} from "@/app/[locale]/live/liveStatsShared";

// Turns an ASM Live Mode game into the same shapes API-Football gives a
// fixture (lineups, events, statistics), so a manual game's match page can
// reuse the API match page's pitch, substitutes list and stat bars as-is.

export interface LiveFixtureTeam {
  // <= 0 for a club outside API-Football (no page to link to).
  id: number;
  name: string;
  logo: string;
}

export interface LiveFixtureEntry {
  kind: string;
  event_type: string | null;
  team_side: string | null;
  stat_key: string | null;
  stat_value: string | null;
  minute: number | null;
  extra_minute: number | null;
  player_name: string | null;
  player_id: number | null;
  notes: string | null;
  created_at: string;
}

export interface LiveFixtureView {
  lineups: { home: FixtureLineup; away: FixtureLineup };
  events: FixtureEvent[];
  statistics: { home: FixtureTeamStatistics; away: FixtureTeamStatistics };
  // Squad players with a page of their own — everyone else (opponents,
  // names typed by hand) gets a stand-in id that isn't linked.
  linkablePlayerIds: number[];
}

// Stand-in ids for players without a real one — far away from both
// API-Football ids and our negative hand-added ids.
const SYNTHETIC_ID_BASE = 1_900_000_000;

// Live Mode stores free x/y positions (0–100, own goal at the bottom);
// API-Football lineups use "row:col" grid strings (row 1 = goalkeeper).
// Players are grouped into rows by how far up the pitch they stand.
function toGrid(starters: { id: number; x: number; y: number }[]): Map<number, string> {
  const grid = new Map<number, string>();
  const byDepth = [...starters].sort((a, b) => b.y - a.y);
  const rows: (typeof starters)[] = [];
  for (const p of byDepth) {
    const current = rows[rows.length - 1];
    if (current && Math.abs(current[0].y - p.y) < 9) current.push(p);
    else rows.push([p]);
  }
  rows.forEach((row, r) => {
    [...row].sort((a, b) => a.x - b.x).forEach((p, c) => grid.set(p.id, `${r + 1}:${c + 1}`));
  });
  return grid;
}

function formationOf(grid: Map<number, string>): string {
  const counts = new Map<number, number>();
  for (const cell of grid.values()) {
    const row = Number(cell.split(":")[0]);
    if (row > 1) counts.set(row, (counts.get(row) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, n]) => n)
    .join("-");
}

export function buildLiveFixtureView({
  home,
  away,
  ourSide,
  homeLineup,
  awayLineup,
  entries,
  endedAt,
  statConfig,
}: {
  home: LiveFixtureTeam;
  away: LiveFixtureTeam;
  ourSide: "home" | "away";
  // Pre-kickoff lineups — the starting XI and bench as they began.
  homeLineup: LineupPlayer[];
  awayLineup: LineupPlayer[];
  entries: LiveFixtureEntry[];
  endedAt: string | null;
  // The fields this game was played with — one stat row per counter.
  statConfig: LiveStatConfig;
}): LiveFixtureView {
  let nextSynthetic = SYNTHETIC_ID_BASE;
  const linkable = new Set<number>();
  const idsBySide = { home: new Map<string, number>(), away: new Map<string, number>() };

  const idFor = (side: "home" | "away", name: string, playerId?: number | null): number => {
    const known = idsBySide[side].get(name);
    if (known != null) return known;
    const id = side === ourSide && playerId != null ? playerId : nextSynthetic++;
    if (side === ourSide && playerId != null) linkable.add(id);
    idsBySide[side].set(name, id);
    return id;
  };

  const toLineup = (side: "home" | "away", team: LiveFixtureTeam, players: LineupPlayer[]): FixtureLineup => {
    const named = players.filter((p) => p.name.trim());
    const starters = named.filter((p) => p.starting);
    const positioned = starters.map((p, i) => {
      const pos = p.x != null && p.y != null ? { x: p.x, y: p.y } : defaultFormationPosition(i);
      return { id: idFor(side, p.name, p.playerId), x: pos.x, y: pos.y };
    });
    const grid = toGrid(positioned);
    const gkId = positioned.length ? [...positioned].sort((a, b) => b.y - a.y)[0].id : null;
    const toApiPlayer = (p: LineupPlayer, withGrid: boolean) => {
      const id = idFor(side, p.name, p.playerId);
      return {
        player: {
          id,
          name: p.name,
          number: p.number ?? 0,
          pos: id === gkId && withGrid ? "G" : null,
          grid: withGrid ? (grid.get(id) ?? null) : null,
        },
      };
    };
    return {
      team,
      coach: { id: 0, name: "", photo: null },
      formation: formationOf(grid),
      startXI: starters.map((p) => toApiPlayer(p, true)),
      substitutes: named.filter((p) => !p.starting).map((p) => toApiPlayer(p, false)),
    };
  };

  const lineups = {
    home: toLineup("home", home, homeLineup),
    away: toLineup("away", away, awayLineup),
  };
  const teamOf = (side: string | null) => (side === "away" ? away : home);
  const sideOf = (side: string | null): "home" | "away" => (side === "away" ? "away" : "home");

  const eventRows = entries
    .filter((e) => e.kind === "event")
    .slice()
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || a.created_at.localeCompare(b.created_at));
  const assists = eventRows.filter((e) => e.event_type === "assist");
  const usedAssists = new Set<LiveFixtureEntry>();

  const person = (e: LiveFixtureEntry, name: string | null) =>
    name ? { id: idFor(sideOf(e.team_side), name, name === e.player_name ? e.player_id : null), name } : { id: null, name: null };

  const events: FixtureEvent[] = [];
  for (const e of eventRows) {
    const time = { elapsed: e.minute ?? 0, extra: e.extra_minute };
    const team = teamOf(e.team_side);
    if (e.event_type === "goal") {
      const assist = assists.find(
        (a) => !usedAssists.has(a) && a.team_side === e.team_side && a.minute === e.minute,
      );
      if (assist) usedAssists.add(assist);
      events.push({
        time,
        team,
        player: person(e, e.player_name),
        assist: assist ? person(assist, assist.player_name) : { id: null, name: null },
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      });
    } else if (e.event_type === "yellow_card" || e.event_type === "red_card") {
      events.push({
        time,
        team,
        player: person(e, e.player_name),
        assist: { id: null, name: null },
        type: "Card",
        detail: e.event_type === "red_card" ? "Red Card" : "Yellow Card",
        comments: null,
      });
    } else if (e.event_type === "substitution") {
      // API-Football convention: player = who went off, assist = who came on.
      const outName = e.notes?.includes(": ") ? e.notes.slice(e.notes.indexOf(": ") + 2).trim() : null;
      events.push({
        time,
        team,
        player: outName ? { id: idFor(sideOf(e.team_side), outName), name: outName } : { id: null, name: null },
        assist: person(e, e.player_name),
        type: "subst",
        detail: "Substitution",
        comments: null,
      });
    }
  }

  const collective = computeCollectiveStats(
    entries.filter((e) => e.kind === "stat"),
    endedAt,
  );
  const possessionTotal = collective.possessionMsHome + collective.possessionMsAway;
  const cards = (side: "home" | "away", type: string) =>
    eventRows.filter((e) => e.team_side === side && e.event_type === type).length;
  const statsFor = (side: "home" | "away", team: LiveFixtureTeam): FixtureTeamStatistics => ({
    team,
    statistics: [
      ...(possessionTotal > 0
        ? [
            {
              type: "Ball Possession",
              value: `${Math.round(((side === "home" ? collective.possessionMsHome : collective.possessionMsAway) / possessionTotal) * 100)}%`,
            },
          ]
        : []),
      ...activeCollectiveFields(statConfig).map((f) => ({ type: `live_${f.key}`, value: collective[side][f.key] ?? 0 })),
      { type: "Yellow Cards", value: cards(side, "yellow_card") },
      { type: "Red Cards", value: cards(side, "red_card") },
    ],
  });

  return {
    lineups,
    events,
    statistics: { home: statsFor("home", home), away: statsFor("away", away) },
    linkablePlayerIds: [...linkable],
  };
}
