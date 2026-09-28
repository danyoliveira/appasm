"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  setPlayerAvailability,
  setPlayerExcluded,
  startPlayerInjury,
  confirmInjuryFromApi,
  dismissApiInjury,
  confirmPlayerReturn,
  updateInjuryExpectedReturn,
  type PlayerStatus,
} from "../actions";
import { contrastTextColor, getLogoColor } from "@/lib/logoColor";
import type { SquadPlayer } from "@/lib/api-football/client";
import {
  translatePosition,
  shortenPlayerName,
  POSITION_ORDER,
  compareSquadDefault,
  StatusControl,
  InjuryConfirmBanner,
  type AvailabilityInfo,
  type PendingInjury,
  type PlayerSeasonStat,
} from "./playerShared";
import InjuryDetailsModal, { InjuryReturnBanner } from "./InjuryTracking";
import ManualPlayerDialog, { type ManualPlayerInfo } from "./ManualPlayerDialog";
import MergeSuggestions, { type MergeSuggestionView } from "./MergeSuggestions";
import Icon from "@/components/Icon";
import type { ComboboxCountry } from "@/components/CountryCombobox";

export interface DueReturnInjury {
  injuryId: string;
  expectedReturnAt: string;
}

export type { AvailabilityInfo, PendingInjury, PlayerSeasonStat };

// A squad row's numbers — internal (hand-entered) ones can be partially
// filled in, so each value may be missing.
export type SquadStat = { [K in keyof PlayerSeasonStat]: number | null };

type StatSource = "external" | "internal";

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

