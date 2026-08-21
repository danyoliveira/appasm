"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";

export interface CalendarRow {
  id: number;
  date: string;
  opponent: { id: number; name: string; logo: string };
  competition: { name: string; logo: string };
  isHome: boolean;
  result: "W" | "D" | "L" | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  finished: boolean;
}

const PAGE_SIZE = 5;

export default function FixtureCalendar({
  past,
  future,
  locale,
  labels,
}: {
  past: CalendarRow[];
  future: CalendarRow[];
  locale: string;
  labels: {
    dateTime: string;
    opponent: string;
    competition: string;
    venue: string;
    result: string;
    home: string;
    away: string;
    showMorePast: string;
    showMoreFuture: string;
    noFixturesFound: string;
  };
}) {
  const [pastCount, setPastCount] = useState(PAGE_SIZE);
  const [futureCount, setFutureCount] = useState(PAGE_SIZE);

  if (past.length === 0 && future.length === 0) {
    return <p className="mt-3 text-sm text-muted">{labels.noFixturesFound}</p>;
  }

  const visiblePast = past.slice(0, pastCount).slice().reverse();
  const visibleFuture = future.slice(0, futureCount);
  const rows = [...visiblePast, ...visibleFuture];

  return (
    <div className="mt-4">
      {pastCount < past.length && (
        <button
          type="button"
          onClick={() => setPastCount((c) => c + PAGE_SIZE)}
          className="mb-2 text-sm font-medium text-accent hover:underline"
        >
          {labels.showMorePast}
        </button>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-2">{labels.dateTime}</th>
              <th className="px-3 py-2">{labels.opponent}</th>
              <th className="px-3 py-2">{labels.competition}</th>
              <th className="px-3 py-2 text-center">{labels.venue}</th>
              <th className="px-3 py-2 text-center">{labels.result}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-b-0">
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {row.finished ? (
                    <Link href={`/dashboard/clube/jogo/${row.id}`} className="hover:text-accent">
                      {new Date(row.date).toLocaleDateString(locale)}{" "}
                      {new Date(row.date).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Link>
                  ) : (
                    <>
                      {new Date(row.date).toLocaleDateString(locale)}{" "}
                      {new Date(row.date).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/dashboard/clube/${row.opponent.id}`}
                    className="flex min-w-0 items-center gap-2 hover:text-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.opponent.logo}
                      alt=""
                      className="h-5 w-5 shrink-0 object-contain"
                    />
                    <span className="truncate">{row.opponent.name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={row.competition.logo}
                      alt=""
                      className="h-4 w-4 shrink-0 object-contain"
                    />
                    <span className="truncate">{row.competition.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-center text-muted">
                  {row.isHome ? labels.home : labels.away}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.finished ? (
                    <Link
                      href={`/dashboard/clube/jogo/${row.id}`}
                      className="inline-flex items-center gap-1.5 hover:text-accent"
                    >
                      {row.result && (
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                            row.result === "W"
                              ? "bg-green-600"
                              : row.result === "L"
                                ? "bg-red-500"
                                : "bg-muted"
                          }`}
                        >
                          {row.result}
                        </span>
                      )}
                      <span className="font-medium">
                        {row.goalsFor ?? "-"} - {row.goalsAgainst ?? "-"}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
  );
}
