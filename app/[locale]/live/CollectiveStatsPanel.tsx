"use client";

import { useTranslations } from "next-intl";
import {
  COLLECTIVE_COUNTER_KEYS,
  type CollectiveCounterKey,
  type CollectiveStats,
  type PossessionSide,
} from "./liveStatsShared";

const COUNTER_LABEL_KEYS: Record<CollectiveCounterKey, string> = {
  offensive_transition: "collectiveStatOffensiveTransitions",
  tackle: "collectiveStatTackles",
  interception: "collectiveStatInterceptions",
  recovery_own_half: "collectiveStatRecoveryOwnHalf",
  recovery_opp_half: "collectiveStatRecoveryOppHalf",
  progressive_pass: "collectiveStatProgressivePasses",
};

function PossessionBar({
  stats,
  homeName,
  awayName,
  canEdit,
  isPending,
  onSetPossession,
}: {
  stats: CollectiveStats;
  homeName: string;
  awayName: string;
  canEdit: boolean;
  isPending: boolean;
  onSetPossession?: (side: PossessionSide) => void;
}) {
  const t = useTranslations("dashboard");
  const total = stats.possessionMsHome + stats.possessionMsAway + stats.possessionMsNeutral;
  const homePct = total > 0 ? Math.round((stats.possessionMsHome / total) * 100) : 0;
  const awayPct = total > 0 ? Math.round((stats.possessionMsAway / total) * 100) : 0;
  const neutralPct = Math.max(0, 100 - homePct - awayPct);

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">{homePct}%</span>
        <span className="font-medium uppercase tracking-wide text-muted">{t("collectivePossessionLabel")}</span>
        <span className="font-semibold">{awayPct}%</span>
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-border">
        <div className="bg-accent" style={{ width: `${homePct}%` }} />
        <div className="bg-amber-400" style={{ width: `${neutralPct}%` }} />
        <div className="bg-foreground/60" style={{ width: `${awayPct}%` }} />
      </div>

      {canEdit && onSetPossession && (
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {(["home", "neutral", "away"] as const).map((side) => (
            <button
              key={side}
              type="button"
              disabled={isPending}
              onClick={() => onSetPossession(side)}
              className={`rounded-full border px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                stats.currentPossession === side
                  ? side === "neutral"
                    ? "border-amber-400 bg-amber-400 text-amber-950"
                    : "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface text-muted hover:text-foreground"
              }`}
            >
              {side === "home" ? homeName : side === "away" ? awayName : t("collectivePossessionNeutralButton")}
            </button>
          ))}
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
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        {canEdit && (
          <button
            type="button"
            disabled={isPending || value === 0}
            onClick={onDecrement}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            −
          </button>
        )}
        <span className="w-5 text-center text-sm font-semibold">{value}</span>
        {canEdit && (
          <button
            type="button"
            disabled={isPending}
            onClick={onIncrement}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-accent text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
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
}: {
  stats: CollectiveStats;
  homeName: string;
  awayName: string;
  canEdit: boolean;
  isPending?: boolean;
  onSetPossession?: (side: PossessionSide) => void;
  onIncrement?: (side: "home" | "away", key: CollectiveCounterKey) => void;
  onDecrement?: (side: "home" | "away", key: CollectiveCounterKey) => void;
}) {
  const t = useTranslations("dashboard");

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("collectiveStatsTitle")}</h3>

      <div className="mt-2">
        <PossessionBar
          stats={stats}
          homeName={homeName}
          awayName={awayName}
          canEdit={canEdit}
          isPending={isPending}
          onSetPossession={onSetPossession}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(["home", "away"] as const).map((side) => (
          <div key={side} className="rounded-2xl border border-border bg-background p-4">
            <h4 className="text-sm font-semibold">{side === "home" ? homeName : awayName}</h4>
            <div className="mt-2 divide-y divide-border">
              {COLLECTIVE_COUNTER_KEYS.map((key) => (
                <CounterRow
                  key={key}
                  label={t(COUNTER_LABEL_KEYS[key])}
                  value={stats[side][key]}
                  canEdit={canEdit}
                  isPending={isPending}
                  onIncrement={() => onIncrement?.(side, key)}
                  onDecrement={() => onDecrement?.(side, key)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
