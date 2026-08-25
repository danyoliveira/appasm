import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFixturePlayers, getFixtureLineups, getFixtureEvents } from "./cache";
import { getFixtureAppearances } from "./verifyParticipation";
import type { FixtureEvent, FixtureLineup, FixturePlayersResponse } from "./client";

vi.mock("./cache", () => ({
  getFixturePlayers: vi.fn(),
  getFixtureLineups: vi.fn(),
  getFixtureEvents: vi.fn(),
}));

const mockedGetFixturePlayers = vi.mocked(getFixturePlayers);
const mockedGetFixtureLineups = vi.mocked(getFixtureLineups);
const mockedGetFixtureEvents = vi.mocked(getFixtureEvents);

beforeEach(() => {
  mockedGetFixturePlayers.mockReset();
  mockedGetFixtureLineups.mockReset();
  mockedGetFixtureEvents.mockReset();
});

describe("getFixtureAppearances", () => {
  it("combines /fixtures/players with lineups+events for players the stats endpoint is missing", async () => {
    // Team 1 (us) fields lineup-only players 10 (subbed off at 60') and 11
    // (came on at 60') — neither appears in /fixtures/players, mirroring the
    // real-world gap this function exists to paper over. Team 2's player 20
    // is fully covered by /fixtures/players.
    const lineups: FixtureLineup[] = [
      {
        team: { id: 1, name: "Us", logo: "" },
        coach: { id: 1, name: "Coach", photo: null },
        formation: "4-4-2",
        startXI: [{ player: { id: 10, name: "P10", number: 10, pos: "MF", grid: null } }],
        substitutes: [
          { player: { id: 11, name: "P11", number: 11, pos: "MF", grid: null } },
          { player: { id: 12, name: "P12 (unused sub)", number: 12, pos: "MF", grid: null } },
        ],
      },
      {
        team: { id: 2, name: "Them", logo: "" },
        coach: { id: 2, name: "Coach 2", photo: null },
        formation: "4-4-2",
        startXI: [{ player: { id: 20, name: "P20", number: 9, pos: "FW", grid: null } }],
        substitutes: [],
      },
    ];

    const events: FixtureEvent[] = [
      {
        time: { elapsed: 50, extra: null },
        team: { id: 2, name: "Them", logo: "" },
        player: { id: 20, name: "P20" },
        assist: { id: null, name: null },
        type: "Goal",
        detail: "Missed Penalty",
        comments: null,
      },
      {
        time: { elapsed: 60, extra: null },
        team: { id: 1, name: "Us", logo: "" },
        player: { id: 10, name: "P10" },
        assist: { id: 11, name: "P11" },
        type: "subst",
        detail: "Substitution",
        comments: null,
      },
      {
        time: { elapsed: 70, extra: null },
        team: { id: 2, name: "Them", logo: "" },
        player: { id: 20, name: "P20" },
        assist: { id: null, name: null },
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      },
      {
        time: { elapsed: 80, extra: null },
        team: { id: 2, name: "Them", logo: "" },
        player: { id: 20, name: "P20" },
        assist: { id: null, name: null },
        type: "Card",
        detail: "Yellow Card",
        comments: null,
      },
    ];

    const playersData: FixturePlayersResponse[] = [
      {
        team: { id: 2 },
        players: [
          {
            player: { id: 20, name: "P20", photo: "" },
            statistics: [
              {
                games: { minutes: 90, number: 9, position: "FW", rating: "7.5", substitute: false },
                goals: { total: 1, assists: 0, saves: 0 },
                cards: { yellow: 1, red: 0 },
              },
            ],
          },
        ],
      },
    ];

    mockedGetFixturePlayers.mockResolvedValue(playersData);
    mockedGetFixtureLineups.mockResolvedValue(lineups);
    mockedGetFixtureEvents.mockResolvedValue(events);

    const result = await getFixtureAppearances(123);

    expect(result.size).toBe(3);

    // Straight from /fixtures/players — untouched by the fallback logic,
    // including the goal tally (the fallback path would have excluded the
    // missed penalty, but this path trusts the endpoint's own total as-is).
    expect(result.get(20)).toEqual({
      minutes: 90,
      goals: 1,
      assists: 0,
      saves: 0,
      conceded: 0,
      yellow: 1,
      red: 0,
      rating: "7.5",
      started: true,
    });

    // Starter subbed off at 60' — window closes at the sub, so the 70'
    // concession doesn't count against them.
    expect(result.get(10)).toEqual({
      minutes: 60,
      goals: 0,
      assists: 0,
      saves: 0,
      conceded: 0,
      yellow: 0,
      red: 0,
      rating: null,
      started: true,
    });

    // Came on at 60' — on pitch for the 70' goal against, so it counts.
    expect(result.get(11)).toEqual({
      minutes: 30,
      goals: 0,
      assists: 0,
      saves: 0,
      conceded: 1,
      yellow: 0,
      red: 0,
      rating: null,
      started: false,
    });

    // Unused substitute (no "subst" event naming them) never appears.
    expect(result.has(12)).toBe(false);
  });

  it("counts goals/assists/cards from events, treating a second yellow as a red rather than double-counting", async () => {
    const lineups: FixtureLineup[] = [
      {
        team: { id: 1, name: "Us", logo: "" },
        coach: { id: 1, name: "Coach", photo: null },
        formation: "4-4-2",
        startXI: [
          { player: { id: 30, name: "P30", number: 7, pos: "FW", grid: null } },
          { player: { id: 31, name: "P31", number: 8, pos: "MF", grid: null } },
        ],
        substitutes: [],
      },
    ];

    const events: FixtureEvent[] = [
      {
        time: { elapsed: 10, extra: null },
        team: { id: 1, name: "Us", logo: "" },
        player: { id: 30, name: "P30" },
        assist: { id: null, name: null },
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      },
      {
        time: { elapsed: 40, extra: null },
        team: { id: 1, name: "Us", logo: "" },
        player: { id: 31, name: "P31" },
        assist: { id: 30, name: "P30" },
        type: "Goal",
        detail: "Normal Goal",
        comments: null,
      },
      {
        time: { elapsed: 20, extra: null },
        team: { id: 1, name: "Us", logo: "" },
        player: { id: 30, name: "P30" },
        assist: { id: null, name: null },
        type: "Card",
        detail: "Yellow Card",
        comments: null,
      },
      {
        time: { elapsed: 85, extra: null },
        team: { id: 1, name: "Us", logo: "" },
        player: { id: 30, name: "P30" },
        assist: { id: null, name: null },
        type: "Card",
        detail: "Second Yellow card",
        comments: null,
      },
    ];

    mockedGetFixturePlayers.mockResolvedValue([]);
    mockedGetFixtureLineups.mockResolvedValue(lineups);
    mockedGetFixtureEvents.mockResolvedValue(events);

    const result = await getFixtureAppearances(456);

    const p30 = result.get(30);
    expect(p30?.goals).toBe(1);
    expect(p30?.assists).toBe(1);
    expect(p30?.yellow).toBe(1);
    expect(p30?.red).toBe(1);
  });
});
