// What the coach fills in about a player that the external source doesn't
// have: the specific position(s) and the preferred foot.

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
  // Kept per player, for good.
  preferredFoot: PreferredFoot | null;
}

export const EMPTY_PLAYER_PROFILE: PlayerProfile = {
  primaryPosition: null,
  secondaryPosition: null,
  preferredFoot: null,
};

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
