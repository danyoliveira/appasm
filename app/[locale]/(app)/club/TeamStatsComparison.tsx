"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { setTeamManualStats, type TeamManualStatsInput } from "../actions";

export type TeamStatFieldKey = keyof TeamManualStatsInput;

export interface TeamStatFieldDef {
  key: TeamStatFieldKey;
  labelKey: string;
}

export const HEADLINE_TEAM_STAT_FIELDS: TeamStatFieldDef[] = [
  { key: "played", labelKey: "statPlayed" },
  { key: "wins", labelKey: "statWins" },
  { key: "draws", labelKey: "statDraws" },
  { key: "loses", labelKey: "statLoses" },
  { key: "goalsFor", labelKey: "statGoalsFor" },
  { key: "goalsAgainst", labelKey: "statGoalsAgainst" },
  { key: "cleanSheets", labelKey: "statCleanSheets" },
];

export const HOME_TEAM_STAT_FIELDS: TeamStatFieldDef[] = [
  { key: "playedHome", labelKey: "statPlayed" },
  { key: "winsHome", labelKey: "statWins" },
  { key: "drawsHome", labelKey: "statDraws" },
  { key: "losesHome", labelKey: "statLoses" },
  { key: "goalsForHome", labelKey: "statGoalsFor" },
  { key: "goalsAgainstHome", labelKey: "statGoalsAgainst" },
  { key: "cleanSheetsHome", labelKey: "statCleanSheets" },
];

export const AWAY_TEAM_STAT_FIELDS: TeamStatFieldDef[] = [
  { key: "playedAway", labelKey: "statPlayed" },
  { key: "winsAway", labelKey: "statWins" },
  { key: "drawsAway", labelKey: "statDraws" },
  { key: "losesAway", labelKey: "statLoses" },
  { key: "goalsForAway", labelKey: "statGoalsFor" },
  { key: "goalsAgainstAway", labelKey: "statGoalsAgainst" },
  { key: "cleanSheetsAway", labelKey: "statCleanSheets" },
];

export const BIGGEST_RESULTS_FIELDS: TeamStatFieldDef[] = [
  { key: "biggestWinGoalsFor", labelKey: "statBiggestWinGoalsFor" },
  { key: "biggestWinGoalsAgainst", labelKey: "statBiggestWinGoalsAgainst" },
  { key: "biggestLossGoalsFor", labelKey: "statBiggestLossGoalsFor" },
  { key: "biggestLossGoalsAgainst", labelKey: "statBiggestLossGoalsAgainst" },
];

export const PENALTY_FIELDS: TeamStatFieldDef[] = [
  { key: "penaltyScored", labelKey: "statPenaltiesScored" },
  { key: "penaltyMissed", labelKey: "statPenaltiesMissed" },
];

function draftFor(fields: TeamStatFieldDef[], values: TeamManualStatsInput): Record<TeamStatFieldKey, string> {
  return Object.fromEntries(
    fields.map((f) => [f.key, values[f.key] == null ? "" : String(values[f.key])]),
  ) as Record<TeamStatFieldKey, string>;
}

// Same rule as the player's comparison table: the hand-entered number is
// the source of truth, so the color lands on the external (API) figure —
// green once it agrees with the internal one, amber while it doesn't.
function ComparisonRow({
  label,
  external,
  internalValue,
  isEditing,
  onChange,
}: {
  label: string;
  external: number | null;
  internalValue: string;
  isEditing: boolean;
  onChange: (value: string) => void;
}) {
  const internalNum = internalValue.trim() ? Number(internalValue.trim()) : null;
  const isMatch = external != null && internalNum != null && external === internalNum;
  const isMismatch = external != null && internalNum != null && external !== internalNum;

  return (
    <div className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-2 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span
        className={`text-right font-semibold ${
          isMatch ? "text-green-600" : isMismatch ? "text-yellow-600" : ""
        }`}
      >
        {external ?? "-"}
      </span>
      {isEditing ? (
        <input
          type="number"
          value={internalValue}
          onChange={(e) => onChange(e.target.value)}
          className="w-14 justify-self-end rounded-md border border-border bg-background px-1.5 py-0.5 text-right text-sm text-foreground outline-none focus:border-accent"
        />
      ) : (
        <span className="text-right font-semibold">{internalNum ?? "-"}</span>
      )}
    </div>
  );
}

export default function TeamStatsComparison({
  teamId,
  isCoach,
  fields,
  externalValues,
  internalValues,
  title,
}: {
  teamId: number;
  isCoach: boolean;
  fields: TeamStatFieldDef[];
  externalValues: TeamManualStatsInput;
  // The full, currently-persisted internal record — not just this card's
  // fields. Saving sends the whole thing back with only this card's fields
  // overridden, so editing "Casa" can't wipe out "Penalidades" and so on.
  internalValues: TeamManualStatsInput;
  title: string;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<TeamStatFieldKey, string>>(() => draftFor(fields, internalValues));

  function handleFieldChange(key: TeamStatFieldKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const merged: TeamManualStatsInput = { ...internalValues };
    for (const field of fields) {
      const raw = draft[field.key]?.trim();
      merged[field.key] = raw ? Number(raw) : null;
    }

    startTransition(async () => {
      await setTeamManualStats(teamId, merged);
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    setDraft(draftFor(fields, internalValues));
    setIsEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {isCoach &&
          (isEditing ? (
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={handleSave}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                {isPending ? t("savingClub") : t("saveNoteButton")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleCancel}
                className="text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
              >
                {t("cancelButton")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="shrink-0 text-xs font-medium text-accent hover:underline"
            >
              {t("editButton")}
            </button>
          ))}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_3.5rem_3.5rem] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <span />
        <span className="text-right">{t("statsExternalTab")}</span>
        <span className="text-right">{t("statsInternalTab")}</span>
      </div>

      <div className="divide-y divide-border">
        {fields.map((field) => (
          <ComparisonRow
            key={field.key}
            label={t(field.labelKey)}
            external={externalValues[field.key]}
            internalValue={draft[field.key]}
            isEditing={isEditing}
            onChange={(value) => handleFieldChange(field.key, value)}
          />
        ))}
      </div>
    </div>
  );
}
