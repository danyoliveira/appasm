import { describe, expect, it } from "vitest";
import { computeGkStats, gkEfficiency } from "./liveStatsShared";

const row = (stat_key: string, stat_value: string | null, created_at: string, player_name = "Trubin") => ({
  stat_key,
  stat_value,
  team_side: "home",
  player_name,
  created_at,
});

describe("computeGkStats complete/incomplete", () => {
  const rows = [
    row("gk_selection", null, "2026-01-01T10:00:00Z"),
    row("gk_reposicao", "complete", "2026-01-01T10:01:00Z"),
    row("gk_reposicao", "incomplete", "2026-01-01T10:02:00Z"),
    // Recorded before the split — counts as completed.
    row("gk_reposicao", null, "2026-01-01T10:03:00Z"),
    row("gk_saida_1x1", "incomplete", "2026-01-01T10:04:00Z"),
  ];

  it("splits completed and incomplete actions for the current keeper", () => {
    const stats = computeGkStats(rows);
    expect(stats.home.gk_reposicao).toBe(2);
    expect(stats.homeIncomplete.gk_reposicao).toBe(1);
    expect(stats.home.gk_saida_1x1).toBe(0);
    expect(stats.homeIncomplete.gk_saida_1x1).toBe(1);
  });

  it("keeps the split per keeper", () => {
    const [entry] = computeGkStats(rows).homeByPlayer;
    expect(entry.name).toBe("Trubin");
    expect(entry.stats.gk_reposicao).toBe(2);
    expect(entry.incomplete.gk_reposicao).toBe(1);
  });
});

describe("gkEfficiency", () => {
  it("is the completed share, rounded", () => {
    expect(gkEfficiency(2, 1)).toBe(67);
  });
  it("is null with no attempts", () => {
    expect(gkEfficiency(0, 0)).toBeNull();
  });
});
