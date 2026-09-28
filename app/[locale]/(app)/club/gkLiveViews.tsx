"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  GK_COUNTER_KEYS,
  emptyGkStatsSide,
  gkEfficiency,
  type GkCounterKey,
  type GkStatsByPlayer,
  type GkStatsSide,
} from "../../live/liveStatsShared";
import { GK_GROUPS, GK_LABEL_KEYS } from "../../live/GkStatsPanel";

// Shared goalkeeping views for ASM Live Mode — the club's Estatística tab
// (the team's goalkeeping, whoever was in goal) and a goalkeeper's own
// profile tab (only that keeper).

export type GkTotals = { complete: GkStatsSide; incomplete: GkStatsSide };

export function sumKeys(side: GkStatsSide, keys: readonly GkCounterKey[]) {
  return keys.reduce((sum, key) => sum + side[key], 0);
}

// Keepers of one game summed (a mid-game change still counts as that
// game's goalkeeping), or null with no Modo GK data.
export function gkTotalsOf(keepers: GkStatsByPlayer[]): GkTotals | null {
  if (!keepers.length) return null;
  const complete = emptyGkStatsSide();
  const incomplete = emptyGkStatsSide();
  for (const keeper of keepers) {
    for (const key of GK_COUNTER_KEYS) {
      complete[key] += keeper.stats[key];
      incomplete[key] += keeper.incomplete[key];
    }
  }
  return { complete, incomplete };
}

// Pooled efficiency (all completed ÷ all attempts) over several games for
// the given actions — not an average of per-game percentages.
export function pooledEfficiency(totals: (GkTotals | null)[], keys: readonly GkCounterKey[]) {
  let ok = 0;
  let ko = 0;
  for (const tot of totals) {
    if (!tot) continue;
    ok += sumKeys(tot.complete, keys);
    ko += sumKeys(tot.incomplete, keys);
  }
  return gkEfficiency(ok, ko);
}

// Completed (green) vs not completed (red) share of an action's attempts.
export function EfficiencyBar({ complete, incomplete }: { complete: number; incomplete: number }) {
  const total = complete + incomplete;
  if (total === 0) return <div className="h-1.5 rounded-full bg-border" />;
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
      {complete > 0 && <div className="rounded-full bg-green-600" style={{ width: `${(complete / total) * 100}%` }} />}
      {incomplete > 0 && <div className="flex-1 rounded-full bg-red-500" />}
    </div>
  );
}

