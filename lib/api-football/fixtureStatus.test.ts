import { describe, expect, it } from "vitest";
import type { Fixture } from "./client";
import { hasNoRealDate, upcomingFixtures } from "./fixtureStatus";

const NOW = new Date("2026-09-30T12:00:00Z").getTime();

function fixture(id: number, date: string, status: string, goals: [number, number] | null = null): Fixture {
  return {
    fixture: { id, date, venue: { name: null }, status: { short: status } },
    league: { id: 1, name: "League", logo: "" },
    teams: { home: { id: 1, name: "A", logo: "" }, away: { id: 2, name: "B", logo: "" } },
    goals: { home: goals?.[0] ?? null, away: goals?.[1] ?? null },
  };
}

describe("upcomingFixtures", () => {
  it("drops cancelled games and played ones", () => {
    const list = upcomingFixtures(
      [
        fixture(1, "2026-01-14T13:00:00Z", "CANC"),
        fixture(2, "2026-09-20T15:00:00Z", "FT", [2, 1]),
        fixture(3, "2026-10-17T15:00:00Z", "NS"),
      ],
      NOW,
    );
    expect(list.map((f) => f.fixture.id)).toEqual([3]);
  });

  it("puts postponed games after the ones with a date ahead", () => {
    const list = upcomingFixtures(
      [
        fixture(1, "2026-09-24T15:00:00Z", "PST"),
        fixture(2, "2026-10-24T15:00:00Z", "NS"),
        fixture(3, "2026-10-17T15:00:00Z", "NS"),
      ],
      NOW,
    );
    expect(list.map((f) => f.fixture.id)).toEqual([3, 2, 1]);
  });

  it("keeps a game that kicked off a moment ago as the next one", () => {
    const list = upcomingFixtures(
      [fixture(1, "2026-09-30T11:00:00Z", "1H"), fixture(2, "2026-10-05T15:00:00Z", "NS")],
      NOW,
    );
    expect(list.map((f) => f.fixture.id)).toEqual([1, 2]);
  });

  it("works without any status (older cached data)", () => {
    const old: Fixture = { ...fixture(1, "2026-10-05T15:00:00Z", "NS") };
    delete old.fixture.status;
    expect(upcomingFixtures([old], NOW).map((f) => f.fixture.id)).toEqual([1]);
  });
});

describe("hasNoRealDate", () => {
  it("flags postponed games and ones long past kick-off without a result", () => {
    expect(hasNoRealDate(fixture(1, "2026-09-24T15:00:00Z", "PST"), NOW)).toBe(true);
    expect(hasNoRealDate(fixture(2, "2026-09-01T15:00:00Z", "NS"), NOW)).toBe(true);
    expect(hasNoRealDate(fixture(3, "2026-10-17T15:00:00Z", "NS"), NOW)).toBe(false);
    expect(hasNoRealDate(fixture(4, "2026-09-01T15:00:00Z", "FT", [1, 0]), NOW)).toBe(false);
  });
});
