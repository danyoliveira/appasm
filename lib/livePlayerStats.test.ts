import { describe, expect, it } from "vitest";
import { aggregateLivePlayerTotals, computeLivePlayerLines, type LiveEventRow } from "./livePlayerStats";
import type { LineupPlayer } from "@/app/[locale]/live/liveStatsShared";

const player = (playerId: number, name: string, starting: boolean): LineupPlayer => ({
  number: null,
  name,
  playerId,
  starting,
  x: null,
  y: null,
});

const ev = (event_type: string, minute: number, name: string | null, extra: Partial<LiveEventRow> = {}): LiveEventRow => ({
  event_type,
  team_side: "home",
  minute,
  player_id: null,
  player_name: name,
  notes: null,
  ...extra,
});

describe("computeLivePlayerLines", () => {
  const lineup = [player(1, "Trubin", true), player(2, "Pavlidis", true), player(3, "Prestianni", false)];

  it("counts minutes, goals and substitutions", () => {
    const lines = computeLivePlayerLines({
      lineup,
      ourSide: "home",
      events: [
        ev("goal", 20, "Pavlidis"),
        ev("substitution", 60, "Prestianni", { notes: "Sai: Pavlidis" }),
        ev("assist", 75, "Prestianni"),
        ev("goal", 80, null, { team_side: "away" }),
      ],
    });
    expect(lines[2]).toMatchObject({ started: true, minutes: 60, goals: 1 });
    expect(lines[3]).toMatchObject({ started: false, minutes: 30, assists: 1 });
    expect(lines[1]).toMatchObject({ minutes: 90, conceded: 1 });
    expect(lines[2].conceded).toBe(0);
  });

  it("ends a player's minutes at a red card", () => {
    const lines = computeLivePlayerLines({
      lineup,
      ourSide: "home",
      events: [ev("red_card", 35, "Pavlidis")],
    });
    expect(lines[2]).toMatchObject({ minutes: 35, redCards: 1 });
  });
});

describe("aggregateLivePlayerTotals", () => {
  it("sums games, counting appearances and starts", () => {
    const line = { minutes: 90, goals: 1, assists: 0, yellowCards: 0, redCards: 0, conceded: 0 };
    const totals = aggregateLivePlayerTotals([
      { players: { 2: { ...line, started: true } } },
      { players: { 2: { ...line, started: false, minutes: 20 } } },
    ]);
    expect(totals.get(2)).toMatchObject({ appearances: 2, lineups: 1, minutes: 110, goals: 2 });
  });
});
