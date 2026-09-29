"use client";

import { Fragment, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  emptyGkStatsSide,
  gkEfficiency,
  statOf,
  type GkCounterKey,
  type GkStatsByPlayer,
  type GkStatsSide,
} from "../../live/liveStatsShared";
import { fieldLabel, gkKeysOf, groupLabel, type LiveGkGroup } from "../../live/liveStatConfig";

// The goalkeeper actions and groups a view shows come from the club's
// configured fields (plus any older field the games in view used) — see
// displayGkGroups in liveStatConfig.ts.

const keysOf = (group: LiveGkGroup) => group.fields.map((f) => f.key);

function labelIn(groups: LiveGkGroup[], key: string, t: (k: string) => string): string {
  const f = groups.flatMap((g) => g.fields).find((x) => x.key === key);
  return fieldLabel(f ?? { key, label: null }, t);
}

// Shared goalkeeping views for ASM Live Mode — the club's Estatística tab
// (the team's goalkeeping, whoever was in goal) and a goalkeeper's own
// profile tab (only that keeper).

export type GkTotals = { complete: GkStatsSide; incomplete: GkStatsSide };

export function sumKeys(side: GkStatsSide, keys: readonly GkCounterKey[]) {
  return keys.reduce((sum, key) => sum + statOf(side, key), 0);
}

