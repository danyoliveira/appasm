// "player" has no sub-moments (below) — picking it swaps the sub-moment
// picker for a player-from-squad picker instead, in the video form.
export const VIDEO_CATEGORIES = ["attack", "defense", "set_pieces", "transitions", "player"] as const;
export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

// Sub-phases within a moment (e.g. "defense" breaks down into how we defend
// in each situation) — shared by both video tagging and the tactical board,
// not just video. Moments without an entry here cover a single, undivided
// phase of play.
export const GAME_SUBMOMENTS = {
  defense: ["goal_kick_defense", "high_press", "defensive_block"],
  attack: ["build_up_first_phase", "build_up_second_phase", "finishing_zone"],
  transitions: ["transition_offensive", "transition_defensive"],
  set_pieces: ["corner_for", "corner_against", "penalty"],
} as const satisfies Partial<Record<VideoCategory, readonly string[]>>;

export type GameSubmoment = (typeof GAME_SUBMOMENTS)[keyof typeof GAME_SUBMOMENTS][number];

// Not every VideoCategory has an entry above ("player" never does) — this
// keeps that lookup type-safe at every call site instead of each one
// re-casting GAME_SUBMOMENTS to a wider index type.
export function submomentsFor(category: VideoCategory | ""): readonly GameSubmoment[] | undefined {
  if (!category) return undefined;
  return (GAME_SUBMOMENTS as Partial<Record<VideoCategory, readonly GameSubmoment[]>>)[category];
}

export interface VideoPlayerOption {
  id: number;
  name: string;
}
