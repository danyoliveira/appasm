import { describe, expect, it } from "vitest";
import { buildLiveFixtureView, type LiveFixtureEntry } from "./liveFixtureView";
import type { LineupPlayer } from "@/app/[locale]/live/liveStatsShared";
import { DEFAULT_LIVE_STAT_CONFIG } from "@/app/[locale]/live/liveStatConfig";

const p = (name: string, starting: boolean, x: number | null, y: number | null, playerId?: number): LineupPlayer => ({
  number: 1,
  name,
  playerId,
  starting,
  x,
  y,
});

const ev = (event_type: string, team_side: string, minute: number, player_name: string, extra: Partial<LiveFixtureEntry> = {}): LiveFixtureEntry => ({
  kind: "event",
  event_type,
  team_side,
  stat_key: null,
  stat_value: null,
  minute,
  extra_minute: null,
  player_name,
  player_id: null,
  notes: null,
  created_at: `2026-09-01T10:${String(minute).padStart(2, "0")}:00Z`,
  ...extra,
});

describe("buildLiveFixtureView", () => {
  const view = buildLiveFixtureView({
    home: { id: 10, name: "Us", logo: "" },
    away: { id: -1, name: "Them", logo: "" },
    ourSide: "home",
    homeLineup: [
      p("Keeper", true, 50, 90, 1),
      p("Left", true, 20, 68, 2),
      p("Right", true, 80, 68, 3),
      p("Striker", true, 50, 16, 4),
      p("Sub", false, null, null, 5),
    ],
    awayLineup: [p("Opp", true, null, null)],
    entries: [
      ev("goal", "home", 20, "Striker", { player_id: 4 }),
      ev("assist", "home", 20, "Left", { player_id: 2 }),
      ev("substitution", "home", 60, "Sub", { player_id: 5, notes: "Sai: Striker" }),
    ],
    endedAt: null,
    statConfig: DEFAULT_LIVE_STAT_CONFIG,
  });

  it("turns positions into API grid rows (keeper first) and a formation", () => {
    const grid = Object.fromEntries(view.lineups.home.startXI.map((s) => [s.player.name, s.player.grid]));
    expect(grid).toEqual({ Keeper: "1:1", Left: "2:1", Right: "2:2", Striker: "3:1" });
    expect(view.lineups.home.formation).toBe("2-1");
    expect(view.lineups.home.startXI.find((s) => s.player.name === "Keeper")?.player.pos).toBe("G");
  });

  it("pairs goals with assists and maps substitutions API-style", () => {
    const goal = view.events.find((e) => e.type === "Goal")!;
    expect(goal.player).toEqual({ id: 4, name: "Striker" });
    expect(goal.assist).toEqual({ id: 2, name: "Left" });
    const sub = view.events.find((e) => e.type === "subst")!;
    expect(sub.player).toEqual({ id: 4, name: "Striker" });
    expect(sub.assist).toEqual({ id: 5, name: "Sub" });
  });

  it("only links our real squad players", () => {
    expect(view.linkablePlayerIds.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(view.lineups.away.startXI[0].player.id).toBeGreaterThan(1_000_000_000);
  });
});