// Keepers of one game summed (a mid-game change still counts as that
// game's goalkeeping), or null with no Modo GK data.
export function gkTotalsOf(keepers: GkStatsByPlayer[]): GkTotals | null {
  if (!keepers.length) return null;
  const complete = emptyGkStatsSide();
  const incomplete = emptyGkStatsSide();
  const add = (into: GkStatsSide, from: GkStatsSide) => {
    for (const [key, n] of Object.entries(from)) into[key] = (into[key] ?? 0) + n;
  };
  for (const keeper of keepers) {
    add(complete, keeper.stats);
    add(incomplete, keeper.incomplete);
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
  groups,
  showName = true,
}: {
  keeper?: string;
  totals: GkTotals;
  groups: LiveGkGroup[];
  showName?: boolean;
}) {
  const t = useTranslations("dashboard");
  const complete = sumKeys(totals.complete, gkKeysOf(groups));
  const incomplete = sumKeys(totals.incomplete, gkKeysOf(groups));
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
        {groups.map((group) => {
          const groupEfficiency = gkEfficiency(
            sumKeys(totals.complete, keysOf(group)),
            sumKeys(totals.incomplete, keysOf(group)),
          );
          return (
            <div key={group.id}>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold">
                <span>{groupLabel(group, t)}</span>
                <span className="tabular-nums text-muted">{groupEfficiency == null ? "–" : `${groupEfficiency}%`}</span>
              </div>
              <div className="divide-y divide-border rounded-lg border border-border">
                {keysOf(group).map((key) => {
                  const ok = statOf(totals.complete, key);
                  const ko = statOf(totals.incomplete, key);
                  const pct = gkEfficiency(ok, ko);
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_2.75rem] items-center gap-2 px-2.5 py-1.5 text-xs"
                    >
                      <span className="text-foreground">{labelIn(groups, key, t)}</span>
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

const effTone = (pct: number) =>
  pct >= 70 ? "bg-green-600" : pct >= 40 ? "bg-amber-500" : "bg-red-500";

// Comparing goalkeeping across 2–3 games. Leads with one summary card per
// game (overall efficiency, ✓/✗, best one marked), then a table by group —
// each group opens to its actions (or "Ver por ação" opens them all) —
// where every cell is the efficiency with a small bar and the ✓/✗ counts.
export function GkComparisonTable({
  columns,
  averageTotals,
  groups,
}: {
  columns: { key: string; header: ReactNode; totals: GkTotals | null }[];
  averageTotals: (GkTotals | null)[];
  groups: LiveGkGroup[];
}) {
  const t = useTranslations("dashboard");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const allOpen = openGroups.size === groups.length;

  function toggleGroup(key: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const cellsFor = (keys: readonly GkCounterKey[]) => {
    const perGame = columns.map((col) => {
      if (!col.totals) return null;
      const ok = sumKeys(col.totals.complete, keys);
      const ko = sumKeys(col.totals.incomplete, keys);
      return { ok, ko, pct: gkEfficiency(ok, ko) };
    });
    const pcts = perGame.map((p) => p?.pct).filter((p): p is number => p != null);
    const best = pcts.length > 1 ? Math.max(...pcts) : null;
    const bestCount = pcts.filter((p) => p === best).length;
    const isBest = (pct: number | null | undefined) => pct != null && pct === best && bestCount < pcts.length;
    return { perGame, isBest, pooled: pooledEfficiency(averageTotals, keys) };
  };

  function renderCell(p: { ok: number; ko: number; pct: number | null } | null, best: boolean) {
    if (!p || p.pct == null) return <span className="text-xs text-muted">—</span>;
    return (
      <div className="min-w-[4.5rem]">
        <div className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${best ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
          {p.pct}%{best && <span className="text-[10px]">▲</span>}
        </div>
        <div className="mt-1 h-1 w-full max-w-[5rem] overflow-hidden rounded-full bg-border">
          <div className={`h-full rounded-full ${effTone(p.pct)}`} style={{ width: `${p.pct}%` }} />
        </div>
        <div className="mt-0.5 text-[10px] tabular-nums text-muted">
          <span className="text-green-700 dark:text-green-400">✓{p.ok}</span>{" "}
          <span className="text-red-600 dark:text-red-400">✗{p.ko}</span>
        </div>
      </div>
    );
  }

  const overall = cellsFor(gkKeysOf(groups));

  return (
    <div>
      {/* Summary: one card per game + the average. */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length + 1}, minmax(0, 1fr))` }}>
        {columns.map((col, i) => {
          const p = overall.perGame[i];
          const best = overall.isBest(p?.pct);
          return (
            <div
              key={col.key}
              className={`rounded-xl border p-3 ${best ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-background"}`}
            >
              <div className="truncate text-xs font-medium">{col.header}</div>
              {p && p.pct != null ? (
                <>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold tabular-nums">{p.pct}%</span>
                    {best && (
                      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        ▲ {t("gkCompareBest")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                    <div className={`h-full rounded-full ${effTone(p.pct)}`} style={{ width: `${p.pct}%` }} />
                  </div>
                  <div className="mt-1 text-[11px] tabular-nums text-muted">
                    <span className="text-green-700 dark:text-green-400">✓ {p.ok}</span> ·{" "}
                    <span className="text-red-600 dark:text-red-400">✗ {p.ko}</span>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted">{t("gkCompareNoData")}</p>
              )}
            </div>
          );
        })}
        <div className="rounded-xl border border-dashed border-border p-3">
          <div className="text-xs font-medium text-muted">{t("liveStatsAverageColumn")}</div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-muted">
            {overall.pooled == null ? "–" : `${overall.pooled}%`}
          </div>
        </div>
      </div>

      {/* By group (and action). */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("gkCompareByGroup")}</h5>
        <button
          type="button"
          onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.id)))}
          className="text-xs font-medium text-accent hover:underline"
        >
          {allOpen ? t("gkCompareHideActions") : t("gkCompareShowActions")}
        </button>
      </div>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background text-left text-[11px] text-muted">
              <th className="w-[32%] px-3 py-2 font-medium" />
              {columns.map((col) => (
                <th key={col.key} className="px-2 py-2 font-medium">
                  <div className="max-w-[9rem] truncate">{col.header}</div>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">{t("liveStatsAverageColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const open = openGroups.has(group.id);
              const g = cellsFor(keysOf(group));
              return (
                <Fragment key={group.id}>
                  <tr className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        aria-expanded={open}
                        className="flex items-center gap-1.5 text-left text-xs font-semibold hover:text-accent"
                      >
                        <span className={`inline-block text-[10px] text-muted transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                        {groupLabel(group, t)}
                      </button>
                    </td>
                    {g.perGame.map((p, i) => (
                      <td key={columns[i].key} className="px-2 py-2.5 align-top">
                        {renderCell(p, g.isBest(p?.pct))}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right align-top text-xs font-semibold tabular-nums text-muted">
                      {g.pooled == null ? "–" : `${g.pooled}%`}
                    </td>
                  </tr>
                  {open &&
                    keysOf(group).map((key) => {
                      const a = cellsFor([key]);
                      return (
                        <tr key={key} className="border-b border-border bg-background/50 last:border-b-0">
                          <td className="py-2 pl-8 pr-3 text-xs text-muted">{labelIn(groups, key, t)}</td>
                          {a.perGame.map((p, i) => (
                            <td key={columns[i].key} className="px-2 py-2 align-top">
                              {renderCell(p, a.isBest(p?.pct))}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-right align-top text-xs tabular-nums text-muted">
                            {a.pooled == null ? "–" : `${a.pooled}%`}
                          </td>
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">{t("gkCompareLegend")}</p>
    </div>
  );
}

// Efficiency (%) across games, one line — overall or a single group/action.
export function GkEfficiencyChart({
  points,
  selected,
  onSelect,
  groups,
}: {
  points: { id: string; label: string; opponent: string; totals: GkTotals | null }[];
  selected: string[];
  onSelect: (id: string) => void;
  groups: LiveGkGroup[];
}) {
  const t = useTranslations("dashboard");
  const [scope, setScope] = useState<string>("all");
  const [hover, setHover] = useState<number | null>(null);

  const scopes: { key: string; label: string; keys: readonly GkCounterKey[] }[] = [
    { key: "all", label: t("gkEfficiencyTitle"), keys: gkKeysOf(groups) },
    ...groups.map((g) => ({ key: `group:${g.id}`, label: groupLabel(g, t), keys: keysOf(g) })),
    ...gkKeysOf(groups).map((k) => ({ key: k, label: labelIn(groups, k, t), keys: [k] as readonly GkCounterKey[] })),
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
