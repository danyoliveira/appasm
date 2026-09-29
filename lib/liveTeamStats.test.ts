import { describe, expect, it } from "vitest";
import { computeLiveTeamStats } from "./liveTeamStats";

describe("computeLiveTeamStats", () => {
  it("is empty without games", () => {
    expect(computeLiveTeamStats([])).toEqual({});
  });

  it("totals, home/away splits, clean sheets and biggest results", () => {
    const stats = computeLiveTeamStats([
      { isHome: true, goalsFor: 3, goalsAgainst: 0 },
      { isHome: false, goalsFor: 1, goalsAgainst: 1 },
      { isHome: false, goalsFor: 0, goalsAgainst: 2 },
      { isHome: true, goalsFor: 4, goalsAgainst: 1 },
    ]);
    expect(stats).toMatchObject({
      played: 4,
      wins: 2,
      draws: 1,
      loses: 1,
      goalsFor: 8,
      goalsAgainst: 4,
      cleanSheets: 1,
      playedHome: 2,
      winsHome: 2,
      playedAway: 2,
      losesAway: 1,
      goalsForAway: 1,
      // 3-0 and 4-1 share the margin; more goals scored wins the tie.
      biggestWinGoalsFor: 4,
      biggestWinGoalsAgainst: 1,
      biggestLossGoalsFor: 0,
      biggestLossGoalsAgainst: 2,
    });
    expect(stats.penaltyScored).toBeUndefined();
  });
});
