"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  setPlayerAvailability,
  setPlayerExcluded,
  resolveApiInjury,
  type PlayerStatus,
} from "../actions";
import type { SquadPlayer } from "@/lib/api-football/client";
import {
  translatePosition,
  shortenPlayerName,
  StatusControl,
  InjuryConfirmBanner,
  type AvailabilityInfo,
  type PendingInjury,
  type PlayerSeasonStat,
} from "./playerShared";

export type { AvailabilityInfo, PendingInjury, PlayerSeasonStat };

type SortKey =
  | "name"
  | "position"
  | "appearances"
  | "minutes"
  | "goals"
  | "assists"
  | "saves"
  | "conceded";
// key: null means "default order" (a fixed multi-level sort), not tied to
// any single clickable column. Clicking a header switches to that column.
type SortState = { key: SortKey | null; dir: "asc" | "desc" };

const TEXT_SORT_KEYS: SortKey[] = ["name", "position"];

// Tactical order (defence → midfield → attack) rather than alphabetical.
const POSITION_ORDER: Record<string, number> = {
  Defender: 0,
  Midfielder: 1,
  Attacker: 2,
};

function sortValue(
  player: SquadPlayer,
  key: SortKey,
  stats: PlayerSeasonStat | undefined,
  t: (key: string) => string,
): string | number {
  switch (key) {
    case "name":
      return player.name.toLowerCase();
    case "position":
      return POSITION_ORDER[player.position] ?? 99;
    case "appearances":
      return stats?.appearances ?? 0;
    case "minutes":
      return stats?.minutes ?? 0;
    case "goals":
      return stats?.goals ?? 0;
    case "assists":
      return stats?.assists ?? 0;
    case "saves":
      return stats?.saves ?? 0;
    case "conceded":
      return stats?.conceded ?? 0;
  }
}

// Default order (before any header is clicked): outfield players go
// position (tactical order) → minutes (most first) → name; goalkeepers
// just go minutes (most first) → name.
function defaultCompare(
  a: SquadPlayer,
  b: SquadPlayer,
  statsByPlayerId: Map<number, PlayerSeasonStat>,
  isGoalkeeperTable: boolean,
): number {
  if (!isGoalkeeperTable) {
    const posDiff =
      (POSITION_ORDER[a.position] ?? 99) - (POSITION_ORDER[b.position] ?? 99);
    if (posDiff !== 0) return posDiff;
  }
  const minutesDiff =
    (statsByPlayerId.get(b.id)?.minutes ?? 0) - (statsByPlayerId.get(a.id)?.minutes ?? 0);
  if (minutesDiff !== 0) return minutesDiff;
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

function sortPlayers(
  list: SquadPlayer[],
  sort: SortState,
  statsByPlayerId: Map<number, PlayerSeasonStat>,
  t: (key: string) => string,
  isGoalkeeperTable: boolean,
): SquadPlayer[] {
  if (sort.key === null) {
    return [...list].sort((a, b) => defaultCompare(a, b, statsByPlayerId, isGoalkeeperTable));
  }
  const sorted = [...list].sort((a, b) => {
    const va = sortValue(a, sort.key as SortKey, statsByPlayerId.get(a.id), t);
    const vb = sortValue(b, sort.key as SortKey, statsByPlayerId.get(b.id), t);
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb);
    return (va as number) - (vb as number);
  });
  return sort.dir === "asc" ? sorted : sorted.reverse();
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "center";
}) {
  const isActive = currentSort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 hover:text-foreground ${
        align === "center" ? "text-center" : "text-left"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={isActive ? "text-foreground" : "text-muted/30"}>
          {isActive && currentSort.dir === "desc" ? "▼" : "▲"}
        </span>
      </span>
    </th>
  );
}

function useSortState() {
  const [sort, setSort] = useState<SortState>({ key: null, dir: "asc" });
  function onSort(key: SortKey) {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      // Numeric stat columns feel more useful sorted highest-first by default.
      return { key, dir: TEXT_SORT_KEYS.includes(key) ? "asc" : "desc" };
    });
  }
  return [sort, onSort] as const;
}

type ViewMode = "cards" | "table";

