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
}

const PAGE_SIZE = 7;

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
      {visible.map((row) => (
        <div
          key={row.key}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm"
        >
          <Link href={`/dashboard/clube/jogador/${row.playerId}`} className="shrink-0">
            {row.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-xs font-medium text-muted">
                {shortenPlayerName(row.playerName).charAt(0).toUpperCase()}
              </div>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/dashboard/clube/jogador/${row.playerId}`}
              className="block truncate font-medium hover:text-accent"
            >
              {shortenPlayerName(row.playerName)}
            </Link>
            <Link
              href={`/dashboard/clube/${row.otherClubId}`}
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
            <div className="font-medium text-foreground">{row.type ?? "—"}</div>
            <div className="text-muted">{new Date(row.date).toLocaleDateString(locale)}</div>
          </div>
        </div>
      ))}

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
