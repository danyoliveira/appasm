import { normalize } from "./text";

export interface MatchablePlayer {
  id: number;
  name: string;
  position: string;
  number: number | null;
  age: number | null;
}

export interface MergeSuggestion {
  manualId: number;
  apiId: number;
  score: number;
}

function nameTokens(name: string) {
  return normalize(name)
    .replace(/[^a-z0-9\s.]/g, " ")
    .split(/[\s.]+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// 0–1: how likely two names are the same person. Handles API-Football's
// inconsistent forms ("V. Pavlidis" vs "Vangelis Pavlidis"), accents and
// small typos.
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const full = similarity(ta.join(" "), tb.join(" "));
  if (full === 1) return 1;

  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  const lastSim = similarity(lastA, lastB);
  const sameInitial = ta[0][0] === tb[0][0];

  let score = full;
  if (lastSim === 1 && sameInitial) score = Math.max(score, 0.9);
  else if (lastSim >= 0.8 && sameInitial) score = Math.max(score, 0.8);
  else if (lastSim === 1) score = Math.max(score, 0.65);

  // One-word names (e.g. "Pepê") against a longer form containing that word.
  if (ta.length === 1 || tb.length === 1) {
    const single = ta.length === 1 ? ta[0] : tb[0];
    const others = ta.length === 1 ? tb : ta;
    if (others.some((tok) => similarity(tok, single) >= 0.9)) score = Math.max(score, 0.75);
  }
  return score;
}

export function matchScore(manual: MatchablePlayer, api: MatchablePlayer): number {
  const name = nameSimilarity(manual.name, api.name);
  if (name < 0.6) return 0;
  let score = name * 0.75;
  if (manual.number != null && manual.number === api.number) score += 0.12;
  if (manual.position === api.position) score += 0.08;
  if (manual.age != null && api.age != null && Math.abs(manual.age - api.age) <= 1) score += 0.05;
  return Math.min(score, 1);
}

export const MERGE_SUGGESTION_THRESHOLD = 0.6;

// Best API candidate for each manual player, skipping pairs the coach
// already said aren't the same person.
export function findMergeSuggestions(
  manualPlayers: MatchablePlayer[],
  apiPlayers: MatchablePlayer[],
  dismissed: Set<string>,
): MergeSuggestion[] {
  const suggestions: MergeSuggestion[] = [];
  for (const manual of manualPlayers) {
    let best: MergeSuggestion | null = null;
    for (const api of apiPlayers) {
      if (api.id <= 0 || dismissed.has(`${manual.id}:${api.id}`)) continue;
      const score = matchScore(manual, api);
      if (score >= MERGE_SUGGESTION_THRESHOLD && (!best || score > best.score)) {
        best = { manualId: manual.id, apiId: api.id, score };
      }
    }
    if (best) suggestions.push(best);
  }
  return suggestions;
}