// One keeper in one game: summary card (✓ / ✗ / efficiency), then every
// action — full name, bar, counts, % — grouped, in a single column.
export function GkKeeperBreakdown({
  keeper,
  totals,
  showName = true,
}: {
  keeper?: string;
  totals: GkTotals;
  showName?: boolean;
}) {
  const t = useTranslations("dashboard");
  const complete = sumKeys(totals.complete, GK_COUNTER_KEYS);
  const incomplete = sumKeys(totals.incomplete, GK_COUNTER_KEYS);
  const efficiency = gkEfficiency(complete, incomplete);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-background px-3 py-2.5">
        <div className="min-w-0">
          {showName && keeper && <div className="truncate text-sm font-semibold">{keeper}</div>}
          <div className="mt-0.5 flex gap-3 text-xs">
            <span className="text-green-700 dark:text-green-400">
              ✓ {complete} {t("gkOutcomeComplete").toLowerCase()}
            </span>
            <span className="text-red-600 dark:text-red-400">
              ✗ {incomplete} {t("gkOutcomeIncomplete").toLowerCase()}
            </span>
          </div>
        </div>
        {efficiency != null && (
          <div className="shrink-0 text-right">
            <div className="text-xl font-semibold tabular-nums">{efficiency}%</div>
            <div className="text-[10px] uppercase tracking-wide text-muted">{t("gkEfficiencyTitle")}</div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {GK_GROUPS.map((group) => {
          const groupEfficiency = gkEfficiency(
            sumKeys(totals.complete, group.keys),
            sumKeys(totals.incomplete, group.keys),
          );
          return (
            <div key={group.titleKey}>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                <span>{t(group.titleKey)}</span>
                <span className="tabular-nums text-muted">{groupEfficiency == null ? "–" : `${groupEfficiency}%`}</span>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {group.keys.map((key) => {
                  const ok = totals.complete[key];
                  const ko = totals.incomplete[key];
                  const pct = gkEfficiency(ok, ko);
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.75rem] items-center gap-2 px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-foreground">{t(GK_LABEL_KEYS[key])}</span>
                      <EfficiencyBar complete={ok} incomplete={ko} />
                      <span className="text-right tabular-nums">
                        <span className="font-semibold text-green-700 dark:text-green-400">{ok}</span>
                        <span className="text-muted"> / </span>
                        <span className="font-semibold text-red-600 dark:text-red-400">{ko}</span>
                      </span>
                      <span className="text-right font-medium tabular-nums">{pct == null ? "–" : `${pct}%`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Several games side by side: overall efficiency, then each group and
// action with ✓ / ✗ and % per game — best % highlighted — plus the pooled %
// of `averageTotals` (e.g. every filtered game).
export function GkComparisonTable({
  columns,
  averageTotals,
}: {
  columns: { key: string; header: ReactNode; totals: GkTotals | null }[];
  averageTotals: (GkTotals | null)[];
}) {
  const t = useTranslations("dashboard");
  const rows: { key: string; label: string; keys: readonly GkCounterKey[]; isGroup: boolean }[] = [
    { key: "all", label: t("gkEfficiencyTitle"), keys: GK_COUNTER_KEYS, isGroup: true },
    ...GK_GROUPS.flatMap((group) => [
      { key: group.titleKey, label: t(group.titleKey), keys: group.keys, isGroup: true },
      ...group.keys.map((k) => ({ key: k, label: t(GK_LABEL_KEYS[k]), keys: [k], isGroup: false })),
    ]),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted">
            <th className="w-[26%] pb-1 text-left font-medium" />
            {columns.map((col) => (
              <th key={col.key} className="pb-1 pl-2 text-left font-medium">
                {col.header}
              </th>
            ))}
            <th className="pb-1 pl-2 text-right font-medium">{t("liveStatsAverageColumn")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const perGame = columns.map((col) => {
              if (!col.totals) return null;
              const ok = sumKeys(col.totals.complete, row.keys);
              const ko = sumKeys(col.totals.incomplete, row.keys);
              return { ok, ko, pct: gkEfficiency(ok, ko) };
            });
            const pcts = perGame.map((p) => p?.pct).filter((p): p is number => p != null);
            const best = pcts.length > 1 ? Math.max(...pcts) : null;
            const bestCount = pcts.filter((p) => p === best).length;
            const pooled = pooledEfficiency(averageTotals, row.keys);
            return (
              <tr key={row.key} className={row.isGroup ? "bg-background/60" : ""}>
                <td className={`py-1.5 pr-2 text-xs ${row.isGroup ? "font-semibold" : "pl-3 text-muted"}`}>{row.label}</td>
                {perGame.map((p, i) => {
                  const isBest = p?.pct != null && p.pct === best && bestCount < pcts.length;
                  return (
                    <td key={columns[i].key} className="py-1.5 pl-2">
                      {p == null ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <span
                          className={`inline-flex items-baseline gap-1.5 rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                            isBest ? "bg-emerald-500/10" : ""
                          }`}
                        >
                          <span>
                            <span className="text-green-700 dark:text-green-400">{p.ok}</span>
                            <span className="text-muted">/</span>
                            <span className="text-red-600 dark:text-red-400">{p.ko}</span>
                          </span>
                          <span className={`font-semibold ${isBest ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                            {isBest && "▲ "}
                            {p.pct == null ? "–" : `${p.pct}%`}
                          </span>
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="py-1.5 pl-2 text-right text-xs tabular-nums text-muted">
                  {pooled == null ? "–" : `${pooled}%`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Efficiency (%) across games, one line — overall or a single group/action.
export function GkEfficiencyChart({
  points,
  selected,
  onSelect,
}: {
  points: { id: string; label: string; opponent: string; totals: GkTotals | null }[];
  selected: string[];
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("dashboard");
  const [scope, setScope] = useState<string>("all");
  const [hover, setHover] = useState<number | null>(null);

  const scopes: { key: string; label: string; keys: readonly GkCounterKey[] }[] = [
    { key: "all", label: t("gkEfficiencyTitle"), keys: GK_COUNTER_KEYS },
    ...GK_GROUPS.map((g) => ({ key: g.titleKey, label: t(g.titleKey), keys: g.keys })),
    ...GK_COUNTER_KEYS.map((k) => ({ key: k, label: t(GK_LABEL_KEYS[k]), keys: [k] as readonly GkCounterKey[] })),
  ];
  const current = scopes.find((s) => s.key === scope) ?? scopes[0];
  const series = points
    .map((p) => ({
      ...p,
      pct: p.totals ? gkEfficiency(sumKeys(p.totals.complete, current.keys), sumKeys(p.totals.incomplete, current.keys)) : null,
    }))
    .filter((p): p is typeof p & { pct: number } => p.pct != null);

  const W = 600;
  const H = 200;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const x = (i: number) => pad.l + (series.length > 1 ? (i * (W - pad.l - pad.r)) / (series.length - 1) : (W - pad.l - pad.r) / 2);
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const hovered = hover != null ? series[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("liveStatsEvolutionTitle")}</h3>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          aria-label={t("liveStatsEvolutionTitle")}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
        >
          {scopes.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {series.length < 2 ? (
        <p className="py-6 text-center text-xs text-muted">—</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" onMouseLeave={() => setHover(null)}>
            {[0, 25, 50, 75, 100].map((tick) => (
              <g key={tick}>
                <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
                <text x={pad.l - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[10px]">
                  {tick}%
                </text>
              </g>
            ))}
            {series.map((p, i) =>
              i % Math.ceil(series.length / 8) === 0 || i === series.length - 1 ? (
                <text key={p.id} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">
                  {p.label}
                </text>
              ) : null,
            )}
            {hover != null && (
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-muted" strokeWidth={1} strokeDasharray="3 3" />
            )}
            <path
              d={series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ")}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              className="stroke-[#2a78d6] dark:stroke-[#3987e5]"
            />
            {series.map((p, i) => {
              const isSel = selected.includes(p.id);
              return (
                <g key={p.id}>
                  <circle
                    cx={x(i)}
                    cy={y(p.pct)}
                    r={isSel || hover === i ? 5.5 : 4}
                    strokeWidth={2}
                    className="fill-[#2a78d6] stroke-surface dark:fill-[#3987e5]"
                  />
                  {isSel && <circle cx={x(i)} cy={y(p.pct)} r={9} fill="none" strokeWidth={1.5} className="stroke-foreground/40" />}
                </g>
              );
            })}
            {series.map((p, i) => {
              const half = (W - pad.l - pad.r) / Math.max(1, series.length - 1) / 2;
              return (
                <rect
                  key={p.id}
                  x={x(i) - half}
                  y={pad.t}
                  width={half * 2}
                  height={H - pad.t - pad.b}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(i)}
                  onClick={() => onSelect(p.id)}
                />
              );
            })}
          </svg>
          {hovered && hover != null && (
            <div
              className="pointer-events-none absolute top-4 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
              style={{ left: `${(x(hover) / W) * 100}%` }}
            >
              <div className="font-semibold">{hovered.opponent}</div>
              <div className="text-muted">{hovered.label}</div>
              <div className="mt-1 font-semibold">
                {current.label}: {hovered.pct}%
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
