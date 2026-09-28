import type { Country } from "./client";

// API-Football's /countries list and the `nationality` field on player
// profiles don't share a naming convention: /countries always hyphenates
// multi-word names ("Costa-Rica", "New-Zealand"), which normalizing away
// punctuation handles generically — but a few names diverge in wording
// entirely (nationality "Korea Republic" vs country "South-Korea"), which
// need an explicit alias.
const NATIONALITY_ALIASES: Record<string, string> = {
  "korea republic": "south korea",
  "cote d ivoire": "ivory coast",
  "dr congo": "congo dr",
  "congo dr": "congo dr",
  "bosnia and herzegovina": "bosnia",
  czechia: "czech republic",
  "united states": "usa",
};

const DIACRITICS_PATTERN = /[̀-ͯ]/g;

function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "") // strip accents (Côte -> Cote)
    .toLowerCase()
    .replace(/[-'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Builds a lookup once per squad/list instead of re-normalizing the country
// list for every player.
export function buildFlagResolver(countries: Pick<Country, "name" | "flag">[]) {
  const flagByNormalizedName = new Map<string, string>();
  for (const country of countries) {
    if (country.flag) flagByNormalizedName.set(normalize(country.name), country.flag);
  }
  return function resolveFlagUrl(nationality: string | null | undefined): string | null {
    if (!nationality) return null;
    const normalized = normalize(nationality);
    const aliasTarget = NATIONALITY_ALIASES[normalized];
    return flagByNormalizedName.get(aliasTarget ?? normalized) ?? null;
  };
}

// The /countries entry a nationality string refers to (e.g. a profile's
// "Korea Republic" → "South-Korea"), or null.
export function findCountryForNationality<C extends Pick<Country, "name">>(
  countries: C[],
  nationality: string | null | undefined,
): C | null {
  if (!nationality) return null;
  const normalized = normalize(nationality);
  const target = NATIONALITY_ALIASES[normalized] ?? normalized;
  return countries.find((c) => normalize(c.name) === target) ?? null;
}

// "Costa-Rica" → "Costa Rica" for display.
export function countryDisplayName(name: string) {
  return name.replace(/-/g, " ");
}
