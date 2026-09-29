"use client";

import { announceNavigation } from "@/components/NavigationProgress";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getVividLogoColor } from "@/lib/logoColor";
import { deleteManualPreparation, setPreparationFinished } from "../actions";
import TeamCrest from "@/components/TeamCrest";
import Icon from "@/components/Icon";

// Same violet used elsewhere in this app for "custom, not from the API"
// things (the tactical board's generic marker) — reused here so a manual
// game reads as the same kind of "hand-added" entry at a glance.
const MANUAL_COLOR = "#7c3aed";

export interface PreparationFixtureRow {
  // A real fixture's numeric API-Football id, or a manual preparation's
  // `manual-<uuid>` route segment — either way, exactly what belongs after
  // `/preparations/` for this row's link.
  id: number | string;
  date: string;
  opponentName: string;
  opponentLogo: string;
  // null for a manual game — it has no API-Football competition.
  competitionName: string | null;
  competitionLogo: string | null;
  isHome: boolean;
  isPrepared: boolean;
  // Finished after the game (Concluída).
  isFinished?: boolean;
  // A hand-added game (opponent outside the fixture list, possibly outside
  // API-Football entirely) rather than one pulled from the team's real
  // calendar — shown in the same table, just visually flagged.
  isManual?: boolean;
}

