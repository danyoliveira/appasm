"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  setPlayerAvailability,
  setPlayerExcluded,
  resolveApiInjury,
  type PlayerStatus,
} from "../actions";
import type { SquadPlayer } from "@/lib/api-football/client";

const POSITION_LABEL_KEYS: Record<string, string> = {
  Goalkeeper: "positionGoalkeeper",
  Defender: "positionDefender",
  Midfielder: "positionMidfielder",
  Attacker: "positionAttacker",
};

function translatePosition(position: string, t: (key: string) => string) {
  const key = POSITION_LABEL_KEYS[position];
  return key ? t(key) : position;
}

export interface AvailabilityInfo {
  status: PlayerStatus;
  lastSeenInjuryKey: string | null;
  excluded: boolean;
}

export interface PendingInjury {
  key: string;
  reason: string;
}

export interface PlayerSeasonStat {
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  conceded: number;
}

const STATUS_DOT: Record<PlayerStatus, string> = {
  available: "bg-green-600",
  doubtful: "bg-yellow-500",
  injured: "bg-red-500",
  suspended: "bg-muted",
  unavailable: "bg-orange-500",
};

const STATUS_TEXT: Record<PlayerStatus, string> = {
  available: "text-green-600",
  doubtful: "text-yellow-600",
  injured: "text-red-500",
  suspended: "text-muted",
  unavailable: "text-orange-600",
};

const STATUS_KEYS = ["available", "doubtful", "injured", "suspended", "unavailable"] as const;

function statusLabelKey(status: PlayerStatus) {
  return {
    available: "statusAvailable",
    doubtful: "statusDoubtful",
    injured: "statusInjured",
    suspended: "statusSuspended",
    unavailable: "statusUnavailable",
  }[status];
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" strokeWidth={2}>
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusControl({
  status,
  isCoach,
  isPending,
  onChange,
  t,
}: {
  status: PlayerStatus;
  isCoach: boolean;
  isPending: boolean;
  onChange: (status: PlayerStatus) => void;
  t: (key: string) => string;
}) {
  if (!isCoach) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        <span className={STATUS_TEXT[status]}>{t(statusLabelKey(status))}</span>
      </span>
    );
  }

  return (
    <div className="relative w-fit">
      <select
        value={status}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value as PlayerStatus)}
        className={`appearance-none rounded-full border border-border bg-background py-1.5 pl-6 pr-7 text-xs font-medium outline-none focus:border-accent disabled:opacity-50 ${STATUS_TEXT[status]}`}
      >
        {STATUS_KEYS.map((key) => (
          <option key={key} value={key} className="text-foreground">
            {t(statusLabelKey(key))}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${STATUS_DOT[status]}`}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted">
        <ChevronIcon />
      </span>
    </div>
  );
}

function InjuryConfirmBanner({
  pendingInjury,
  isPending,
  onResolve,
  t,
}: {
  pendingInjury: PendingInjury;
  isPending: boolean;
  onResolve: (isReal: boolean) => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  return (
    <div className="rounded-xl bg-yellow-500/10 p-2.5 text-xs">
      <p className="text-yellow-700 dark:text-yellow-500">
        {t("apiInjuryPrompt", { reason: pendingInjury.reason })}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onResolve(true)}
          className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
        >
          {t("confirmInjuryButton")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onResolve(false)}
          className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
        >
          {t("dismissInjuryButton")}
        </button>
      </div>
    </div>
  );
}

type SortKey = "name" | "position" | "minutes" | "goals" | "assists" | "saves" | "conceded";
type SortState = { key: SortKey; dir: "asc" | "desc" };

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

function sortPlayers(
  list: SquadPlayer[],
  sort: SortState,
  statsByPlayerId: Map<number, PlayerSeasonStat>,
  t: (key: string) => string,
): SquadPlayer[] {
  const sorted = [...list].sort((a, b) => {
    const va = sortValue(a, sort.key, statsByPlayerId.get(a.id), t);
    const vb = sortValue(b, sort.key, statsByPlayerId.get(b.id), t);
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
      className={`cursor-pointer select-none px-3 py-2 hover:text-foreground ${
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

function useSortState(initial: SortKey) {
  const [sort, setSort] = useState<SortState>({ key: initial, dir: "asc" });
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
  isCoach,
}: {
  teamId: number;
  players: SquadPlayer[];
  availabilityByPlayerId: Map<number, AvailabilityInfo>;
  injuriesByPlayerId: Map<number, PendingInjury>;
  statsByPlayerId: Map<number, PlayerSeasonStat>;
  isCoach: boolean;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nameFilter, setNameFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [view, setView] = useState<ViewMode>("cards");
  const [outfieldSort, onOutfieldSort] = useSortState("position");
  const [gkSort, onGkSort] = useSortState("name");

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

  function renderTable(
    list: SquadPlayer[],
    sort: SortState,
    onSort: (key: SortKey) => void,
    isGoalkeeperTable: boolean,
  ) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <SortableHeader label={t("squadColumnPlayer")} sortKey="name" currentSort={sort} onSort={onSort} />
              {!isGoalkeeperTable && (
                <SortableHeader
                  label={t("squadColumnPosition")}
                  sortKey="position"
                  currentSort={sort}
                  onSort={onSort}
                />
              )}
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
              <th className="px-3 py-2 text-left">{t("squadColumnStatus")}</th>
              {isCoach && <th className="px-3 py-2 text-left">{t("squadColumnActions")}</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((player) => {
              const stats = statsByPlayerId.get(player.id);
              return (
                <tr key={player.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={player.photo}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-accent-foreground ring-2 ring-surface">
                          {player.number ?? "-"}
                        </span>
                      </div>
                      <span className="truncate font-medium">{player.name}</span>
                    </div>
                  </td>
                  {!isGoalkeeperTable && (
                    <td className="px-3 py-2 text-muted">
                      {translatePosition(player.position, t)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center">{stats?.minutes ?? "-"}</td>
                  <td className="px-3 py-2 text-center">
                    {stats ? (isGoalkeeperTable ? stats.saves : stats.goals) : "-"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {stats ? (isGoalkeeperTable ? stats.conceded : stats.assists) : "-"}
                  </td>
                  <td className="px-3 py-2">{renderStatusCell(player)}</td>
                  {isCoach && (
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleExcludeToggle(player, !showExcluded)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          showExcluded
                            ? "border-border hover:border-accent"
                            : "border-border text-red-500 hover:bg-red-500 hover:text-white"
                        }`}
                      >
                        {showExcluded ? t("restorePlayerButton") : t("excludePlayerButton")}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPlayers.map((player) => {
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
                    <div className="truncate text-sm font-semibold">{player.name}</div>
                    <span className="mt-1 inline-block rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      {translatePosition(player.position, t)}
                    </span>
                  </div>
                </div>

                {stats && (
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-2 text-center">
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
          })}
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