function sortValue(
  player: SquadPlayer,
  key: SortKey,
  stats: SquadStat | undefined,
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

function sortPlayers(
  list: SquadPlayer[],
  sort: SortState,
  statsByPlayerId: Map<number, SquadStat>,
  isGoalkeeperTable: boolean,
): SquadPlayer[] {
  if (sort.key === null) {
    return [...list].sort((a, b) =>
      compareSquadDefault(a, b, statsByPlayerId, isGoalkeeperTable),
    );
  }
  const sorted = [...list].sort((a, b) => {
    const va = sortValue(a, sort.key as SortKey, statsByPlayerId.get(a.id));
    const vb = sortValue(b, sort.key as SortKey, statsByPlayerId.get(b.id));
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

// One look for every toggle group in the toolbar.
const segmentedClass = "flex rounded-lg border border-border bg-background p-0.5";
const segmentClass = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
  }`;

export default function SquadSection({
  teamId,
  logoUrl,
  players,
  availabilityByPlayerId,
  injuriesByPlayerId,
  dueReturnByPlayerId,
  statsByPlayerId: externalStatsByPlayerId,
  internalStatsByPlayerId = new Map(),
  flagUrlByPlayerId,
  isCoach,
  manualPlayers = [],
  mergeSuggestions = [],
  countries = [],
}: {
  teamId: number;
  logoUrl?: string | null;
  players: SquadPlayer[];
  availabilityByPlayerId: Map<number, AvailabilityInfo>;
  injuriesByPlayerId: Map<number, PendingInjury>;
  dueReturnByPlayerId: Map<number, DueReturnInjury>;
  // API / fixture-verified numbers ("externa").
  statsByPlayerId: Map<number, PlayerSeasonStat>;
  // Coach-entered numbers ("interna").
  internalStatsByPlayerId?: Map<number, SquadStat>;
  flagUrlByPlayerId: Map<number, string | null>;
  isCoach: boolean;
  // Hand-added players (they're also in `players`) — badge + edit.
  manualPlayers?: ManualPlayerInfo[];
  mergeSuggestions?: MergeSuggestionView[];
  countries?: ComboboxCountry[];
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // A single shared modal for both "mark injured by hand" and "confirm an
  // API-flagged injury" — mode carries which action to call on submit, and
  // (for the API path) the injuryKey to pass along.
  const [injuryModal, setInjuryModal] = useState<
    | { player: SquadPlayer; mode: "manual" }
    | { player: SquadPlayer; mode: "api"; injuryKey: string; prefill: string }
    | null
  >(null);
  const [nameFilter, setNameFilter] = useState("");
  // External (API) is the more reliable default; players created from
  // scratch have no external data, so they always show their internal one.
  const [statSource, setStatSource] = useState<StatSource>("external");
  const statsByPlayerId = useMemo(() => {
    const map = new Map<number, SquadStat>();
    for (const player of players) {
      const useInternal = statSource === "internal" || player.id < 0;
      const stats = useInternal
        ? internalStatsByPlayerId.get(player.id)
        : externalStatsByPlayerId.get(player.id);
      if (stats) map.set(player.id, stats);
    }
    return map;
  }, [players, statSource, internalStatsByPlayerId, externalStatsByPlayerId]);
  const [manualDialog, setManualDialog] = useState<{ editing: ManualPlayerInfo | null } | null>(null);
  const manualById = useMemo(() => new Map(manualPlayers.map((m) => [m.id, m])), [manualPlayers]);

  // Cards have room for a "Manual" badge; in the (narrow) table the name
  // itself is tinted instead and the edit pencil only shows on row hover,
  // so the name keeps its space.
  function renderManualTag(player: SquadPlayer, compact = false) {
    const manual = manualById.get(player.id);
    if (!manual) return null;
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        {!compact && (
          <span
            className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400"
            title={t("manualPlayerBadgeTitle")}
          >
            {t("manualPlayerBadge")}
          </span>
        )}
        {isCoach && (
          <button
            type="button"
            onClick={() => setManualDialog({ editing: manual })}
            title={t("editButton")}
            aria-label={t("editButton")}
            className={`flex h-5 w-5 items-center justify-center rounded text-muted hover:text-foreground ${
              compact ? "sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" : ""
            }`}
          >
            <Icon name="pencil" className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }

  const manualNameClass = (player: SquadPlayer) =>
    manualById.has(player.id) ? "text-sky-700 dark:text-sky-400" : "";
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [showExcludedRaw, setShowExcluded] = useState(false);
  const [view, setView] = useState<ViewMode>("table");
  const [outfieldSort, onOutfieldSort] = useSortState();
  const [gkSort, onGkSort] = useSortState();

  // Same crest-color extractor as the club header (lib/logoColor.ts) — the
  // jersey-number badge echoes the club's own color instead of the generic
  // accent, like a real shirt number, while every interactive control here
  // (buttons, filters, sort arrows) keeps the standard accessible accent.
  const [clubColor, setClubColor] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    getLogoColor(logoUrl).then((c) => {
      if (!cancelled) setClubColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);
  const badgeStyle = clubColor
    ? { background: clubColor, color: contrastTextColor(clubColor) }
    : undefined;

  const distinctPositions = useMemo(
    () => Array.from(new Set(players.map((p) => p.position))),
    [players],
  );

  // Goalkeepers first, then the tactical order — same as the lists below.
  const orderedPositions = [...distinctPositions].sort(
    (a, b) =>
      (a === "Goalkeeper" ? -1 : (POSITION_ORDER[a] ?? 99)) -
      (b === "Goalkeeper" ? -1 : (POSITION_ORDER[b] ?? 99)),
  );

  const excludedCount = useMemo(
    () => players.filter((p) => availabilityByPlayerId.get(p.id)?.excluded).length,
    [players, availabilityByPlayerId],
  );

  // If the last excluded player just got restored, jump back to the main
  // squad view instead of leaving the coach stranded on an empty list with
  // no toggle left to click — computed here rather than reset through an
  // effect, so it never even flashes an empty "excluded" view for a frame.
  const showExcluded = excludedCount === 0 ? false : showExcludedRaw;

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
        false,
      ),
    [filteredPlayers, outfieldSort, statsByPlayerId],
  );

  const goalkeepers = useMemo(
    () =>
      sortPlayers(
        filteredPlayers.filter((p) => p.position === "Goalkeeper"),
        gkSort,
        statsByPlayerId,
        true,
      ),
    [filteredPlayers, gkSort, statsByPlayerId],
  );

  function handleStatusChange(player: SquadPlayer, status: PlayerStatus) {
    // "Injured" needs a description + expected return before it's real —
    // handled by the shared modal instead of writing the status straight away.
    if (status === "injured") {
      setInjuryModal({ player, mode: "manual" });
      return;
    }
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

  function handleResolveInjury(player: SquadPlayer, injuryKey: string, isReal: boolean, reason: string) {
    if (isReal) {
      setInjuryModal({ player, mode: "api", injuryKey, prefill: reason });
      return;
    }
    startTransition(async () => {
      await dismissApiInjury(teamId, player.id, player.name, injuryKey);
      router.refresh();
    });
  }

  function handleInjuryModalSubmit(description: string, expectedReturnAt: string | null) {
    if (!injuryModal) return;
    const { player } = injuryModal;
    startTransition(async () => {
      if (injuryModal.mode === "manual") {
        await startPlayerInjury(teamId, player.id, player.name, { description, expectedReturnAt });
      } else {
        await confirmInjuryFromApi(teamId, player.id, player.name, injuryModal.injuryKey, {
          description,
          expectedReturnAt,
        });
      }
      setInjuryModal(null);
      router.refresh();
    });
  }

  function handleConfirmReturn(player: SquadPlayer, injuryId: string, actualReturnAt: string) {
    startTransition(async () => {
      await confirmPlayerReturn(teamId, player.id, player.name, injuryId, actualReturnAt);
      router.refresh();
    });
  }

  function handleUpdateExpectedReturn(injuryId: string, expectedReturnAt: string) {
    startTransition(async () => {
      await updateInjuryExpectedReturn(injuryId, expectedReturnAt);
      router.refresh();
    });
  }

  function renderStatusCell(player: SquadPlayer) {
    const availability = availabilityByPlayerId.get(player.id);
    const status: PlayerStatus = availability?.status ?? "available";
    const pendingInjury = injuriesByPlayerId.get(player.id);
    const needsConfirmation =
      pendingInjury && pendingInjury.key !== availability?.lastSeenInjuryKey;
    const dueReturn = dueReturnByPlayerId.get(player.id);

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
            onResolve={(isReal) => handleResolveInjury(player, pendingInjury.key, isReal, pendingInjury.reason)}
            t={t}
          />
        )}
        {isCoach && dueReturn && (
          <InjuryReturnBanner
            expectedReturnAt={dueReturn.expectedReturnAt}
            isPending={isPending}
            onConfirmReturn={(actualReturnAt) => handleConfirmReturn(player, dueReturn.injuryId, actualReturnAt)}
            onUpdateExpectedReturn={(next) => handleUpdateExpectedReturn(dueReturn.injuryId, next)}
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
            <span
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground ring-2 ring-surface"
              style={badgeStyle}
            >
              {player.number ?? "-"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                href={`/club/player/${player.id}`}
                className="block truncate text-sm font-semibold hover:text-accent hover:underline"
              >
                {shortenPlayerName(player.name)}
              </Link>
              {renderManualTag(player)}
            </div>
            <span className="mt-1 block w-fit rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              {translatePosition(player.position, t)}
            </span>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-background p-2 text-center">
            <div>
              <div className="text-sm font-semibold">{stats.appearances ?? "-"}</div>
              <div className="text-[9px] uppercase tracking-wide text-muted">
                {t("playerStatAppearances")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">{stats.minutes ?? "-"}</div>
              <div className="text-[9px] uppercase tracking-wide text-muted">
                {t("playerStatMinutes")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">
                {(isGoalkeeper ? stats.saves : stats.goals) ?? "-"}
              </div>
              <div className="text-[9px] uppercase tracking-wide text-muted">
                {isGoalkeeper ? t("playerStatSaves") : t("playerStatGoals")}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold">
                {(isGoalkeeper ? stats.conceded : stats.assists) ?? "-"}
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
                    className="group odd:bg-surface even:bg-foreground/[0.03] transition-colors hover:bg-accent/5"
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
                          <span
                            className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[7px] font-bold text-accent-foreground ring-2 ring-surface"
                            style={badgeStyle}
                          >
                            {player.number ?? "-"}
                          </span>
                        </div>
                        <Link
                          href={`/club/player/${player.id}`}
                          title={manualById.has(player.id) ? t("manualPlayerBadgeTitle") : undefined}
                          className={`truncate font-medium hover:text-accent hover:underline ${manualNameClass(player)}`}
                        >
                          {shortenPlayerName(player.name)}
                        </Link>
                        {renderManualTag(player, true)}
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
                      {(stats ? (isGoalkeeperTable ? stats.saves : stats.goals) : null) ?? "-"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {(stats ? (isGoalkeeperTable ? stats.conceded : stats.assists) : null) ?? "-"}
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
      {isCoach && <MergeSuggestions suggestions={mergeSuggestions} />}

      <div className="mb-5 rounded-2xl border border-border bg-surface p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" />
            </span>
            <input
              type="search"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder={t("squadFilterPlaceholder")}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
            />
          </div>
          {isCoach && (
            <button
              type="button"
              onClick={() => setManualDialog({ editing: null })}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              <Icon name="plus" />
              {t("manualPlayerAddButton")}
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className={segmentedClass}>
              {[null, ...orderedPositions].map((pos) => (
                <button
                  key={pos ?? "all"}
                  type="button"
                  onClick={() => setPositionFilter(pos)}
                  aria-pressed={positionFilter === pos}
                  className={segmentClass(positionFilter === pos)}
                >
                  {pos ? translatePosition(pos, t) : t("allPositions")}
                </button>
              ))}
            </div>
            {isCoach && (excludedCount > 0 || showExcluded) && (
              <button
                type="button"
                onClick={() => {
                  // The badge always shows the full excluded count, ignoring
                  // the name/position filters — carrying one of those over
                  // when switching views made the list look like it was
                  // missing players that the count promised were there.
                  setPositionFilter(null);
                  setNameFilter("");
                  setShowExcluded((v) => !v);
                }}
                aria-pressed={showExcluded}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  showExcluded
                    ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {t("excludedPlayersFilter", { count: excludedCount })}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className={segmentedClass} title={t("squadStatSourceHint")}>
              <span className="self-center px-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t("squadStatSourceLabel")}
              </span>
              {(["external", "internal"] as const).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setStatSource(source)}
                  aria-pressed={statSource === source}
                  className={segmentClass(statSource === source)}
                >
                  {source === "external" ? t("squadStatSourceExternal") : t("squadStatSourceInternal")}
                </button>
              ))}
            </div>
            <div className={segmentedClass}>
              {(["cards", "table"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  aria-pressed={view === mode}
                  aria-label={mode === "cards" ? t("squadViewCards") : t("squadViewTable")}
                  title={mode === "cards" ? t("squadViewCards") : t("squadViewTable")}
                  className={`${segmentClass(view === mode)} flex items-center`}
                >
                  <Icon name={mode === "cards" ? "grid" : "list"} className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>
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

      {manualDialog && (
        <ManualPlayerDialog
          teamId={teamId}
          editing={manualDialog.editing}
          squadPlayers={players}
          countries={countries}
          onClose={() => setManualDialog(null)}
        />
      )}

      {injuryModal && (
        <InjuryDetailsModal
          playerName={injuryModal.player.name}
          initialDescription={injuryModal.mode === "api" ? injuryModal.prefill : undefined}
          isPending={isPending}
          onSubmit={handleInjuryModalSubmit}
          onCancel={() => setInjuryModal(null)}
        />
      )}
    </div>
  );
}
