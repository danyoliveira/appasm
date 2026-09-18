"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getLogoColor } from "@/lib/logoColor";
import { deleteManualPreparation } from "../actions";

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
  // A hand-added game (opponent outside the fixture list, possibly outside
  // API-Football entirely) rather than one pulled from the team's real
  // calendar — shown in the same table, just visually flagged.
  isManual?: boolean;
}

const PAGE_SIZE = 5;

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
  };
}) {
  const router = useRouter();
  const [pastCount, setPastCount] = useState(PAGE_SIZE);
  const [futureCount, setFutureCount] = useState(PAGE_SIZE);
  const [pendingFixtureId, setPendingFixtureId] = useState<number | string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, startDeleting] = useTransition();

  // Same crest-color extractor used across the club pages — the
  // next-fixture marker uses it instead of the generic accent.
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

  function handleConfirm() {
    if (pendingFixtureId == null) return;
    router.push(`/preparations/${pendingFixtureId}`);
    setPendingFixtureId(null);
  }

  // Already-started preparations just reopen — no need to ask again. Manual
  // games are always "already prepared" (creating one is the same as
  // starting it), so they always go straight through this branch too.
  function handlePrepareClick(row: PreparationFixtureRow) {
    if (row.isPrepared) {
      router.push(`/preparations/${row.id}`);
    } else {
      setPendingFixtureId(row.id);
    }
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

  // Past shown closest-to-now first (most recently played at the top).
  const visiblePast = past.slice(0, pastCount).slice().reverse();
  const visibleFuture = future.slice(0, futureCount);
  const rows = [...visiblePast, ...visibleFuture];
  const pendingRow = rows.find((r) => r.id === pendingFixtureId);
  // Same timeline logic as the club calendar — the boundary between the
  // last visible past game and the first future one is "next fixture".
  const nextFixtureIndex = visibleFuture.length > 0 ? visiblePast.length : -1;

  return (
    <div className="mt-6">
      {pastCount < past.length && (
        <button
          type="button"
          onClick={() => setPastCount((c) => c + PAGE_SIZE)}
          className="mb-2 text-sm font-medium text-accent hover:underline"
        >
          {labels.showMorePast}
        </button>
      )}

      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-background text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 text-left">{labels.dateTime}</th>
                <th className="px-3 py-2 text-left">{labels.opponent}</th>
                <th className="px-3 py-2 text-left">{labels.competition}</th>
                <th className="px-3 py-2 text-right">
                  <span className="sr-only">{labels.prepareAction}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, i) => (
                <Fragment key={row.id}>
                  {i === nextFixtureIndex && (
                    <tr>
                      <td colSpan={4} className="border-t border-border/60 px-3 pb-1 pt-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: clubColor ?? undefined }}
                        >
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: clubColor ?? undefined }}
                          />
                          {labels.nextFixture}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className={`transition-colors ${
                      i === nextFixtureIndex
                        ? ""
                        : `${i % 2 === 1 ? "bg-foreground/[0.03]" : ""} hover:bg-accent/5`
                    }`}
                    style={
                      i === nextFixtureIndex && clubColor
                        ? { borderLeft: `3px solid ${clubColor}`, backgroundColor: `${clubColor}14` }
                        : row.isManual
                          ? { borderLeft: `3px solid ${MANUAL_COLOR}`, backgroundColor: `${MANUAL_COLOR}0d` }
                          : undefined
                    }
                  >
                  <td className="whitespace-nowrap px-3 py-2">
                    {new Date(row.date).toLocaleDateString(locale)}{" "}
                    {new Date(row.date).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {row.opponentLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.opponentLogo} alt="" className="h-5 w-5 object-contain" />
                      ) : (
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                          style={{ backgroundColor: `${MANUAL_COLOR}1a`, color: MANUAL_COLOR }}
                        >
                          {row.opponentName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      {row.opponentName}
                      <span className="text-xs text-muted">
                        ({row.isHome ? labels.home : labels.away})
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {row.isManual ? (
                      <span className="text-xs font-medium" style={{ color: MANUAL_COLOR }}>
                        {labels.manualBadge}
                      </span>
                    ) : row.competitionName ? (
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.competitionLogo ?? undefined}
                          alt=""
                          className="h-4 w-4 object-contain"
                        />
                        {row.competitionName}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {row.isManual && isCoach && (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(String(row.id).replace(/^manual-/, ""))}
                          className="text-xs font-medium text-red-500 hover:underline"
                        >
                          {labels.deleteAction}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handlePrepareClick(row)}
                        className={
                          row.isPrepared
                            ? "inline-block rounded-full border border-accent px-3 py-1 text-xs font-medium text-accent hover:bg-accent/10"
                            : "inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:opacity-90"
                        }
                      >
                        {row.isPrepared ? labels.resumeAction : labels.prepareAction}
                      </button>
                    </div>
                  </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {futureCount < future.length && (
        <button
          type="button"
          onClick={() => setFutureCount((c) => c + PAGE_SIZE)}
          className="mt-2 text-sm font-medium text-accent hover:underline"
        >
          {labels.showMoreFuture}
        </button>
      )}

      <ConfirmDialog
        open={pendingFixtureId != null}
        tone="accent"
        icon="🏟️"
        title={labels.confirmStart}
        message={
          pendingRow
            ? `${pendingRow.opponentName} · ${new Date(pendingRow.date).toLocaleDateString(locale)} ${new Date(
                pendingRow.date,
              ).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
            : ""
        }
        confirmLabel={labels.prepareAction}
        cancelLabel={labels.cancel}
        onConfirm={handleConfirm}
        onCancel={() => setPendingFixtureId(null)}
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
