import { describe, expect, it } from "vitest";
import { findMergeSuggestions, nameSimilarity, type MatchablePlayer } from "./playerMatching";

const p = (id: number, name: string, extra: Partial<MatchablePlayer> = {}): MatchablePlayer => ({
  id,
  name,
  position: "Attacker",
  number: null,
  age: null,
  ...extra,
});

describe("nameSimilarity", () => {
  it("treats accents and case as equal", () => {
    expect(nameSimilarity("João Rêgo", "joao rego")).toBe(1);
  });

  it("matches an initial + surname against the full name", () => {
    expect(nameSimilarity("V. Pavlidis", "Vangelis Pavlidis")).toBeGreaterThanOrEqual(0.9);
  });

  it("tolerates a small typo in the surname", () => {
    expect(nameSimilarity("V. Pavlidys", "Vangelis Pavlidis")).toBeGreaterThanOrEqual(0.8);
  });

  it("scores different people low", () => {
    expect(nameSimilarity("Nicolás Otamendi", "Vangelis Pavlidis")).toBeLessThan(0.6);
  });
});

describe("findMergeSuggestions", () => {
  const api = [
    p(100, "Vangelis Pavlidis", { number: 14 }),
    p(101, "Nicolás Otamendi", { position: "Defender", number: 30 }),
  ];

  it("suggests the matching API player", () => {
    const result = findMergeSuggestions([p(-1, "V. Pavlidis", { number: 14 })], api, new Set());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ manualId: -1, apiId: 100 });
  });

  it("skips pairs the coach dismissed", () => {
    const result = findMergeSuggestions([p(-1, "V. Pavlidis")], api, new Set(["-1:100"]));
    expect(result).toEqual([]);
  });

  it("suggests nothing for an unrelated name", () => {
    expect(findMergeSuggestions([p(-2, "Rui Costa")], api, new Set())).toEqual([]);
  });
});
