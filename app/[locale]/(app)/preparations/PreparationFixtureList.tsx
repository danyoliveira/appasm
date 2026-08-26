"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import { getLogoColor } from "@/lib/logoColor";

export interface PreparationFixtureRow {
  id: number;
  date: string;
  opponentName: string;
  opponentLogo: string;
  competitionName: string;
  competitionLogo: string;
  isHome: boolean;
  isPrepared: boolean;
}

const PAGE_SIZE = 5;

export default function PreparationFixtureList({
  past,
  future,
  locale,
  logoUrl,
  labels,
}: {
  past: PreparationFixtureRow[];
  future: PreparationFixtureRow[];
  locale: string;
  logoUrl?: string | null;
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
  };
}) {
  const router = useRouter();
  const [pastCount, setPastCount] = useState(PAGE_SIZE);
  const [futureCount, setFutureCount] = useState(PAGE_SIZE);
  const [pendingFixtureId, setPendingFixtureId] = useState<number | null>(null);

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

  // Already-started preparations just reopen — no need to ask again.
  function handlePrepareClick(row: PreparationFixtureRow) {
    if (row.isPrepared) {
      router.push(`/preparations/${row.id}`);
    } else {
      setPendingFixtureId(row.id);
    }
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.opponentLogo} alt="" className="h-5 w-5 object-contain" />
                      {row.opponentName}
                      <span className="text-xs text-muted">
                        ({row.isHome ? labels.home : labels.away})
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.competitionLogo}
                        alt=""
                        className="h-4 w-4 object-contain"
                      />
                      {row.competitionName}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
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
    </div>
  );
}
