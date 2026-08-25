export const VIDEO_CATEGORIES = ["attack", "defense", "set_pieces", "transitions"] as const;
export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

export interface VideoPlayerOption {
  id: number;
  name: string;
}

export interface VideoSnapshotOption {
  id: string;
  label: string;
}