const PAGE_SIZE = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function PreparationFixtureList({
  past,
  future,
  locale,
  logoUrl,
  isCoach,
  labels,
}: {
  past: PreparationFixtureRow[];
  future: PreparationFixtureRow[];
  locale: string;
  logoUrl?: string | null;
  isCoach: boolean;
  labels: {
    dateTime: string;
    opponent: string;
    competition: string;
    home: string;
    away: string;
    prepareAction: string;
    resumeAction: string;
    confirmStart: string;
    cancel: string;
    showMorePast: string;
    showMoreFuture: string;
    noFixturesFound: string;
    nextFixture: string;
    manualBadge: string;
    deleteAction: string;
    confirmDelete: string;
    finishedBadge: string;
    viewAction: string;
    sectionInProgress: string;
    sectionInProgressHint: string;
    sectionUpcoming: string;
    sectionFinished: string;
    toFinishBadge: string;
    finishAction: string;
    finishConfirm: string;
  };
}) {
  const router = useRouter();
  const [upcomingCount, setUpcomingCount] = useState(PAGE_SIZE);
  const [finishedCount, setFinishedCount] = useState(PAGE_SIZE);
  const [pendingFixtureId, setPendingFixtureId] = useState<number | string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();
  const [pendingFinishKey, setPendingFinishKey] = useState<string | null>(null);
  const [isFinishing, startFinishing] = useTransition();

  // Same crest-color extractor used across the club pages — the
  // next-fixture marker uses it instead of the generic accent.
  const [clubColor, setClubColor] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    getVividLogoColor(logoUrl).then((c) => {
      if (!cancelled) setClubColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  function handleConfirm() {
    if (pendingFixtureId == null) return;
    announceNavigation();
    router.push(`/preparations/${pendingFixtureId}`);
    setPendingFixtureId(null);
  }

  // Already-started preparations just reopen — no need to ask again. Manual
  // games are always "already prepared" (creating one is the same as
  // starting it), so they always go straight through this branch too.
  function handlePrepareClick(row: PreparationFixtureRow) {
    if (row.isPrepared) {
      announceNavigation();
      router.push(`/preparations/${row.id}`);
    } else {
      setPendingFixtureId(row.id);
    }
  }

  // Finish straight from the list (played games still in preparation) —
  // same action as the Pós-Jogo tab's button.
  function handleConfirmFinish() {
    if (!pendingFinishKey) return;
    const key = pendingFinishKey;
    startFinishing(async () => {
      await setPreparationFinished(key, true);
      setPendingFinishKey(null);
      router.refresh();
    });
  }

  function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startDeleting(async () => {
      await deleteManualPreparation(id);
      setPendingDeleteId(null);
      router.refresh();
    });
  }

  if (past.length === 0 && future.length === 0) {
    return <p className="mt-6 text-sm text-muted">{labels.noFixturesFound}</p>;
  }

  // Three lists instead of one timeline:
  //  · Em preparação — started, not finished (upcoming, or played and still
  //    to be finished), closest date first;
  //  · Próximos jogos — upcoming, not started yet;
  //  · Concluídas — finished, most recent first.
  const all = [...past, ...future];
  const inProgress = all
    .filter((r) => r.isPrepared && !r.isFinished)
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = future.filter((r) => !r.isPrepared);
  const finished = all.filter((r) => r.isFinished).sort((a, b) => b.date.localeCompare(a.date));
  const now = new Date().getTime();
  const nextId = future[0]?.id;
  const pendingRow = all.find((r) => r.id === pendingFixtureId);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const relativeDay = (iso: string) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const target = new Date(iso);
    target.setHours(0, 0, 0, 0);
    return rtf.format(Math.round((target.getTime() - start.getTime()) / DAY_MS), "day");
  };
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  function renderCrest(row: PreparationFixtureRow, size: string) {
    return row.opponentLogo ? (
      <TeamCrest logo={row.opponentLogo} className={size} />
    ) : (
      <span
        className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-700 dark:bg-violet-400/15 dark:text-violet-300`}
      >
        {row.opponentName.charAt(0).toUpperCase()}
      </span>
    );
  }

  function renderCompetition(row: PreparationFixtureRow) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        {row.competitionLogo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.competitionLogo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
        )}
        <span className="truncate">{row.competitionName ?? "—"}</span>
        {row.isManual && (
          <span className="shrink-0 rounded-full bg-violet-500/10 px-1.5 py-px text-[10px] font-medium text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
            {labels.manualBadge}
          </span>
        )}
      </span>
    );
  }

  function renderDelete(row: PreparationFixtureRow) {
    if (!row.isManual || !isCoach) return null;
    return (
      <button
        type="button"
        onClick={() => setPendingDeleteId(String(row.id).replace(/^manual-/, ""))}
        className="text-xs font-medium text-muted hover:text-red-500"
      >
        {labels.deleteAction}
      </button>
    );
  }

  function renderSectionTitle(title: string, count: number, dot: string, hint?: string) {
    return (
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {title}
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted ring-1 ring-border">
            {count}
          </span>
        </h2>
        {hint && <p className="mt-0.5 pl-4 text-xs text-muted">{hint}</p>}
      </div>
    );
  }

  // Em preparação: a card each — the work in hand.
  function renderInProgressCard(row: PreparationFixtureRow) {
    const played = new Date(row.date).getTime() < now;
    return (
      <div
        key={row.id}
        className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
        style={row.isManual ? { borderLeft: `3px solid ${MANUAL_COLOR}` } : undefined}
      >
        <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          {renderCompetition(row)}
          <div className="flex shrink-0 items-center gap-1.5">
          {row.isManual && isCoach && (
            <button
              type="button"
              onClick={() => setPendingDeleteId(String(row.id).replace(/^manual-/, ""))}
              aria-label={labels.deleteAction}
              title={labels.deleteAction}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-background hover:text-red-500"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          )}
          {played ? (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
              {labels.toFinishBadge}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-medium text-accent first-letter:uppercase">{relativeDay(row.date)}</span>
          )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/5">
            {renderCrest(row, "h-full w-full")}
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{row.opponentName}</div>
            <div className="text-xs text-muted">
              {row.isHome ? labels.home : labels.away} · {new Date(row.date).toLocaleDateString(locale)} · {time(row.date)}
            </div>
          </div>
        </div>
        </div>
        {/* Footer bar: open on the left, finish (played games) on the right. */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => handlePrepareClick(row)}
            className="text-xs font-semibold text-accent hover:underline"
          >
            {labels.resumeAction} →
          </button>
          {played && isCoach && (
            <button
              type="button"
              disabled={isFinishing}
              onClick={() => setPendingFinishKey(String(row.id))}
              className="text-xs font-semibold text-green-700 hover:underline disabled:opacity-50 dark:text-green-400"
            >
              ✓ {labels.finishAction}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Próximos jogos / Concluídas: one compact line each.
  function renderRow(row: PreparationFixtureRow, kind: "upcoming" | "finished") {
    const isNext = kind === "upcoming" && row.id === nextId;
    const date = new Date(row.date);
    return (
      <div
        key={row.id}
        className={`flex items-center gap-3 px-3 py-2.5 ${kind === "finished" ? "opacity-90" : ""}`}
        style={
          isNext && clubColor
            ? { boxShadow: `inset 3px 0 0 ${clubColor}`, backgroundColor: `${clubColor}10` }
            : row.isManual
              ? { boxShadow: `inset 3px 0 0 ${MANUAL_COLOR}` }
              : undefined
        }
      >
        <div className="w-11 shrink-0 text-center">
          <div className="text-base font-bold leading-none tabular-nums">{date.getDate()}</div>
          <div className="mt-0.5 text-[10px] uppercase text-muted">
            {date.toLocaleDateString(locale, { month: "short" }).replace(".", "")}
          </div>
        </div>
        {renderCrest(row, "h-7 w-7")}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium">{row.opponentName}</span>
            <span className="shrink-0 text-[11px] text-muted">({row.isHome ? labels.home : labels.away})</span>
            {isNext && (
              <span
                className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: clubColor ?? undefined, backgroundColor: clubColor ? `${clubColor}1a` : undefined }}
              >
                {labels.nextFixture}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            {renderCompetition(row)}
            <span className="shrink-0 text-xs text-muted">· {time(row.date)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {renderDelete(row)}
          {kind === "finished" ? (
            <button
              type="button"
              onClick={() => handlePrepareClick(row)}
              className="rounded-full bg-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/30"
            >
              {labels.viewAction}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handlePrepareClick(row)}
              className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:opacity-90"
            >
              {labels.prepareAction}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-10">
      {inProgress.length > 0 && (
        <section>
          {renderSectionTitle(labels.sectionInProgress, inProgress.length, "bg-accent", labels.sectionInProgressHint)}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{inProgress.map(renderInProgressCard)}</div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          {renderSectionTitle(labels.sectionUpcoming, upcoming.length, "bg-sky-500")}
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {upcoming.slice(0, upcomingCount).map((row) => renderRow(row, "upcoming"))}
          </div>
          {upcomingCount < upcoming.length && (
            <button
              type="button"
              onClick={() => setUpcomingCount((c) => c + PAGE_SIZE)}
              className="mt-2 text-sm font-medium text-accent hover:underline"
            >
              {labels.showMoreFuture}
            </button>
          )}
        </section>
      )}

      {finished.length > 0 && (
        <section>
          {renderSectionTitle(labels.sectionFinished, finished.length, "bg-green-600")}
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {finished.slice(0, finishedCount).map((row) => renderRow(row, "finished"))}
          </div>
          {finishedCount < finished.length && (
            <button
              type="button"
              onClick={() => setFinishedCount((c) => c + PAGE_SIZE)}
              className="mt-2 text-sm font-medium text-accent hover:underline"
            >
              {labels.showMorePast}
            </button>
          )}
        </section>
      )}

      <ConfirmDialog
        open={pendingFixtureId != null}
        tone="accent"
        icon="🏟️"
        title={labels.confirmStart}
        message={
          pendingRow
            ? `${pendingRow.opponentName} · ${new Date(pendingRow.date).toLocaleDateString(locale)} ${time(pendingRow.date)}`
            : ""
        }
        confirmLabel={labels.prepareAction}
        cancelLabel={labels.cancel}
        onConfirm={handleConfirm}
        onCancel={() => setPendingFixtureId(null)}
      />

      <ConfirmDialog
        open={pendingFinishKey != null}
        tone="accent"
        message={labels.finishConfirm}
        confirmLabel={labels.finishAction}
        cancelLabel={labels.cancel}
        isPending={isFinishing}
        onConfirm={handleConfirmFinish}
        onCancel={() => setPendingFinishKey(null)}
      />

      <ConfirmDialog
        open={pendingDeleteId != null}
        message={labels.confirmDelete}
        isPending={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
