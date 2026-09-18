import type { GameSubmoment, VideoCategory } from "./videoCategories";

// Shared between video tagging and the tactical board — both pick from the
// same moment/sub-moment taxonomy, so the translation keys live in one place.
export const CATEGORY_LABEL_KEYS: Record<VideoCategory, string> = {
  attack: "videoCategoryAttack",
  defense: "videoCategoryDefense",
  set_pieces: "videoCategorySetPieces",
  transitions: "videoCategoryTransitions",
  player: "videoCategoryPlayer",
};

export const SUBMOMENT_LABEL_KEYS: Record<GameSubmoment, string> = {
  goal_kick_defense: "submomentGoalKickDefense",
  high_press: "submomentHighPress",
  defensive_block: "submomentDefensiveBlock",
  build_up_first_phase: "submomentBuildUpFirstPhase",
  build_up_second_phase: "submomentBuildUpSecondPhase",
  finishing_zone: "submomentFinishingZone",
  transition_offensive: "submomentTransitionOffensive",
  transition_defensive: "submomentTransitionDefensive",
  corner_for: "submomentCornerFor",
  corner_against: "submomentCornerAgainst",
  penalty: "submomentPenalty",
};
