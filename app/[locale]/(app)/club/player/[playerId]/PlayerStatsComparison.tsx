"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { setPlayerManualStats, type PlayerManualStatsInput } from "../../../actions";

type FieldKey = keyof PlayerManualStatsInput;

interface FieldDef {
  key: FieldKey;
  labelKey: string;
  step?: string;
}

const GENERAL_FIELDS: FieldDef[] = [
  { key: "appearances", labelKey: "playerStatAppearances" },
  { key: "lineups", labelKey: "statLineups" },
  { key: "minutes", labelKey: "playerStatMinutes" },
  { key: "rating", labelKey: "statRating", step: "0.1" },
];
const ATTACK_FIELDS: FieldDef[] = [
  { key: "goals", labelKey: "playerStatGoals" },
  { key: "assists", labelKey: "playerStatAssists" },
  { key: "shotsTotal", labelKey: "statShots" },
  { key: "shotsOn", labelKey: "statShotsOn" },
  { key: "dribbleAttempts", labelKey: "statDribbleAttempts" },
  { key: "dribbleSuccess", labelKey: "statDribbles" },
];
const DEFENSE_FIELDS: FieldDef[] = [
  { key: "tackles", labelKey: "statTackles" },
  { key: "interceptions", labelKey: "statInterceptions" },
  { key: "duelsTotal", labelKey: "statDuelsTotal" },
  { key: "duelsWon", labelKey: "statDuelsWon" },
];
const GOALKEEPER_FIELDS: FieldDef[] = [
  { key: "saves", labelKey: "playerStatSaves" },
  { key: "conceded", labelKey: "playerStatConceded" },
];
const PASSES_FIELDS: FieldDef[] = [
  { key: "passesTotal", labelKey: "statPasses" },
  { key: "passesKey", labelKey: "statKeyPasses" },
];
const DISCIPLINE_FIELDS: FieldDef[] = [
  { key: "foulsDrawn", labelKey: "statFoulsDrawn" },
  { key: "foulsCommitted", labelKey: "statFoulsCommitted" },
  { key: "yellowCards", labelKey: "statYellowCards" },
  { key: "redCards", labelKey: "statRedCards" },
];

function toStrings(stats: PlayerManualStatsInput): Record<FieldKey, string> {
  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [key, value == null ? "" : String(value)]),
  ) as Record<FieldKey, string>;
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-1 divide-y divide-border">{children}</div>
    </div>
  );
}

// One row: label, the external (API) value, and the internal (hand-entered)
// one. The hand-entered value is the source of truth, so the color lands on
// the external (API) figure — green once it catches up to the internal
// number, amber while it's still off — telling the coach at a glance which
// API values still disagree with what's actually true.
function ComparisonRow({
  label,
  external,
  internalValue,
  isEditing,
  onChange,
  step,
}: {
  label: string;
  external: number | null;
  internalValue: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  step?: string;
}) {
  const internalNum = internalValue.trim() ? Number(internalValue.trim().replace(",", ".")) : null;
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
          step={step ?? "1"}
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

export default function PlayerStatsComparison({
  teamId,
  playerId,
  isCoach,
  isGoalkeeper,
  externalValues,
  initialInternalValues,
  title,
}: {
  teamId: number;
  playerId: number;
  isCoach: boolean;
  isGoalkeeper: boolean;
  externalValues: PlayerManualStatsInput;
  initialInternalValues: PlayerManualStatsInput;
  title: string;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Record<FieldKey, string>>(() => toStrings(initialInternalValues));

  function handleFieldChange(key: FieldKey, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const parsed: PlayerManualStatsInput = Object.fromEntries(
      Object.keys(draft).map((key) => {
        const raw = draft[key as FieldKey].trim().replace(",", ".");
        return [key, raw ? Number(raw) : null];
      }),
    ) as unknown as PlayerManualStatsInput;

    startTransition(async () => {
      await setPlayerManualStats(teamId, playerId, parsed);
      setIsEditing(false);
      router.refresh();
    });
  }

  function handleCancel() {
    setDraft(toStrings(initialInternalValues));
    setIsEditing(false);
  }

  const groups: { title: string; fields: FieldDef[] }[] = [
    { title: t("statGroupGeneral"), fields: GENERAL_FIELDS },
    ...(isGoalkeeper
      ? [{ title: t("statGroupGoalkeeping"), fields: GOALKEEPER_FIELDS }]
      : [
          { title: t("statGroupAttack"), fields: ATTACK_FIELDS },
          { title: t("statGroupDefense"), fields: DEFENSE_FIELDS },
        ]),
    { title: t("statGroupPasses"), fields: PASSES_FIELDS },
    { title: t("statGroupDiscipline"), fields: DISCIPLINE_FIELDS },
  ];

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

      {groups.map((group) => (
        <StatGroup key={group.title} title={group.title}>
          {group.fields.map((field) => (
            <ComparisonRow
              key={field.key}
              label={t(field.labelKey)}
              external={externalValues[field.key]}
              internalValue={draft[field.key]}
              isEditing={isEditing}
              onChange={(value) => handleFieldChange(field.key, value)}
              step={field.step}
            />
          ))}
        </StatGroup>
      ))}
    </div>
  );
}
