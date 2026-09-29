import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_STAT_CONFIG,
  activeGkGroups,
  displayCollectiveFields,
  displayGkGroups,
  effectiveSessionConfig,
  isCollectiveKey,
  isGkKey,
  newFieldKey,
  parseLiveStatConfig,
  type LiveStatConfig,
} from "./liveStatConfig";
import { computeCollectiveStats, computeGkStats, statOf } from "./liveStatsShared";

const custom: LiveStatConfig = {
  collective: [
    { key: "tackle", label: "Desarmes ganhos", active: true },
    { key: "offensive_transition", label: null, active: false },
    { key: "c_aerial", label: "Duelos aéreos", active: true },
  ],
  gkGroups: [
    { id: "grp_a", label: "Mãos", fields: [{ key: "gk_c_catch", label: "Agarrar", active: true }] },
    { id: "grp_empty", label: "Vazio", fields: [{ key: "gk_jogo_pes", label: null, active: false }] },
  ],
};

describe("key families", () => {
  it("tells goalkeeper keys from collective ones", () => {
    expect(isGkKey("gk_c_catch")).toBe(true);
    expect(isGkKey("gk_selection")).toBe(false);
    expect(isCollectiveKey("c_aerial")).toBe(true);
    expect(isCollectiveKey("possession")).toBe(false);
    expect(isGkKey(newFieldKey("gk"))).toBe(true);
    expect(isCollectiveKey(newFieldKey("collective"))).toBe(true);
  });
});

describe("effectiveSessionConfig", () => {
  it("uses the club's current config before kickoff", () => {
    expect(effectiveSessionConfig({ started_at: null, stat_config: null }, custom)).toBe(custom);
  });
  it("keeps the frozen config once the game kicked off", () => {
    const cfg = effectiveSessionConfig({ started_at: "2026-09-01", stat_config: custom }, DEFAULT_LIVE_STAT_CONFIG);
    expect(cfg.collective.map((f) => f.key)).toEqual(["tackle", "offensive_transition", "c_aerial"]);
  });
  it("shows games from before configs with the built-in default", () => {
    expect(effectiveSessionConfig({ started_at: "2026-09-01", stat_config: null }, custom)).toBe(DEFAULT_LIVE_STAT_CONFIG);
  });
});

describe("parseLiveStatConfig", () => {
  it("drops keys of the wrong family and malformed input", () => {
    const parsed = parseLiveStatConfig({
      collective: [{ key: "gk_x" }, { key: "ok_field", label: "  Ok  " }],
      gkGroups: [{ id: "g", fields: [{ key: "tackle" }, { key: "gk_y", active: false }] }],
    });
    expect(parsed?.collective).toEqual([{ key: "ok_field", label: "Ok", active: true }]);
    expect(parsed?.gkGroups[0].fields).toEqual([{ key: "gk_y", label: null, active: false }]);
    expect(parseLiveStatConfig("nope")).toBeNull();
  });
});

describe("display across games", () => {
  it("lists the club's active fields, then older ones the games used", () => {
    const fields = displayCollectiveFields(custom, [DEFAULT_LIVE_STAT_CONFIG]);
    expect(fields.slice(0, 2).map((f) => f.key)).toEqual(["tackle", "c_aerial"]);
    // Switched off now but used by an older game → still shown, after.
    expect(fields.map((f) => f.key)).toContain("offensive_transition");
    expect(fields.find((f) => f.key === "tackle")?.label).toBe("Desarmes ganhos");
  });
  it("hides empty goalkeeper groups and keeps older actions visible", () => {
    expect(activeGkGroups(custom).map((g) => g.id)).toEqual(["grp_a"]);
    const groups = displayGkGroups(custom, [DEFAULT_LIVE_STAT_CONFIG]);
    expect(groups[0].id).toBe("grp_a");
    expect(groups.flatMap((g) => g.fields).map((f) => f.key)).toContain("gk_reposicao");
  });
});

describe("counting is config-agnostic", () => {
  it("counts any collective or goalkeeper key", () => {
    const t = (m: number) => `2026-09-01T10:${String(m).padStart(2, "0")}:00Z`;
    const rows = [
      { stat_key: "c_aerial", stat_value: null, team_side: "home", created_at: t(1), player_name: null },
      { stat_key: "c_aerial", stat_value: null, team_side: "home", created_at: t(2), player_name: null },
      { stat_key: "gk_selection", stat_value: null, team_side: "home", created_at: t(0), player_name: "Keeper" },
      { stat_key: "gk_c_catch", stat_value: "incomplete", team_side: "home", created_at: t(3), player_name: "Keeper" },
    ];
    const collective = computeCollectiveStats(rows, t(10));
    expect(statOf(collective.home, "c_aerial")).toBe(2);
    expect(statOf(collective.home, "gk_c_catch")).toBe(0);
    const gk = computeGkStats(rows);
    expect(statOf(gk.homeIncomplete, "gk_c_catch")).toBe(1);
  });
});
