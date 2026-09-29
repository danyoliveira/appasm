"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  emptyGkStatsSide,
  gkEfficiency,
  type GkCounterKey,
  type GkOutcome,
  type GkStatsByPlayer,
  type GkStatsSide,
  type LineupPlayer,
  statOf,
} from "./liveStatsShared";
import {
  DEFAULT_LIVE_STAT_CONFIG,
  activeGkGroups,
  fieldLabel,
  gkKeysOf,
  groupLabel,
  type LiveGkGroup,
  type LiveStatConfig,
} from "./liveStatConfig";

// A field's display name within the given groups.
function labelIn(groups: LiveGkGroup[], key: string, t: (k: string) => string): string {
  const f = groups.flatMap((g) => g.fields).find((x) => x.key === key);
  return fieldLabel(f ?? { key, label: null }, t);
}

// The first player of the starting XI is the keeper (the lineup lists the
// goalkeeper first — "Preencher com o plantel" does too) — offered as a
// one-tap-to-confirm default.
function guessGkName(startingPlayers: LineupPlayer[]): string | null {
  return startingPlayers[0]?.name ?? null;
}

function EfficiencyPill({ value }: { value: number | null }) {
  if (value == null) return <span className="text-xs tabular-nums text-muted">–</span>;
  const tone =
    value >= 70
      ? "bg-green-600/10 text-green-700 dark:text-green-400"
      : value >= 40
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "bg-red-500/10 text-red-600 dark:text-red-400";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>{value}%</span>;
}

const sumOf = (side: GkStatsSide, keys: readonly GkCounterKey[]) => keys.reduce((sum, key) => sum + statOf(side, key), 0);
const keysOf = (group: LiveGkGroup) => group.fields.map((f) => f.key);

