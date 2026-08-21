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
export function buildFlagResolver(countries: Country[]) {
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
