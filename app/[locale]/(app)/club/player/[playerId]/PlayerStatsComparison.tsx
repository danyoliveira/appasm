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

// Each group is its own small panel — easier to scan than one long list.
function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background">
      <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="divide-y divide-border px-4 pb-1.5">{children}</div>
    </div>
  );
}

const LIVE_DOT = "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500";

// One row: label, the external (API) value, and the internal (hand-entered)
// one. The hand-entered value is the source of truth, so the color lands on
// the external (API) figure — green once it catches up to the internal
// number, amber while it's still off — telling the coach at a glance which
// API values still disagree with what's actually true.
function ComparisonRow({
  label,
  external,
  internalValue,
  liveValue,
  liveTitle,
  isEditing,
  onChange,
  step,
}: {
  label: string;
  external: number | null;
  internalValue: string;
  // What ASM Live Mode recorded — the internal value whenever the coach
  // hasn't typed one.
  liveValue: number | null;
  liveTitle: string;
  isEditing: boolean;
  onChange: (value: string) => void;
  step?: string;
}) {
  const manualNum = internalValue.trim() ? Number(internalValue.trim().replace(",", ".")) : null;
  const fromLive = manualNum == null && liveValue != null;
  const internalNum = manualNum ?? liveValue;
  const isMatch = external != null && internalNum != null && external === internalNum;
  const isMismatch = external != null && internalNum != null && external !== internalNum;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-3 py-2 text-sm">
      <span className="truncate text-muted" title={label}>
        {label}
      </span>
      <span
        className={`text-right tabular-nums ${
          isMatch ? "text-green-600 dark:text-green-400" : isMismatch ? "text-amber-600 dark:text-amber-400" : "text-muted"
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
          placeholder={liveValue != null ? String(liveValue) : undefined}
          title={liveValue != null ? liveTitle : undefined}
          className="w-16 justify-self-end rounded-md border border-border bg-surface px-1.5 py-0.5 text-right text-sm text-foreground outline-none placeholder:text-sky-600/60 focus:border-accent"
        />
      ) : (
        <span
          className="flex items-center justify-end gap-1.5 font-semibold tabular-nums"
          title={fromLive ? liveTitle : undefined}
        >
          {fromLive && <span aria-hidden className={LIVE_DOT} />}
          {internalNum ?? "-"}
        </span>
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
  liveValues = {},
  title,
}: {
  teamId: number;
  playerId: number;
  isCoach: boolean;
  isGoalkeeper: boolean;
  externalValues: PlayerManualStatsInput;
  initialInternalValues: PlayerManualStatsInput;
  // Recorded in ASM Live Mode (only the fields it can know).
  liveValues?: Partial<Record<FieldKey, number>>;
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

  const headlineFields: FieldDef[] = [
    GENERAL_FIELDS[0],
    GENERAL_FIELDS[2],
    ...(isGoalkeeper ? GOALKEEPER_FIELDS : ATTACK_FIELDS.slice(0, 2)),
  ];

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

      {/* The four numbers that matter most, big — the internal value (what
          the coach entered, or Live Mode), with the API figure underneath. */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {headlineFields.map((field) => {
          const raw = draft[field.key].trim().replace(",", ".");
          const manual = raw ? Number(raw) : null;
          const live = liveValues[field.key] ?? null;
          const value = manual ?? live;
          const external = externalValues[field.key];
          return (
            <div key={field.key} className="rounded-xl border border-border bg-background px-3 py-3.5 text-center">
              <div className="flex items-center justify-center gap-1.5 text-2xl font-bold tabular-nums">
                {manual == null && live != null && <span aria-hidden className={LIVE_DOT} />}
                {value ?? "-"}
              </div>
              <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted">{t(field.labelKey)}</div>
              {external != null && (
                <div
                  className={`mt-1 whitespace-nowrap text-[10px] tabular-nums ${
                    value == null ? "text-muted" : external === value ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {t("squadStatSourceExternal")} {external}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
      {groups.map((group) => (
        <StatGroup key={group.title} title={group.title}>
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <span />
            <span className="text-right">{t("squadStatSourceExternal")}</span>
            <span className="text-right">{t("squadStatSourceInternal")}</span>
          </div>
          {group.fields.map((field) => (
            <ComparisonRow
              key={field.key}
              label={t(field.labelKey)}
              external={externalValues[field.key]}
              internalValue={draft[field.key]}
              liveValue={liveValues[field.key] ?? null}
              liveTitle={t("statsLiveValueHint")}
              isEditing={isEditing}
              onChange={(value) => handleFieldChange(field.key, value)}
              step={field.step}
            />
          ))}
        </StatGroup>
      ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={LIVE_DOT} />
          {t("statsLegendLive")}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          {t("statsLegendMismatch")}
        </span>
      </div>
    </div>
  );
}
