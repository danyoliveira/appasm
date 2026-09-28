import type { DossierCategory } from "../actions";

export const CLUB_DOSSIER_CATEGORIES: DossierCategory[] = [
  "monthly_plan",
  "individual_eval",
  "collective_eval",
  "training_unit",
];

// The player page's own dossier — individual evaluations are the same rows
// the club dossier shows under that player.
export const PLAYER_DOSSIER_CATEGORIES: DossierCategory[] = [
  "individual_eval",
  "individual_plan",
  "medical_report",
  "player_other",
];
