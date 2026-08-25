import { describe, expect, it } from "vitest";
import { buildFlagResolver } from "./flags";
import type { Country } from "./client";

const countries: Country[] = [
  { name: "Portugal", code: "PT", flag: "https://flags/pt.svg" },
  { name: "South-Korea", code: "KR", flag: "https://flags/kr.svg" },
  { name: "Ivory Coast", code: "CI", flag: "https://flags/ci.svg" },
  { name: "Congo-DR", code: "CD", flag: "https://flags/cd.svg" },
  { name: "Bosnia", code: "BA", flag: "https://flags/ba.svg" },
  { name: "Czech-Republic", code: "CZ", flag: "https://flags/cz.svg" },
  { name: "USA", code: "US", flag: "https://flags/us.svg" },
  { name: "Côte-d'Ivoire", code: null, flag: null },
];

describe("buildFlagResolver", () => {
  it("resolves an exact (case-insensitive) match", () => {
    const resolve = buildFlagResolver(countries);
    expect(resolve("portugal")).toBe("https://flags/pt.svg");
    expect(resolve("Portugal")).toBe("https://flags/pt.svg");
  });

  it("resolves through the nationality aliases", () => {
    const resolve = buildFlagResolver(countries);
    expect(resolve("Korea Republic")).toBe("https://flags/kr.svg");
    expect(resolve("Cote d'Ivoire")).toBe("https://flags/ci.svg");
    expect(resolve("DR Congo")).toBe("https://flags/cd.svg");
    expect(resolve("Bosnia and Herzegovina")).toBe("https://flags/ba.svg");
    expect(resolve("Czechia")).toBe("https://flags/cz.svg");
    expect(resolve("United States")).toBe("https://flags/us.svg");
  });

  it("normalizes diacritics and hyphenation on both sides", () => {
    const resolve = buildFlagResolver(countries);
    expect(resolve("South Korea")).toBe("https://flags/kr.svg");
  });

  it("returns null for a country not in the list", () => {
    const resolve = buildFlagResolver(countries);
    expect(resolve("Narnia")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    const resolve = buildFlagResolver(countries);
    expect(resolve(null)).toBeNull();
    expect(resolve(undefined)).toBeNull();
  });

  it("skips countries with no flag when building the lookup", () => {
    const resolve = buildFlagResolver(countries);
    expect(resolve("Côte d'Ivoire")).toBe("https://flags/ci.svg");
  });
});
