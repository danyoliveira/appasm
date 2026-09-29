"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { removeDemoLiveGames, simulateLiveGames } from "./liveDemoActions";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import type { CollectiveCounterKey } from "../../live/liveStatsShared";
import {
  displayCollectiveFields,
  displayGkGroups,
  fieldLabel,
  type LiveStatConfig,
} from "../../live/liveStatConfig";
import { Link } from "@/i18n/navigation";
import type { LiveGameStats } from "@/lib/liveMatchHistory";
import type { GkStatsByPlayer } from "../../live/liveStatsShared";
import { GkComparisonTable, GkKeeperBreakdown, gkTotalsOf } from "./gkLiveViews";

type StatKey = "possession" | CollectiveCounterKey;

// A value of one side (missing = 0).
const v = (g: LiveGameStats, side: "us" | "them", key: StatKey) => g[side][key] ?? 0;

// Whether a game had this field at all (fields are configurable and each
// game keeps the set it kicked off with) — a game without it shows "—",
// not 0, and doesn't count in averages.
function gameHas(g: LiveGameStats, key: StatKey) {
  return (
    key === "possession" ||
    g.statConfig.collective.some((f) => f.key === key && f.active) ||
    v(g, "us", key) + v(g, "them", key) > 0
  );
}

const MAX_SELECTED = 3;

// Categorical slots 1–3 of the validated reference palette (all-pairs safe
// in both modes): "us"/"them" in single-game views, and the identity of
// each compared game. Text never wears these — only marks do.
const SLOT = [
  { fill: "bg-[#2a78d6] dark:bg-[#3987e5]", stroke: "stroke-[#2a78d6] dark:stroke-[#3987e5]", svgFill: "fill-[#2a78d6] dark:fill-[#3987e5]" },
  { fill: "bg-[#eb6834] dark:bg-[#d95926]", stroke: "stroke-[#eb6834] dark:stroke-[#d95926]", svgFill: "fill-[#eb6834] dark:fill-[#d95926]" },
  { fill: "bg-[#1baf7a] dark:bg-[#199e70]", stroke: "stroke-[#1baf7a] dark:stroke-[#199e70]", svgFill: "fill-[#1baf7a] dark:fill-[#199e70]" },
];
const US = SLOT[0];
const THEM = SLOT[1];

const RESULT_BADGE: Record<LiveGameStats["result"], string> = {
  W: "bg-green-600 text-white",
  D: "bg-muted text-white",
  L: "bg-red-500 text-white",
};

type Venue = "all" | "home" | "away";
type ResultFilter = "all" | "W" | "D" | "L";