export default function SquadSection({
  teamId,
  players,
  availabilityByPlayerId,
  injuriesByPlayerId,
  statsByPlayerId,
  flagUrlByPlayerId,
  isCoach,
}: {
  teamId: number;
  players: SquadPlayer[];
  availabilityByPlayerId: Map<number, AvailabilityInfo>;
  injuriesByPlayerId: Map<number, PendingInjury>;
  statsByPlayerId: Map<number, PlayerSeasonStat>;
  flagUrlByPlayerId: Map<number, string | null>;
  isCoach: boolean;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nameFilter, setNameFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [outfieldSort, onOutfieldSort] = useSortState();
  const [gkSort, onGkSort] = useSortState();

  const distinctPositions = useMemo(
    () => Array.from(new Set(players.map((p) => p.position))),
    [players],
  );

  const excludedCount = useMemo(
    () => players.filter((p) => availabilityByPlayerId.get(p.id)?.excluded).length,
    [players, availabilityByPlayerId],
  );

  // If the last excluded player just got restored, jump back to the main
  // squad view instead of leaving the coach stranded on an empty list with
  // no toggle left to click.
  useEffect(() => {
    if (excludedCount === 0 && showExcluded) setShowExcluded(false);
  }, [excludedCount, showExcluded]);

  const filteredPlayers = useMemo(() => {
    const needle = nameFilter.trim().toLowerCase();
    return players.filter((p) => {
      const isExcluded = availabilityByPlayerId.get(p.id)?.excluded ?? false;
      if (isExcluded !== showExcluded) return false;
      const matchesName = !needle || p.name.toLowerCase().includes(needle);
      const matchesPosition = !positionFilter || p.position === positionFilter;
      return matchesName && matchesPosition;
    });
  }, [players, nameFilter, positionFilter, showExcluded, availabilityByPlayerId]);

  const outfieldPlayers = useMemo(
    () =>
      sortPlayers(
        filteredPlayers.filter((p) => p.position !== "Goalkeeper"),
        outfieldSort,
        statsByPlayerId,
        t,
        false,
      ),
    [filteredPlayers, outfieldSort, statsByPlayerId, t],
  );

  const goalkeepers = useMemo(
    () =>
      sortPlayers(
        filteredPlayers.filter((p) => p.position === "Goalkeeper"),
        gkSort,
        statsByPlayerId,
        t,
        true,
      ),
    [filteredPlayers, gkSort, statsByPlayerId, t],
  );

  function handleStatusChange(player: SquadPlayer, status: PlayerStatus) {
    startTransition(async () => {
      await setPlayerAvailability(teamId, player.id, player.name, status);
      router.refresh();
    });
  }

  function handleExcludeToggle(player: SquadPlayer, excluded: boolean) {
    startTransition(async () => {
      await setPlayerExcluded(teamId, player.id, player.name, excluded);
      router.refresh();
    });
  }

  function handleResolveInjury(player: SquadPlayer, injuryKey: string, isReal: boolean) {
    startTransition(async () => {
      await resolveApiInjury(teamId, player.id, player.name, injuryKey, isReal);
      router.refresh();
    });
  }

  function renderStatusCell(player: SquadPlayer) {
    const availability = availabilityByPlayerId.get(player.id);
    const status: PlayerStatus = availability?.status ?? "available";
    const pendingInjury = injuriesByPlayerId.get(player.id);
    const needsConfirmation =
      pendingInjury && pendingInjury.key !== availability?.lastSeenInjuryKey;

    return (
      <div className="flex flex-col gap-2">
        <StatusControl
          status={status}
          isCoach={isCoach}
          isPending={isPending}
          onChange={(next) => handleStatusChange(player, next)}
          t={t}
        />
        {isCoach && needsConfirmation && pendingInjury && (
          <InjuryConfirmBanner
            pendingInjury={pendingInjury}
            isPending={isPending}
            onResolve={(isReal) => handleResolveInjury(player, pendingInjury.key, isReal)}
            t={t}
          />
        )}
      </div>
    );
  }

  function renderPlayerCard(player: SquadPlayer) {
    const stats = statsByPlayerId.get(player.id);
    const isGoalkeeper = player.position === "Goalkeeper";

    return (
      <div
        key={player.id}
        className="relative flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent/40"
      >
        {isCoach && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleExcludeToggle(player, !showExcluded)}
            title={showExcluded ? t("restorePlayerButton") : t("excludePlayerButton")}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-sm leading-none text-muted transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-50"
          >
            {showExcluded ? "+" : "×"}
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={player.photo}
              alt=""
              className="h-14 w-14 rounded-full object-cover ring-2 ring-background"
            />
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground ring-2 ring-surface">
              {player.number ?? "-"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/dashboard/clube/jogador/${player.id}`}
              className="block truncate text-sm font-semibold hover:text-accent hover:underline"
            >
              {shortenPlayerName(player.name)}
            </Link>
            <span className="mt-1 block w-fit rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              {translatePosition(player.position, t)}
            </span>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-background p-2 text-center">
            <div>
              <div className="text-sm font-semibold">{stats.appearances}</div>
              <div className="text-[9px] uppercase tracking-wide text-muted">
                {t("playerStatAppearances")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">{stats.minutes}</div>
              <div className="text-[9px] uppercase tracking-wide text-muted">
                {t("playerStatMinutes")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">
                {isGoalkeeper ? stats.saves : stats.goals}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted">
                {isGoalkeeper ? t("playerStatSaves") : t("playerStatGoals")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">
                {isGoalkeeper ? stats.conceded : stats.assists}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted">
                {isGoalkeeper ? t("playerStatConceded") : t("playerStatAssists")}
              </div>
            </div>
          </div>
        )}

        {renderStatusCell(player)}
      </div>
    );
  }

  function renderTable(
    list: SquadPlayer[],
    sort: SortState,
    onSort: (key: SortKey) => void,
    isGoalkeeperTable: boolean,
  ) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-background text-xs uppercase tracking-wide text-muted">
                <SortableHeader
                  label={t("squadColumnPlayer")}
                  sortKey="name"
                  currentSort={sort}
                  onSort={onSort}
                />
                <th className="w-6 px-1 py-2 text-left">
                  <span className="sr-only">{t("squadColumnFlag")}</span>
                </th>
                {!isGoalkeeperTable && (
                  <SortableHeader
                    label={t("squadColumnPosition")}
                    sortKey="position"
                    currentSort={sort}
                    onSort={onSort}
                  />
                )}
                <SortableHeader
                  label={t("playerStatAppearances")}
                  sortKey="appearances"
                  currentSort={sort}
                  onSort={onSort}
                  align="center"
                />
                <SortableHeader
                  label={t("playerStatMinutes")}
                  sortKey="minutes"
                  currentSort={sort}
                  onSort={onSort}
                  align="center"
                />
                <SortableHeader
                  label={isGoalkeeperTable ? t("playerStatSaves") : t("playerStatGoals")}
                  sortKey={isGoalkeeperTable ? "saves" : "goals"}
                  currentSort={sort}
                  onSort={onSort}
                  align="center"
                />
                <SortableHeader
                  label={isGoalkeeperTable ? t("playerStatConceded") : t("playerStatAssists")}
                  sortKey={isGoalkeeperTable ? "conceded" : "assists"}
                  currentSort={sort}
                  onSort={onSort}
                  align="center"
                />
                <th className="px-2 py-2 text-left">{t("squadColumnStatus")}</th>
                {isCoach && (
                  <th className="w-8 px-1 py-2 text-left">
                    <span className="sr-only">{t("squadColumnActions")}</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((player) => {
                const stats = statsByPlayerId.get(player.id);
                const flagUrl = flagUrlByPlayerId.get(player.id);
                return (
                  <tr
                    key={player.id}
                    className="odd:bg-surface even:bg-background/60 transition-colors hover:bg-accent/5"
                  >
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="relative shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={player.photo}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                          <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[7px] font-bold text-accent-foreground ring-2 ring-surface">
                            {player.number ?? "-"}
                          </span>
                        </div>
                        <Link
                          href={`/dashboard/clube/jogador/${player.id}`}
                          className="truncate font-medium hover:text-accent hover:underline"
                        >
                          {shortenPlayerName(player.name)}
                        </Link>
                      </div>
                    </td>
                    <td className="px-1 py-2">
                      {flagUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={flagUrl} alt="" className="h-3.5 w-5 rounded-sm object-cover" />
                      )}
                    </td>
                    {!isGoalkeeperTable && (
                      <td className="px-2 py-2">
                        <span className="inline-block rounded-full bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">
                          {translatePosition(player.position, t)}
                        </span>
                      </td>
                    )}
                    <td className="px-2 py-2 text-center">{stats?.appearances ?? "-"}</td>
                    <td className="px-2 py-2 text-center font-semibold">
                      {stats?.minutes ?? "-"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {stats ? (isGoalkeeperTable ? stats.saves : stats.goals) : "-"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {stats ? (isGoalkeeperTable ? stats.conceded : stats.assists) : "-"}
                    </td>
                    <td className="px-2 py-2">{renderStatusCell(player)}</td>
                    {isCoach && (
                      <td className="px-1 py-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleExcludeToggle(player, !showExcluded)}
                          title={showExcluded ? t("restorePlayerButton") : t("excludePlayerButton")}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs leading-none text-muted transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-50"
                        >
                          {showExcluded ? "+" : "×"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          placeholder={t("squadFilterPlaceholder")}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent sm:max-w-xs"
        />

        <div className="flex shrink-0 rounded-full border border-border p-0.5">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              view === "cards" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t("squadViewCards")}
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              view === "table" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t("squadViewTable")}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPositionFilter(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            positionFilter === null
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          {t("allPositions")}
        </button>
        {distinctPositions.map((pos) => (
          <button
            key={pos}
            type="button"
            onClick={() => setPositionFilter(pos)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              positionFilter === pos
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {translatePosition(pos, t)}
          </button>
        ))}
        {isCoach && (excludedCount > 0 || showExcluded) && (
          <button
            type="button"
            onClick={() => setShowExcluded((v) => !v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              showExcluded
                ? "border-red-500 bg-red-500/10 text-red-500"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {t("excludedPlayersFilter", { count: excludedCount })}
          </button>
        )}
      </div>

      {filteredPlayers.length === 0 ? (
        <p className="text-sm text-muted">{t("noPlayersFound")}</p>
      ) : view === "cards" ? (
        <div className="flex flex-col gap-8">
          {goalkeepers.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">
                {t("squadGoalkeepersTitle")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {goalkeepers.map((player) => renderPlayerCard(player))}
              </div>
            </div>
          )}
          {outfieldPlayers.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">
                {t("squadOutfieldTitle")}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {outfieldPlayers.map((player) => renderPlayerCard(player))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {goalkeepers.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">
                {t("squadGoalkeepersTitle")}
              </h3>
              {renderTable(goalkeepers, gkSort, onGkSort, true)}
            </div>
          )}
          {outfieldPlayers.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-muted">
                {t("squadOutfieldTitle")}
              </h3>
              {renderTable(outfieldPlayers, outfieldSort, onOutfieldSort, false)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
