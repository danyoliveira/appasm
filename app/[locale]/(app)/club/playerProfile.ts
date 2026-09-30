// What the coach fills in about a player: what the external source doesn't
// have at all (specific positions, preferred foot) and what it has for some
// players but not others (nationality, birth date, height, weight) — so
// every player can end up with the same information.

// Back to front, right before left — the order every picker lists them in.
export const DETAILED_POSITIONS = [
  "goalkeeper",
  "right_back",
  "centre_back",
  "left_back",
  "defensive_mid",
  "central_mid",
  "attacking_mid",
  "right_winger",
  "left_winger",
  "second_striker",
  "striker",
] as const;
export type DetailedPosition = (typeof DETAILED_POSITIONS)[number];

export const PREFERRED_FEET = ["right", "left", "both"] as const;
export type PreferredFoot = (typeof PREFERRED_FEET)[number];

export interface PlayerProfile {
  // Kept per coaching spell.
  primaryPosition: DetailedPosition | null;
  secondaryPosition: DetailedPosition | null;
  heightCm: number | null;
  // Latest weigh-in at the club (weight is a history, not one value).
  weightKg: number | null;
  // Kept per player, for good. Nationality is a country name as the
  // external source's country list has it; birth date is "YYYY-MM-DD".
  preferredFoot: PreferredFoot | null;
  nationality: string | null;
  birthDate: string | null;
  // A photo the coach uploaded, shown instead of the source's.
  photoUrl: string | null;
}

// One player's positions as stored for a given spell.
export interface StoredPositions {
  stintId: string;
  playerId: number;
  primaryPosition: DetailedPosition;
  secondaryPosition: DetailedPosition | null;
}

// What the squad list needs to offer the copy.
export interface CopyablePositionsSummary {
  // How many players of the current squad would get a position.
  count: number;
  startedAt: string;
  endedAt: string;
}

// Positions are kept per spell, so a coach back at a club starts without
// them. This picks what can be brought over: from the most recent earlier
// spell that has any, the players who have no main position yet in the
// current one (nothing already set is ever overwritten).
export function pickPositionsToCopy(
  // Earlier spells at the club, most recent first.
  previousStintIds: string[],
  stored: StoredPositions[],
  current: Record<number, PlayerProfile>,
): StoredPositions[] {
  for (const stintId of previousStintIds) {
    const rows = stored.filter((row) => row.stintId === stintId && !current[row.playerId]?.primaryPosition);
    if (rows.length > 0) return rows;
  }
  return [];
}

export const EMPTY_PLAYER_PROFILE: PlayerProfile = {
  primaryPosition: null,
  secondaryPosition: null,
  heightCm: null,
  weightKg: null,
  preferredFoot: null,
  nationality: null,
  birthDate: null,
  photoUrl: null,
};

// The coach's own photos in place of the external source's, wherever a
// list of players is shown.
export function withProfilePhotos<T extends { id: number; photo: string }>(
  players: T[],
  profiles: Record<number, PlayerProfile>,
): T[] {
  return players.map((p) => (profiles[p.id]?.photoUrl ? { ...p, photo: profiles[p.id].photoUrl! } : p));
}

// Which of the external source's four groups each position sits in — the
// pickers group by it.
export const POSITION_GROUP: Record<DetailedPosition, "Goalkeeper" | "Defender" | "Midfielder" | "Attacker"> = {
  goalkeeper: "Goalkeeper",
  right_back: "Defender",
  centre_back: "Defender",
  left_back: "Defender",
  defensive_mid: "Midfielder",
  central_mid: "Midfielder",
  attacking_mid: "Midfielder",
  right_winger: "Attacker",
  left_winger: "Attacker",
  second_striker: "Attacker",
  striker: "Attacker",
};

export function isDetailedPosition(value: unknown): value is DetailedPosition {
  return typeof value === "string" && (DETAILED_POSITIONS as readonly string[]).includes(value);
}

export function isPreferredFoot(value: unknown): value is PreferredFoot {
  return typeof value === "string" && (PREFERRED_FEET as readonly string[]).includes(value);
}

type Translate = (key: string) => string;

// "Defesa esquerdo"
export function positionLabel(position: DetailedPosition, t: Translate) {
  return t(`detailedPosition_${position}`);
}

// "DE"
export function positionShort(position: DetailedPosition, t: Translate) {
  return t(`detailedPositionShort_${position}`);
}

// "DE · EE" — main position first; null when neither is set.
export function positionsShort(profile: PlayerProfile | undefined, t: Translate): string | null {
  if (!profile) return null;
  const codes = [profile.primaryPosition, profile.secondaryPosition].filter((p): p is DetailedPosition => p != null);
  return codes.length > 0 ? codes.map((p) => positionShort(p, t)).join(" · ") : null;
}

// "Defesa esquerdo · Extremo esquerdo"
export function positionsLabel(profile: PlayerProfile | undefined, t: Translate): string | null {
  if (!profile) return null;
  const codes = [profile.primaryPosition, profile.secondaryPosition].filter((p): p is DetailedPosition => p != null);
  return codes.length > 0 ? codes.map((p) => positionLabel(p, t)).join(" · ") : null;
}
