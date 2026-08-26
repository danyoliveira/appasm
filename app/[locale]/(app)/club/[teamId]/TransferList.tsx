"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { shortenPlayerName } from "../playerShared";

export interface TransferRow {
  key: string;
  playerId: number;
  playerName: string;
  photo?: string;
  otherClubId: number;
  otherClubName: string;
  otherClubLogo: string;
  nationality?: string | null;
  age?: number | null;
  type: string | null;
  date: string;
  direction: "in" | "out";
}

const PAGE_SIZE = 8;

export default function TransferList({
  rows,
  emptyLabel,
  showMoreLabel,
}: {
  rows: TransferRow[];
  emptyLabel: string;
  showMoreLabel: string;
}) {
  const locale = useLocale();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">{emptyLabel}</p>;
  }

  const visible = rows.slice(0, visibleCount);

  return (
    <div className="mt-2 space-y-2">
      {visible.map((row) => {
        const isIn = row.direction === "in";
        return (
        <div
          key={row.key}
          className={`flex items-center gap-3 rounded-lg border-y border-r border-border bg-surface p-3 text-sm transition-colors hover:border-accent/40 ${
            isIn ? "border-l-4 border-l-green-600" : "border-l-4 border-l-red-500"
          }`}
        >
          <Link href={`/club/player/${row.playerId}`} className="relative shrink-0">
            {row.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-xs font-medium text-muted">
                {shortenPlayerName(row.playerName).charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-surface ${
                isIn ? "bg-green-600" : "bg-red-500"
              }`}
            >
              {isIn ? "↓" : "↑"}
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/club/player/${row.playerId}`}
              className="block truncate font-medium hover:text-accent"
            >
              {shortenPlayerName(row.playerName)}
            </Link>
            <Link
              href={`/club/${row.otherClubId}`}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.otherClubLogo}
                alt=""
                className="h-4 w-4 shrink-0 object-contain"
              />
              <span className="truncate">
                {row.otherClubName}
                {row.nationality && ` · ${row.nationality}`}
                {row.age != null && `, ${row.age}`}
              </span>
            </Link>
          </div>
          <div className="shrink-0 text-right text-xs">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                isIn ? "bg-green-600/10 text-green-600" : "bg-red-500/10 text-red-500"
              }`}
            >
              {row.type ?? "—"}
            </span>
            <div className="mt-1 text-muted">{new Date(row.date).toLocaleDateString(locale)}</div>
          </div>
        </div>
        );
      })}

      {visibleCount < rows.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="mt-1 text-sm font-medium text-accent hover:underline"
        >
          {showMoreLabel} ({rows.length - visibleCount})
        </button>
      )}
    </div>
  );
}
