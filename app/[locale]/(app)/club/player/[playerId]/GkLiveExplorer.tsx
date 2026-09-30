"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import TeamCrest from "@/components/TeamCrest";
import type { LiveGameStats } from "@/lib/liveMatchHistory";
import { emptyGkStatsSide, gkEfficiency } from "../../../../live/liveStatsShared";
import { displayGkGroups, gkKeysOf, type LiveStatConfig } from "../../../../live/liveStatConfig";
import {
  GkComparisonTable,
  GkEfficiencyChart,
  GkKeeperBreakdown,
  gkTotalsOf,
  sumKeys,
  type GkTotals,
} from "../../gkLiveViews";

const MAX_SELECTED = 3;
const SLOT_DOT = [
  "bg-[#2a78d6] dark:bg-[#3987e5]",
  "bg-[#eb6834] dark:bg-[#d95926]",
  "bg-[#1baf7a] dark:bg-[#199e70]",
];
const RESULT_BADGE: Record<LiveGameStats["result"], string> = {
  W: "bg-green-600 text-white",
  D: "bg-muted text-white",
  L: "bg-red-500 text-white",
};

const segmentedClass = "flex rounded-lg border border-border bg-background p-0.5";
const segmentClass = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
  }`;

function sumTotals(list: (GkTotals | null)[]): GkTotals {
  const complete = emptyGkStatsSide();
  const incomplete = emptyGkStatsSide();
  for (const tot of list) {
    if (!tot) continue;
    for (const [key, n] of Object.entries(tot.complete)) complete[key] = (complete[key] ?? 0) + n;
    for (const [key, n] of Object.entries(tot.incomplete)) incomplete[key] = (incomplete[key] ?? 0) + n;
  }
  return { complete, incomplete };
}

// A goalkeeper's own ASM Live Mode history: only the games (and, in a game
// with a keeper change, only the part) he played — same layout as the club's
// Estatística → ASM Live Mode: list on one side, averages / one game /
// comparison of up to 3 on the other, and the efficiency trend.
export default function GkLiveExplorer({
  games,
  statConfig,
}: {
  games: LiveGameStats[];
  // The club's current fields (plus any older one these games used).
  statConfig: LiveStatConfig;
}) {
  const t = useTranslations("dashboard");
  const groups = displayGkGroups(
    statConfig,
    games.map((g) => g.statConfig),
  );
  const allKeys = gkKeysOf(groups);
  const locale = useLocale();
  const [competition, setCompetition] = useState("");
  const [venue, setVenue] = useState<"all" | "home" | "away">("all");
  const [resultFilter, setResultFilter] = useState<"all" | "W" | "D" | "L">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const competitions = useMemo(
    () => [...new Set(games.map((g) => g.competition?.name).filter((n): n is string => !!n))].sort(),
    [games],
  );

  if (!games.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted">
          <Icon name="clipboard" />
        </span>
        <p className="max-w-sm text-sm text-muted">{t("gkLiveEmpty")}</p>
      </div>
    );
  }

  const filtered = games.filter(
    (g) =>
      (!competition || g.competition?.name === competition) &&
      (venue === "all" || (venue === "home") === g.isHome) &&
      (resultFilter === "all" || g.result === resultFilter),
  );
  const newestFirst = [...filtered].reverse();
  const byId = new Map(games.map((g) => [g.sessionId, g]));
  const selectedGames = selected.map((id) => byId.get(id)).filter((g): g is LiveGameStats => !!g);
  const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short" });

  function toggle(id: string) {
    setNotice(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTED) {
        setNotice(t("liveStatsMaxSelected"));
        return prev;
      }
      return [...prev, id];
    });
  }

  function renderGameLine(game: LiveGameStats, dot?: string) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {dot && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />}
        <TeamCrest logo={game.opponent.logo} className="h-6 w-6" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {game.opponent.name}{" "}
            <span className="font-normal text-muted">({game.isHome ? t("homeLabel") : t("awayLabel")})</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`rounded px-1 text-[10px] font-bold ${RESULT_BADGE[game.result]}`}>
              {game.goalsFor}-{game.goalsAgainst}
            </span>
            {dayLabel(game.date)}
          </div>
        </div>
      </div>
    );
  }

  const clearButton =
    selectedGames.length > 0 ? (
      <button
        type="button"
        onClick={() => {
          setSelected([]);
          setNotice(null);
        }}
        className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
      >
        <Icon name="x" className="h-3.5 w-3.5" />
        {t("liveStatsClearSelection")}
      </button>
    ) : null;

  const comparing = selectedGames.length >= 2;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        {competitions.length > 1 && (
          <select
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            aria-label={t("columnCompetition")}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
          >
            <option value="">{t("liveStatsAllCompetitions")}</option>
            {competitions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <div className={segmentedClass}>
          {(["all", "home", "away"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setVenue(v)} className={segmentClass(venue === v)}>
              {v === "all" ? t("liveStatsAll") : v === "home" ? t("homeLabel") : t("awayLabel")}
            </button>
          ))}
        </div>
        <div className={segmentedClass}>
          {(["all", "W", "D", "L"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setResultFilter(r)} className={segmentClass(resultFilter === r)}>
              {r === "all" ? t("liveStatsAll") : t(`liveStatsResultShort${r}`)}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs font-medium text-muted">
          {t("liveStatsGamesCount", { count: filtered.length })}
        </span>
      </div>

      {comparing && (
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("liveStatsCompareTitle")}</h3>
            {clearButton}
          </div>
          <div className="mb-3 flex flex-wrap gap-4">
            {selectedGames.map((g, i) => (
              <div key={g.sessionId}>{renderGameLine(g, SLOT_DOT[i])}</div>
            ))}
          </div>
          <GkComparisonTable
            groups={groups}
            columns={selectedGames.map((g, i) => ({
              key: g.sessionId,
              totals: gkTotalsOf(g.gk),
              header: (
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${SLOT_DOT[i]}`} />
                  <span className="truncate">{g.opponent.name}</span>
                </span>
              ),
            }))}
            averageTotals={filtered.map((g) => gkTotalsOf(g.gk))}
          />
        </section>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
          <p className="px-2 pb-2 pt-1 text-xs text-muted">{t("liveStatsSelectHint")}</p>
          {notice && (
            <p className="mx-2 mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {notice}
            </p>
          )}
          {newestFirst.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted">{t("liveStatsNoMatches")}</p>
          ) : (
            <div className="max-h-[640px] space-y-1 overflow-y-auto">
              {newestFirst.map((g) => {
                const slot = selected.indexOf(g.sessionId);
                const totals = gkTotalsOf(g.gk);
                const pct = totals
                  ? gkEfficiency(sumKeys(totals.complete, allKeys), sumKeys(totals.incomplete, allKeys))
                  : null;
                return (
                  <button
                    key={g.sessionId}
                    type="button"
                    onClick={() => toggle(g.sessionId)}
                    aria-pressed={slot >= 0}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      slot >= 0 ? "border-accent bg-accent/5" : "border-transparent hover:bg-background"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold text-white ${
                        slot >= 0 ? `${SLOT_DOT[slot]} border-transparent` : "border-border"
                      }`}
                    >
                      {slot >= 0 ? slot + 1 : ""}
                    </span>
                    <div className="min-w-0 flex-1">{renderGameLine(g)}</div>
                    {pct != null && (
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums">{pct}%</div>
                        <div className="text-[10px] text-muted">{t("gkEfficiencyTitle").toLowerCase()}</div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          {!comparing && (
            <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {selectedGames.length === 1 ? t("liveStatsGameTitle") : t("liveStatsAveragesTitle")}
                </h3>
                {clearButton}
              </div>
              {selectedGames.length === 1 ? (
                <div className="space-y-3">
                  {renderGameLine(selectedGames[0])}
                  {gkTotalsOf(selectedGames[0].gk) && (
                    <GkKeeperBreakdown groups={groups} totals={gkTotalsOf(selectedGames[0].gk)!} showName={false} />
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted">{t("gkLiveAveragesHint", { count: filtered.length })}</p>
                  <GkKeeperBreakdown groups={groups} totals={sumTotals(filtered.map((g) => gkTotalsOf(g.gk)))} showName={false} />
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <GkEfficiencyChart
              groups={groups}
              points={filtered.map((g) => ({
                id: g.sessionId,
                label: dayLabel(g.date),
                opponent: g.opponent.name,
                totals: gkTotalsOf(g.gk),
              }))}
              selected={selected}
              onSelect={toggle}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