// Edit mode (bench / GK coach): every action as a small tile — label on
// top, one ✓ and one ✗ button below — packed several per row, so the whole
// sheet fits in about a screen instead of a long scroll. A tap adds one;
// mistakes are fixed with "Desfazer" (last taps) or the "Corrigir" mode,
// where the same buttons take one away — no − buttons cluttering every row.
function GkTapBoard({
  groups,
  stats,
  incomplete,
  correcting,
  isPending,
  onTap,
}: {
  groups: LiveGkGroup[];
  stats: GkStatsSide;
  incomplete: GkStatsSide;
  correcting: boolean;
  isPending: boolean;
  onTap: (key: GkCounterKey, outcome: GkOutcome) => void;
}) {
  const t = useTranslations("dashboard");

  function renderButton(key: GkCounterKey, outcome: GkOutcome) {
    const complete = outcome === "complete";
    const value = complete ? statOf(stats, key) : statOf(incomplete, key);
    const tone = correcting
      ? "border-border bg-surface text-muted"
      : complete
        ? "border-green-600/40 bg-green-600/10 text-green-700 hover:bg-green-600/20 dark:text-green-400"
        : "border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400";
    return (
      <button
        type="button"
        disabled={isPending || (correcting && value === 0)}
        onClick={() => onTap(key, outcome)}
        aria-label={`${correcting ? "−" : "+"} ${labelIn(groups, key, t)} — ${t(complete ? "gkOutcomeComplete" : "gkOutcomeIncomplete")}`}
        className={`flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold transition active:scale-95 disabled:opacity-40 ${tone}`}
      >
        <span>{correcting ? "−" : complete ? "✓" : "✗"}</span>
        <span className="text-base font-bold tabular-nums text-foreground">{value}</span>
      </button>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const groupComplete = sumOf(stats, keysOf(group));
        const groupIncomplete = sumOf(incomplete, keysOf(group));
        return (
          <section key={group.id}>
            <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{groupLabel(group, t)}</h4>
              <EfficiencyPill value={gkEfficiency(groupComplete, groupIncomplete)} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {keysOf(group).map((key) => (
                <div key={key} className="rounded-xl border border-border bg-background p-2">
                  <div className="flex min-h-8 items-start justify-between gap-1">
                    <span className="line-clamp-2 text-xs font-medium leading-tight">{labelIn(groups, key, t)}</span>
                    {gkEfficiency(statOf(stats, key), statOf(incomplete, key)) != null && (
                      <span className="shrink-0 text-[10px] tabular-nums text-muted">
                        {gkEfficiency(statOf(stats, key), statOf(incomplete, key))}%
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {renderButton(key, "complete")}
                    {renderButton(key, "incomplete")}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Read-only (viewers, recap, a finished keeper's card): compact tables —
// ✓ / ✗ in the header (full label on hover) so narrow columns never stack.
function GkGroupCards({
  groups,
  stats,
  incomplete,
}: {
  groups: LiveGkGroup[];
  stats: GkStatsSide;
  incomplete: GkStatsSide;
}) {
  const t = useTranslations("dashboard");

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {groups.map((group) => {
        const groupComplete = sumOf(stats, keysOf(group));
        const groupIncomplete = sumOf(incomplete, keysOf(group));
        return (
          <div key={group.id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5">
              <h4 className="text-sm font-semibold">{groupLabel(group, t)}</h4>
              <div className="flex items-center gap-2 text-xs tabular-nums">
                <span className="font-semibold text-green-700 dark:text-green-400" title={t("gkOutcomeComplete")}>
                  ✓ {groupComplete}
                </span>
                <span className="font-semibold text-red-600 dark:text-red-400" title={t("gkOutcomeIncomplete")}>
                  ✗ {groupIncomplete}
                </span>
                <EfficiencyPill value={gkEfficiency(groupComplete, groupIncomplete)} />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_3rem] items-center gap-x-2 text-sm font-semibold">
              <span />
              <span title={t("gkOutcomeComplete")} className="text-center text-green-700 dark:text-green-400">
                ✓
              </span>
              <span title={t("gkOutcomeIncomplete")} className="text-center text-red-600 dark:text-red-400">
                ✗
              </span>
              <span className="text-right text-[10px] uppercase tracking-wide text-muted">%</span>
            </div>
            <div className="mt-1 divide-y divide-border">
              {keysOf(group).map((key) => {
                const efficiency = gkEfficiency(statOf(stats, key), statOf(incomplete, key));
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_3rem] items-center gap-x-2 py-1.5"
                  >
                    <span className="text-sm">{labelIn(groups, key, t)}</span>
                    <span className="text-center text-sm font-semibold tabular-nums">{statOf(stats, key)}</span>
                    <span className="text-center text-sm font-semibold tabular-nums">{statOf(incomplete, key)}</span>
                    <span className="text-right text-xs tabular-nums text-muted">
                      {efficiency == null ? "–" : `${efficiency}%`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GkIdentityHeader({
  number,
  name,
  teamName,
}: {
  number: number | null;
  name: string;
  teamName: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-900 text-base font-bold text-white shadow ring-2 ring-accent/50">
        {number ?? "-"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{teamName}</p>
        <p className="truncate text-lg font-semibold">{name}</p>
      </div>
    </div>
  );
}

export default function GkStatsPanel({
  stats,
  incompleteStats,
  gkName,
  teamName,
  players,
  canEdit,
  isPending = false,
  onSelectGk,
  onIncrement,
  onDecrement,
  byPlayer,
  statConfig = DEFAULT_LIVE_STAT_CONFIG,
}: {
  // Completed actions…
  stats: GkStatsSide;
  // …and not completed ones (defaults to none).
  incompleteStats?: GkStatsSide;
  gkName: string | null;
  teamName: string;
  players: LineupPlayer[];
  canEdit: boolean;
  isPending?: boolean;
  onSelectGk?: (name: string) => void;
  onIncrement?: (key: GkCounterKey, outcome: GkOutcome) => void;
  onDecrement?: (key: GkCounterKey, outcome: GkOutcome) => void;
  // Read-only recap only: every keeper who was credited with a stat this
  // match. When there's more than one (a mid-match keeper change), each
  // gets their own card instead of collapsing everything into whoever
  // ended the match in goal.
  byPlayer?: GkStatsByPlayer[];
  // The game's fields (its own frozen copy once it kicked off).
  statConfig?: LiveStatConfig;
}) {
  const t = useTranslations("dashboard");
  const groups = activeGkGroups(statConfig);
  // This device's own taps, newest last — "Desfazer" walks back through them.
  const [tapHistory, setTapHistory] = useState<{ key: GkCounterKey; outcome: GkOutcome }[]>([]);
  const [correcting, setCorrecting] = useState(false);

  const startingPlayers = players.filter((p) => p.starting && p.name.trim());
  // The confirmed keeper leaving the starting XI (sub, red card) means the
  // confirmation no longer holds — re-prompt instead of silently keeping
  // score for someone who isn't even on the pitch anymore.
  const gkStillStarting = gkName != null && startingPlayers.some((p) => p.name === gkName);
  const needsConfirm = canEdit && !gkStillStarting;
  // No manual "change" — a substitution of our keeper hands the role to
  // whoever came on; the picker only appears when nobody is (still) in goal.
  const showPicker = needsConfirm;
  const suggestedName = needsConfirm ? guessGkName(startingPlayers) : null;
  const incomplete = incompleteStats ?? emptyGkStatsSide();

  function confirm(name: string) {
    setTapHistory([]);
    onSelectGk?.(name);
  }

  function handleTap(key: GkCounterKey, outcome: GkOutcome) {
    if (correcting) {
      onDecrement?.(key, outcome);
      return;
    }
    setTapHistory((h) => [...h.slice(-19), { key, outcome }]);
    onIncrement?.(key, outcome);
  }

  function handleUndo() {
    const last = tapHistory[tapHistory.length - 1];
    if (!last) return;
    setTapHistory((h) => h.slice(0, -1));
    onDecrement?.(last.key, last.outcome);
  }

  if (!showPicker && byPlayer && byPlayer.length > 1) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("gkStatsTitle")}</h3>
        <div className="mt-2 space-y-4">
          {byPlayer.map((entry) => (
            <div key={entry.name}>
              <GkIdentityHeader
                number={players.find((p) => p.name === entry.name)?.number ?? null}
                name={entry.name}
                teamName={teamName}
              />
              <div className="mt-3">
                <GkGroupCards groups={groups} stats={entry.stats} incomplete={entry.incomplete} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gkNumber = gkName ? (players.find((p) => p.name === gkName)?.number ?? null) : null;

  if (showPicker) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("gkStatsTitle")}</h3>
        <div className="mt-2 space-y-2 rounded-2xl border border-border bg-background p-4">
          {suggestedName && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow ring-2 ring-accent/50">
                  {startingPlayers.find((p) => p.name === suggestedName)?.number ?? "-"}
                </div>
                <span className="text-sm font-medium">{t("gkSuggestedLabel", { name: suggestedName })}</span>
              </div>
              <button
                type="button"
                onClick={() => confirm(suggestedName)}
                disabled={isPending}
                className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t("gkConfirmButton")}
              </button>
            </div>
          )}
          <select
            value=""
            onChange={(e) => e.target.value && confirm(e.target.value)}
            disabled={isPending}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50"
          >
            <option value="">{t("gkSelectPlaceholder")}</option>
            {/* Only players on the pitch — picking someone on the bench
                would never stick (they aren't playing), which is what
                happened after a keeper's red card. */}
            {startingPlayers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.number != null ? `${p.number} · ` : ""}
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted">{t("gkPickerBenchHint")}</p>
        </div>
      </div>
    );
  }

  if (!gkName) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("gkStatsTitle")}</h3>
        <p className="mt-2 rounded-2xl border border-border bg-background p-4 text-sm text-muted">
          {t("gkNoSelectionHint")}
        </p>
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("gkStatsTitle")}</h3>
        <div className="mt-2 rounded-2xl border border-border bg-background p-4">
          <GkIdentityHeader number={gkNumber} name={gkName} teamName={teamName} />
        </div>
        <div className="mt-4">
          <GkGroupCards groups={groups} stats={stats} incomplete={incomplete} />
        </div>
      </div>
    );
  }

  const allKeys = gkKeysOf(groups);
  const totalComplete = sumOf(stats, allKeys);
  const totalIncomplete = sumOf(incomplete, allKeys);
  const lastTap = tapHistory[tapHistory.length - 1];

  return (
    <div>
      {/* One compact bar: who's in goal, the running totals, and the two
          ways to fix a mistake — stays on screen while scrolling. */}
      <div className="sticky top-0 z-10 -mx-1 rounded-2xl border border-border bg-surface/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white ring-2 ring-accent/50">
            {gkNumber ?? "-"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{gkName}</p>
            <p className="truncate text-[10px] uppercase tracking-wide text-muted">{teamName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs font-semibold tabular-nums">
            <span className="text-green-700 dark:text-green-400">✓ {totalComplete}</span>
            <span className="text-red-600 dark:text-red-400">✗ {totalIncomplete}</span>
            <EfficiencyPill value={gkEfficiency(totalComplete, totalIncomplete)} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!lastTap || isPending || correcting}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-foreground/30 disabled:opacity-40"
          >
            <span aria-hidden>↶</span>
            <span className="truncate">
              {lastTap
                ? `${t("gkUndoLast")}: ${labelIn(groups, lastTap.key, t)} ${lastTap.outcome === "complete" ? "✓" : "✗"}`
                : t("gkUndoLast")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCorrecting((c) => !c)}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              correcting
                ? "border-amber-500 bg-amber-500 text-white"
                : "border-border bg-background text-muted hover:text-foreground"
            }`}
          >
            {correcting ? t("gkCorrectDone") : t("gkCorrectMode")}
          </button>
        </div>
        {correcting && <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">{t("gkCorrectModeHint")}</p>}
      </div>

      <div className="mt-3">
        <GkTapBoard
          groups={groups}
          stats={stats}
          incomplete={incomplete}
          correcting={correcting}
          isPending={isPending}
          onTap={handleTap}
        />
      </div>
    </div>
  );
}
