import { describe, expect, it } from "vitest";
import { lineupFromSquad, type LiveSquadPlayer } from "./liveStatsShared";

let id = 0;
const make = (position: string, count: number): LiveSquadPlayer[] =>
  Array.from({ length: count }, () => {
    id += 1;
    return { id, name: `${position} ${id}`, number: id, photo: null, position };
  });

describe("lineupFromSquad", () => {
  it("starts a 1-4-3-3 from a squad listed goalkeepers first", () => {
    const squad = [...make("Goalkeeper", 3), ...make("Defender", 10), ...make("Midfielder", 11), ...make("Attacker", 8)];
    const lineup = lineupFromSquad(squad);
    const starters = lineup.filter((p) => p.starting);
    const positionOf = (playerId: number | null | undefined) => squad.find((s) => s.id === playerId)?.position;
    const count = (position: string) => starters.filter((p) => positionOf(p.playerId) === position).length;

    expect(starters).toHaveLength(11);
    expect([count("Goalkeeper"), count("Defender"), count("Midfielder"), count("Attacker")]).toEqual([1, 4, 3, 3]);
    expect(lineup).toHaveLength(squad.length);
  });

  it("tops up from the other lines when one is short", () => {
    const squad = [...make("Goalkeeper", 2), ...make("Defender", 9), ...make("Attacker", 1)];
    const starters = lineupFromSquad(squad).filter((p) => p.starting);
    const keepers = starters.filter((p) => squad.find((s) => s.id === p.playerId)?.position === "Goalkeeper");

    expect(starters).toHaveLength(11);
    expect(keepers).toHaveLength(1);
  });
});
