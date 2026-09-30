"use client";

import { useTranslations } from "next-intl";
import PlayerSelect, { type PlayerSelectOption } from "../PlayerSelect";
import { VIDEO_CATEGORIES, submomentsFor, type GameSubmoment, type VideoCategory } from "./videoCategories";
import { CATEGORY_LABEL_KEYS, SUBMOMENT_LABEL_KEYS } from "./gameMomentLabels";

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
    active
      ? "border-accent bg-accent text-accent-foreground"
      : "border-border bg-surface text-muted hover:border-accent hover:text-foreground"
  }`;

export const FIELD_LABEL_CLASS = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted";

// What an analysis or video is about: the category as chips, then its
// sub-moments (when it has any) or, for "Jogador", which player — the same
// block on the tactical board and in video analysis.
export default function MomentFields({
  category,
  onCategoryChange,
  submoment,
  onSubmomentChange,
  players,
  playerId,
  onPlayerChange,
}: {
  category: VideoCategory | "";
  onCategoryChange: (value: VideoCategory | "") => void;
  submoment: GameSubmoment | "";
  onSubmomentChange: (value: GameSubmoment | "") => void;
  players: PlayerSelectOption[];
  playerId: number | "";
  onPlayerChange: (id: number | "") => void;
}) {
  const t = useTranslations("dashboard");
  const submoments = submomentsFor(category);

  return (
    <div>
      <p className={FIELD_LABEL_CLASS}>{t("videoCategoryLabel")}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onCategoryChange("")} className={chipClass(category === "")}>
          {t("videoCategoryNone")}
        </button>
        {VIDEO_CATEGORIES.map((key) => (
          <button key={key} type="button" onClick={() => onCategoryChange(key)} className={chipClass(category === key)}>
            {t(CATEGORY_LABEL_KEYS[key])}
          </button>
        ))}
      </div>

      {category === "player" && (
        <div className="mt-3 border-l-2 border-accent/30 pl-3">
          <label className={FIELD_LABEL_CLASS}>{t("videoPlayerLabel")}</label>
          <PlayerSelect
            players={players}
            value={playerId}
            onChange={onPlayerChange}
            noneLabel={t("videoPlayerNone")}
            className="max-w-sm"
          />
        </div>
      )}

      {submoments && (
        <div className="mt-3 border-l-2 border-accent/30 pl-3">
          <p className={FIELD_LABEL_CLASS}>{t("videoSubmomentLabel")}</p>
          <div className="flex flex-wrap gap-1.5">
            {submoments.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onSubmomentChange(submoment === key ? "" : key)}
                className={chipClass(submoment === key)}
              >
                {t(SUBMOMENT_LABEL_KEYS[key])}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
