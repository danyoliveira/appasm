import { describe, expect, it } from "vitest";
import { combineTeamStats, resolveSelectedCompetition } from "./teamStats";
import type { TeamLeague, TeamStatistics } from "./client";

function league(id: number): TeamLeague {
  return {
    league: { id, name: `League ${id}`, type: "League", logo: "" },
    country: { name: "Portugal", flag: null },
    seasons: [{ year: 2026, start: "2026-01-01", end: "2026-12-31", current: true }],
  };
}

describe("resolveSelectedCompetition", () => {
  const competitions = [league(1), league(2)];

  it("returns null when the cookie is unset", () => {
    expect(resolveSelectedCompetition(undefined, competitions)).toBeNull();
  });

  it("returns null when the cookie is 'all'", () => {
    expect(resolveSelectedCompetition("all", competitions)).toBeNull();
  });

  it("returns the league id when it's among the given competitions", () => {
    expect(resolveSelectedCompetition("2", competitions)).toBe(2);
  });

  it("falls back to null when the league id isn't registered for this team", () => {
    expect(resolveSelectedCompetition("999", competitions)).toBeNull();
  });

  it("falls back to null for a non-numeric cookie value", () => {
    expect(resolveSelectedCompetition("not-a-number", competitions)).toBeNull();
  });
});

function stats(overrides: Partial<{
  played: number;
  wins: number;
  draws: number;
  loses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
}>): TeamStatistics {
  const { played = 0, wins = 0, draws = 0, loses = 0, goalsFor = 0, goalsAgainst = 0, cleanSheets = 0 } = overrides;
  return {
    fixtures: {
      played: { total: played },
      wins: { total: wins },
      draws: { total: draws },
      loses: { total: loses },
    },
    goals: {
      for: { total: { total: goalsFor }, average: { total: "0" } },
      against: { total: { total: goalsAgainst }, average: { total: "0" } },
    },
    clean_sheet: { total: cleanSheets },
    biggest: { wins: { home: null, away: null }, loses: { home: null, away: null } },
  };
}

describe("combineTeamStats", () => {
  it("returns null for an empty list", () => {
    expect(combineTeamStats([])).toBeNull();
  });

  it("sums fixture counts and goals across competitions", () => {
    const combined = combineTeamStats([
      stats({ played: 10, wins: 6, draws: 2, loses: 2, goalsFor: 20, goalsAgainst: 10, cleanSheets: 4 }),
      stats({ played: 5, wins: 1, draws: 1, loses: 3, goalsFor: 5, goalsAgainst: 9, cleanSheets: 1 }),
    ]);

    expect(combined?.fixtures).toEqual({
      played: { total: 15 },
      wins: { total: 7 },
      draws: { total: 3 },
      loses: { total: 5 },
    });
    expect(combined?.goals.for.total.total).toBe(25);
    expect(combined?.goals.against.total.total).toBe(19);
    expect(combined?.clean_sheet.total).toBe(5);
  });

  it("computes per-game averages from the combined totals", () => {
    const combined = combineTeamStats([stats({ played: 4, goalsFor: 10, goalsAgainst: 2 })]);
    expect(combined?.goals.for.average.total).toBe("2.5");
    expect(combined?.goals.against.average.total).toBe("0.5");
  });

  it("reports zero averages instead of dividing by zero when no games were played", () => {
    const combined = combineTeamStats([stats({ played: 0 })]);
    expect(combined?.goals.for.average.total).toBe("0");
    expect(combined?.goals.against.average.total).toBe("0");
  });

  it("leaves biggest win/loss blank since they can't be meaningfully combined", () => {
    const combined = combineTeamStats([stats({ played: 1 })]);
    expect(combined?.biggest).toEqual({ wins: { home: null, away: null }, loses: { home: null, away: null } });
  });
});