const segmentedClass = "flex rounded-lg border border-border bg-background p-0.5";
const segmentClass = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
  }`;

function average(allGames: LiveGameStats[], side: "us" | "them", key: StatKey) {
  const games = allGames.filter((g) => gameHas(g, key));
  if (!games.length) return null;
  return games.reduce((sum, g) => sum + v(g, side, key), 0) / games.length;
}

function formatValue(key: StatKey, value: number | null) {
  if (value == null) return "–";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return key === "possession" ? `${rounded}%` : rounded;
}

export default function LiveStatsExplorer({
  games,
  isCoach,
  statConfig,
}: {
  games: LiveGameStats[];
  isCoach: boolean;
  // The club's current fields — what's listed, in which order and name.
  statConfig: LiveStatConfig;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [demoError, setDemoError] = useState<string | null>(null);
  const hasDemo = games.some((g) => g.isDemo);

  function simulate() {
    setDemoError(null);
    startTransition(async () => {
      try {
        const { created } = await simulateLiveGames(4);
        if (created === 0) setDemoError(t("liveStatsDemoNone"));
        router.refresh();
      } catch {
        setDemoError(t("liveStatsDemoError"));
      }
    });
  }

  function removeDemo() {
    startTransition(async () => {
      await removeDemoLiveGames();
      setSelected([]);
      router.refresh();
    });
  }

  const demoControls = isCoach ? (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/club/live-config"
        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
      >
        <span aria-hidden>⚙</span>
        {t("liveConfigOpenButton")}
      </Link>
      <button
        type="button"
        disabled={isPending}
        onClick={simulate}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
        {isPending ? t("liveStatsDemoWorking") : t("liveStatsDemoButton")}
      </button>
      {hasDemo && (
        <button
          type="button"
          disabled={isPending}
          onClick={removeDemo}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-red-500 disabled:opacity-50"
        >
          <Icon name="trash" className="h-3.5 w-3.5" />
          {t("liveStatsDemoRemove")}
        </button>
      )}
      {demoError && <span className="text-xs text-red-600 dark:text-red-400">{demoError}</span>}
    </div>
  ) : null;

  const [competition, setCompetition] = useState("");
  const [venue, setVenue] = useState<Venue>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // Possession, then the club's counters plus any older one these games used.
  const collectiveFields = displayCollectiveFields(
    statConfig,
    games.map((g) => g.statConfig),
  );
  const STAT_KEYS: StatKey[] = ["possession", ...collectiveFields.map((f) => f.key)];
  const gkGroups = displayGkGroups(
    statConfig,
    games.map((g) => g.statConfig),
  );
  const [trendStatChoice, setTrendStat] = useState<StatKey>("recovery_opp_half");
  const trendStat = STAT_KEYS.includes(trendStatChoice) ? trendStatChoice : (STAT_KEYS[1] ?? "possession");

  const competitions = useMemo(
    () => [...new Set(games.map((g) => g.competition?.name).filter((n): n is string => !!n))].sort(),
    [games],
  );

  const filtered = games.filter((g) => {
    if (competition && g.competition?.name !== competition) return false;
    if (venue === "home" && !g.isHome) return false;
    if (venue === "away" && g.isHome) return false;
    if (resultFilter !== "all" && g.result !== resultFilter) return false;
    const day = g.date.slice(0, 10);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    return true;
  });
  const newestFirst = [...filtered].reverse();

  const byId = new Map(games.map((g) => [g.sessionId, g]));
  const selectedGames = selected.map((id) => byId.get(id)).filter((g): g is LiveGameStats => !!g);

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

  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short" });
  const label = (key: StatKey) =>
    key === "possession"
      ? t("collectivePossessionLabel")
      : fieldLabel(collectiveFields.find((f) => f.key === key) ?? { key, label: null }, t);

  if (!games.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-12 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted">
          <Icon name="clipboard" />
        </span>
        <p className="text-sm text-muted">{t("liveStatsEmpty")}</p>
        {demoControls && <div className="mt-2">{demoControls}</div>}
      </div>
    );
  }

  // --- Panels ---------------------------------------------------------------

  function renderGameHeader(game: LiveGameStats, slot?: (typeof SLOT)[number], compact = false) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {slot && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${slot.fill}`} />}
        {game.opponent.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.opponent.logo} alt="" className="h-6 w-6 shrink-0 object-contain" />
        ) : (
          <span className="h-6 w-6 shrink-0 rounded-full bg-border" />
        )}
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
            {!compact && game.competition && ` · ${game.competition.name}`}
            {game.isDemo && (
              <span className="rounded bg-amber-500/15 px-1 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400">
                demo
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Our goalkeeper(s) in this game (Modo GK), one breakdown per keeper.
  function renderGkSection(keepers: GkStatsByPlayer[]) {
    if (!keepers.length) return null;
    return (
      <div className="space-y-4 border-t border-border pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("gkStatsTitle")}</h4>
        {keepers.map((keeper) => (
          <GkKeeperBreakdown
            key={keeper.name}
            keeper={keeper.name}
            totals={{ complete: keeper.stats, incomplete: keeper.incomplete }}
            groups={gkGroups}
          />
        ))}
      </div>
    );
  }

  function renderSingle(game: LiveGameStats) {
    return (
      <div className="space-y-4">
        {renderGameHeader(game)}
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${US.fill}`} />
            {t("liveStatsUs")}
          </span>
          <span className="flex items-center gap-1.5">
            {t("liveStatsThem")}
            <span className={`h-2 w-2 rounded-full ${THEM.fill}`} />
          </span>
        </div>
        <div className="space-y-3">
          {STAT_KEYS.filter((key) => gameHas(game, key)).map((key) => {
            const us = v(game, "us", key);
            const them = v(game, "them", key);
            const total = us + them;
            const usShare = total > 0 ? (us / total) * 100 : 50;
            const avg = average(filtered, "us", key);
            const diff = avg != null ? us - avg : null;
            return (
              <div key={key}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold tabular-nums">{formatValue(key, us)}</span>
                  <span className="text-center text-xs text-muted">{label(key)}</span>
                  <span className="font-semibold tabular-nums">{formatValue(key, them)}</span>
                </div>
                <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                  <div className={`${US.fill} rounded-l-full`} style={{ width: `${usShare}%` }} />
                  <div className={`${THEM.fill} flex-1 rounded-r-full`} />
                </div>
                {diff != null && filtered.length > 1 && Math.abs(diff) >= 0.05 && (
                  <div className="mt-0.5 text-[11px] text-muted">
                    <span className={diff > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                      {diff > 0 ? "▲" : "▼"} {formatValue(key, Math.abs(Math.round(diff * 10) / 10))}
                    </span>{" "}
                    {t("liveStatsVsAverage")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {renderGkSection(game.gk)}
      </div>
    );
  }

  function renderComparison() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="align-bottom">
              <th className="w-[26%] pb-3 text-left text-xs font-medium text-muted" />
              {selectedGames.map((g, i) => (
                <th key={g.sessionId} className="pb-3 pl-2 text-left font-normal">
                  {renderGameHeader(g, SLOT[i], true)}
                </th>
              ))}
              <th className="pb-3 pl-2 text-right text-xs font-medium text-muted">{t("liveStatsAverageColumn")}</th>
            </tr>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th />
              {selectedGames.map((g) => (
                <th key={g.sessionId} className="pb-1 pl-2 text-left font-medium">
                  {t("liveStatsUs")} / {t("liveStatsThem")}
                </th>
              ))}
              <th className="pb-1 pl-2 text-right font-medium">{t("liveStatsUs")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {STAT_KEYS.map((key) => {
              const withField = selectedGames.filter((g) => gameHas(g, key));
              const best = Math.max(...withField.map((g) => v(g, "us", key)));
              const bestCount = withField.filter((g) => v(g, "us", key) === best).length;
              return (
                <tr key={key}>
                  <td className="py-2 pr-2 text-xs text-muted">{label(key)}</td>
                  {selectedGames.map((g) => {
                    const isBest = gameHas(g, key) && v(g, "us", key) === best && bestCount < withField.length;
                    if (!gameHas(g, key)) {
                      return (
                        <td key={g.sessionId} className="py-2 pl-2 text-xs text-muted">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={g.sessionId} className="py-2 pl-2">
                        <span
                          className={`inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 tabular-nums ${
                            isBest ? "bg-emerald-500/10" : ""
                          }`}
                        >
                          <span className={`font-semibold ${isBest ? "text-emerald-700 dark:text-emerald-400" : ""}`}>
                            {isBest && "▲ "}
                            {formatValue(key, v(g, "us", key))}
                          </span>
                          <span className="text-xs text-muted">/ {formatValue(key, v(g, "them", key))}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-2 pl-2 text-right text-xs tabular-nums text-muted">
                    {formatValue(key, average(filtered, "us", key))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {renderGkComparison()}
      </div>
    );
  }

  // The team's goalkeeping across the selected games (whoever was in goal).
  function renderGkComparison() {
    const totals = selectedGames.map((g) => gkTotalsOf(g.gk));
    if (totals.every((tot) => tot == null)) return null;
    return (
      <div className="mt-6 border-t border-border pt-4">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("gkStatsTitle")}</h4>
        <GkComparisonTable
          columns={selectedGames.map((g, i) => ({
            key: g.sessionId,
            totals: totals[i],
            header: (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${SLOT[i].fill}`} />
                <span className="truncate">{g.opponent.name}</span>
              </span>
            ),
          }))}
          averageTotals={filtered.map((g) => gkTotalsOf(g.gk))}
          groups={gkGroups}
        />
      </div>
    );
  }

  function renderPanelHeader(title: string) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {selectedGames.length > 0 && (
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
        )}
      </div>
    );
  }

  const comparing = selectedGames.length >= 2;

  function renderAverages() {
    const groups: { key: string; label: string; games: LiveGameStats[] }[] = [
      { key: "all", label: t("liveStatsAvgAll"), games: filtered },
      { key: "home", label: t("homeLabel"), games: filtered.filter((g) => g.isHome) },
      { key: "away", label: t("awayLabel"), games: filtered.filter((g) => !g.isHome) },
      { key: "W", label: t("liveStatsAvgWins"), games: filtered.filter((g) => g.result === "W") },
      { key: "L", label: t("liveStatsAvgLosses"), games: filtered.filter((g) => g.result === "L") },
    ];
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th className="pb-2 text-left font-medium" />
              {groups.map((grp) => (
                <th key={grp.key} className="pb-2 pl-2 text-right font-medium">
                  {grp.label}
                  <div className="font-normal normal-case tracking-normal">({grp.games.length})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {STAT_KEYS.map((key) => (
              <tr key={key}>
                <td className="py-2 pr-2 text-xs text-muted">{label(key)}</td>
                {groups.map((grp) => (
                  <td key={grp.key} className="py-2 pl-2 text-right tabular-nums">
                    <span className="font-semibold">{formatValue(key, average(grp.games, "us", key) != null ? Math.round(average(grp.games, "us", key)! * 10) / 10 : null)}</span>
                    <div className="text-[11px] text-muted">
                      {formatValue(key, average(grp.games, "them", key) != null ? Math.round(average(grp.games, "them", key)! * 10) / 10 : null)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted">{t("liveStatsAvgLegend")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
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
            <button
              key={r}
              type="button"
              onClick={() => setResultFilter(r)}
              title={r === "all" ? undefined : t(`liveStatsResult${r}`)}
              className={segmentClass(resultFilter === r)}
            >
              {r === "all" ? t("liveStatsAll") : t(`liveStatsResultShort${r}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label={t("dossierFromLabel")}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
          />
          →
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label={t("dossierToLabel")}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
          />
        </div>
        <span className="ml-auto text-xs font-medium text-muted">
          {t("liveStatsGamesCount", { count: filtered.length })}
        </span>
        {demoControls && <div className="w-full border-t border-border pt-2">{demoControls}</div>}
      </div>

      {comparing && (
        <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          {renderPanelHeader(t("liveStatsCompareTitle"))}
          {renderComparison()}
        </section>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Game list */}
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
                const slotIndex = selected.indexOf(g.sessionId);
                const isSelected = slotIndex >= 0;
                return (
                  <button
                    key={g.sessionId}
                    type="button"
                    onClick={() => toggle(g.sessionId)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isSelected ? "border-accent bg-accent/5" : "border-transparent hover:bg-background"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold text-white ${
                        isSelected ? `${SLOT[slotIndex].fill} border-transparent` : "border-border"
                      }`}
                    >
                      {isSelected ? slotIndex + 1 : ""}
                    </span>
                    <div className="min-w-0 flex-1">{renderGameHeader(g, undefined, true)}</div>
                    <div className="hidden shrink-0 text-right text-[11px] leading-tight text-muted sm:block lg:hidden xl:block">
                      <div>
                        <span className="font-semibold text-foreground">{g.us.possession}%</span> {t("liveStatsPossessionShort")}
                      </div>
                      <div>
                        <span className="font-semibold text-foreground">{g.us.recovery_opp_half}</span> {t("liveStatsRecOppShort")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail / comparison / averages */}
        <div className="space-y-4 lg:sticky lg:top-4">
          {!comparing && (
            <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              {renderPanelHeader(
                selectedGames.length === 1 ? t("liveStatsGameTitle") : t("liveStatsAveragesTitle"),
              )}
              {selectedGames.length === 1 ? renderSingle(selectedGames[0]) : renderAverages()}
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("liveStatsEvolutionTitle")}</h3>
              <select
                value={trendStat}
                onChange={(e) => setTrendStat(e.target.value as StatKey)}
                aria-label={t("liveStatsEvolutionTitle")}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-accent"
              >
                {STAT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {label(key)}
                  </option>
                ))}
              </select>
            </div>
            <TrendChart
              games={filtered}
              statKey={trendStat}
              selected={selected}
              usLabel={t("liveStatsUs")}
              themLabel={t("liveStatsThem")}
              dayLabel={dayLabel}
              onSelect={toggle}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

// Line chart of one stat across the filtered games (chronological): our
// value and the opponent's, with a crosshair + tooltip on hover. Selected
// games get a larger marker so the chart and list read as one.
function TrendChart({
  games: allGames,
  statKey,
  selected,
  usLabel,
  themLabel,
  dayLabel,
  onSelect,
}: {
  games: LiveGameStats[];
  statKey: StatKey;
  selected: string[];
  usLabel: string;
  themLabel: string;
  dayLabel: (iso: string) => string;
  onSelect: (id: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const games = allGames.filter((g) => gameHas(g, statKey));
  if (games.length < 2) {
    return <p className="py-6 text-center text-xs text-muted">—</p>;
  }

  const W = 600;
  const H = 200;
  const pad = { l: 32, r: 12, t: 12, b: 26 };
  const values = games.flatMap((g) => [v(g, "us", statKey), v(g, "them", statKey)]);
  const rawMax = Math.max(1, ...values);
  const step = rawMax <= 5 ? 1 : rawMax <= 20 ? 5 : rawMax <= 50 ? 10 : 25;
  const max = Math.ceil(rawMax / step) * step;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step).filter(
    (_, i, arr) => arr.length <= 5 || i % Math.ceil(arr.length / 5) === 0,
  );
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (games.length - 1);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = (side: "us" | "them") =>
    games.map((g, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v(g, side, statKey)).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(games.length / 8);
  const unit = statKey === "possession" ? "%" : "";
  const hovered = hover != null ? games[hover] : null;

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className={`h-0.5 w-4 rounded ${US.fill}`} />
          {usLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-0.5 w-4 rounded ${THEM.fill}`} />
          {themLabel}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={1} />
            <text x={pad.l - 6} y={y(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[10px]">
              {tick}
              {unit}
            </text>
          </g>
        ))}
        {games.map((g, i) =>
          i % labelEvery === 0 || i === games.length - 1 ? (
            <text key={g.sessionId} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[10px]">
              {dayLabel(g.date)}
            </text>
          ) : null,
        )}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-muted" strokeWidth={1} strokeDasharray="3 3" />
        )}
        <path d={path("them")} fill="none" strokeWidth={2} strokeLinejoin="round" className={THEM.stroke} />
        <path d={path("us")} fill="none" strokeWidth={2} strokeLinejoin="round" className={US.stroke} />
        {games.map((g, i) => {
          const isSel = selected.includes(g.sessionId);
          const r = isSel || hover === i ? 5.5 : 4;
          return (
            <g key={g.sessionId}>
              <circle cx={x(i)} cy={y(v(g, "them", statKey))} r={r} strokeWidth={2} className={`${THEM.svgFill} stroke-surface`} />
              <circle cx={x(i)} cy={y(v(g, "us", statKey))} r={r} strokeWidth={2} className={`${US.svgFill} stroke-surface`} />
              {isSel && (
                <circle cx={x(i)} cy={y(v(g, "us", statKey))} r={9} fill="none" strokeWidth={1.5} className="stroke-foreground/40" />
              )}
            </g>
          );
        })}
        {/* Hit targets wider than the marks: one column per game. */}
        {games.map((g, i) => {
          const half = games.length > 1 ? (W - pad.l - pad.r) / (games.length - 1) / 2 : 20;
          return (
            <rect
              key={g.sessionId}
              x={x(i) - half}
              y={pad.t}
              width={half * 2}
              height={H - pad.t - pad.b}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHover(i)}
              onClick={() => onSelect(g.sessionId)}
            />
          );
        })}
      </svg>
      {hovered && hover != null && (
        <div
          className="pointer-events-none absolute top-6 z-10 -translate-x-1/2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <div className="font-semibold">{hovered.opponent.name}</div>
          <div className="text-muted">{dayLabel(hovered.date)}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${US.fill}`} />
            {usLabel}: <span className="font-semibold">{formatValue(statKey, v(hovered, "us", statKey))}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${THEM.fill}`} />
            {themLabel}: <span className="font-semibold">{formatValue(statKey, v(hovered, "them", statKey))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
