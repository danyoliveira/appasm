"use client";

import { useTranslations } from "next-intl";
import { statOf, type CollectiveCounterKey, type CollectiveStats, type PossessionSide } from "./liveStatsShared";
import { DEFAULT_LIVE_STAT_CONFIG, activeCollectiveFields, fieldLabel, type LiveStatConfig } from "./liveStatConfig";

export interface TokenColors {
  home: { background: string; text: string };
  away: { background: string; text: string };
}

function PossessionBar({
  stats,
  homeName,
  awayName,
  canEdit,
  isPending,
  onSetPossession,
  tokenColors,
}: {
  stats: CollectiveStats;
  homeName: string;
  awayName: string;
  canEdit: boolean;
  isPending: boolean;
  onSetPossession?: (side: PossessionSide) => void;
  tokenColors?: TokenColors;
}) {
  const t = useTranslations("dashboard");
  const total = stats.possessionMsHome + stats.possessionMsAway + stats.possessionMsNeutral;
  const homePct = total > 0 ? Math.round((stats.possessionMsHome / total) * 100) : 0;
  const awayPct = total > 0 ? Math.round((stats.possessionMsAway / total) * 100) : 0;
  const neutralPct = Math.max(0, 100 - homePct - awayPct);

  // A summary of a game whose possession was never tracked: no bar at all,
  // rather than "0% — 0%" over a full neutral bar.
  if (!canEdit && total === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold tabular-nums">{homePct}%</span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("collectivePossessionLabel")}</span>
        <span className="text-lg font-bold tabular-nums">{awayPct}%</span>
      </div>
      {/* Each club in its own colour (the same as its pitch tokens). */}
      <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-border">
        <div className="bg-accent" style={{ width: `${homePct}%`, backgroundColor: tokenColors?.home.background }} />
        <div className="bg-amber-400" style={{ width: `${neutralPct}%` }} />
        <div
          className="bg-foreground/60"
          style={{ width: `${awayPct}%`, backgroundColor: tokenColors?.away.background }}
        />
      </div>

      {canEdit && onSetPossession && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {(["home", "neutral", "away"] as const).map((side) => {
            const active = stats.currentPossession === side;
            const color = side === "neutral" ? undefined : tokenColors?.[side];
            return (
              <button
                key={side}
                type="button"
                disabled={isPending}
                onClick={() => onSetPossession(side)}
                style={
                  active && color
                    ? { backgroundColor: color.background, borderColor: color.background, color: color.text }
                    : undefined
                }
                className={`truncate rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                  active
                    ? side === "neutral"
                      ? "border-amber-400 bg-amber-400 text-amber-950"
                      : "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-muted hover:text-foreground"
                }`}
              >
                {side === "home" ? homeName : side === "away" ? awayName : t("collectivePossessionNeutralButton")}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CounterRow({
  label,
  value,
  canEdit,
  isPending,
  onIncrement,
  onDecrement,
}: {
  label: string;
  value: number;
  canEdit: boolean;
  isPending: boolean;
  onIncrement?: () => void;
  onDecrement?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="min-w-0 text-sm">{label}</span>
      {/* Thumb-sized — these are tapped on a phone at the bench. */}
      <div className="flex shrink-0 items-center gap-1.5">
        {canEdit && (
          <button
            type="button"
            disabled={isPending || value === 0}
            onClick={onDecrement}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-lg leading-none text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            −
          </button>
        )}
        <span className="w-8 text-center text-base font-bold tabular-nums">{value}</span>
        {canEdit && (
          <button
            type="button"
            disabled={isPending}
            onClick={onIncrement}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-lg leading-none text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            +
          </button>
        )}
      </div>
    </div>
  );
}

export default function CollectiveStatsPanel({
  stats,
  homeName,
  awayName,
  canEdit,
  isPending = false,
  onSetPossession,
  onIncrement,
  onDecrement,
  statConfig = DEFAULT_LIVE_STAT_CONFIG,
  tokenColors,
}: {
  stats: CollectiveStats;
  homeName: string;
  awayName: string;
  canEdit: boolean;
  isPending?: boolean;
  onSetPossession?: (side: PossessionSide) => void;
  onIncrement?: (side: "home" | "away", key: CollectiveCounterKey) => void;
  onDecrement?: (side: "home" | "away", key: CollectiveCounterKey) => void;
  // The game's fields (its own frozen copy once it kicked off).
  statConfig?: LiveStatConfig;
  // Each club colour, as on the formation pitches.
  tokenColors?: TokenColors;
}) {
  const t = useTranslations("dashboard");
  const fields = activeCollectiveFields(statConfig);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("collectiveStatsTitle")}</h3>

      <div className="mt-2 empty:hidden">
        <PossessionBar
          stats={stats}
          homeName={homeName}
          awayName={awayName}
          canEdit={canEdit}
          isPending={isPending}
          onSetPossession={onSetPossession}
          tokenColors={tokenColors}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(["home", "away"] as const).map((side) => (
          <div key={side} className="rounded-2xl border border-border bg-background p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              {tokenColors && (
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
                  style={{ backgroundColor: tokenColors[side].background }}
                />
              )}
              {side === "home" ? homeName : awayName}
            </h4>
            <div className="mt-2 divide-y divide-border">
              {fields.map((field) => (
                <CounterRow
                  key={field.key}
                  label={fieldLabel(field, t)}
                  value={statOf(stats[side], field.key)}
                  canEdit={canEdit}
                  isPending={isPending}
                  onIncrement={() => onIncrement?.(side, field.key)}
                  onDecrement={() => onDecrement?.(side, field.key)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
