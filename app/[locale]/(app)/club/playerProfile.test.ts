import { describe, expect, it } from "vitest";
import { pickPositionsToCopy, type PlayerProfile, type StoredPositions } from "./playerProfile";

const stored = (stintId: string, playerId: number): StoredPositions => ({
  stintId,
  playerId,
  primaryPosition: "left_back",
  secondaryPosition: null,
});
const withPosition: PlayerProfile = { primaryPosition: "striker", secondaryPosition: null, preferredFoot: null };
const footOnly: PlayerProfile = { primaryPosition: null, secondaryPosition: null, preferredFoot: "left" };

describe("pickPositionsToCopy", () => {
  it("takes the most recent earlier spell that has positions", () => {
    const rows = pickPositionsToCopy(["recent", "old"], [stored("old", 1), stored("recent", 2)], {});
    expect(rows.map((r) => [r.stintId, r.playerId])).toEqual([["recent", 2]]);
  });

  it("falls back to an older spell when the most recent one has none", () => {
    const rows = pickPositionsToCopy(["recent", "old"], [stored("old", 1)], {});
    expect(rows.map((r) => r.playerId)).toEqual([1]);
  });

  it("never offers a player who already has a main position", () => {
    const rows = pickPositionsToCopy(["prev"], [stored("prev", 1), stored("prev", 2)], { 1: withPosition });
    expect(rows.map((r) => r.playerId)).toEqual([2]);
  });

  it("still offers a player who only has a foot set", () => {
    const rows = pickPositionsToCopy(["prev"], [stored("prev", 1)], { 1: footOnly });
    expect(rows.map((r) => r.playerId)).toEqual([1]);
  });

  it("offers nothing when every earlier position is already covered", () => {
    expect(pickPositionsToCopy(["prev"], [stored("prev", 1)], { 1: withPosition })).toEqual([]);
    expect(pickPositionsToCopy([], [], {})).toEqual([]);
  });
});
