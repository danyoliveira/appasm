"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

const PAGE_SIZE = 6;

// Arrivals and departures side by side, each with its own count and
// "show more" — reading one direction no longer means scanning past the
// other.
export default function TransferList({
  rows,
  emptyLabel,
  showMoreLabel,
}: {
  rows: TransferRow[];
  emptyLabel: string;
  showMoreLabel: string;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [visible, setVisible] = useState({ in: PAGE_SIZE, out: PAGE_SIZE });

  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">{emptyLabel}</p>;
  }

  function renderColumn(direction: "in" | "out") {
    const list = rows.filter((r) => r.direction === direction);
    const isIn = direction === "in";
    const shown = list.slice(0, visible[direction]);
    return (
      <section className="rounded-2xl border border-border bg-surface p-2 shadow-sm">
        <h3 className="flex items-center gap-2 px-3 pb-2 pt-2 text-sm font-semibold">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
              isIn
                ? "bg-green-600/10 text-green-700 dark:text-green-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            }`}
            aria-hidden
          >
            {isIn ? "↓" : "↑"}
          </span>
          {isIn ? t("transfersInTitle") : t("transfersOutTitle")}
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
            {list.length}
          </span>
        </h3>

        {list.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted">{emptyLabel}</p>
        ) : (
          <div className="space-y-0.5">
            {shown.map((row) => (
              <div
                key={row.key}
                className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-background"
              >
                <Link href={`/club/player/${row.playerId}`} className="shrink-0">
                  {row.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.photo} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-border" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background text-xs font-medium text-muted">
                      {shortenPlayerName(row.playerName).charAt(0).toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/club/player/${row.playerId}`}
                    className="block truncate text-sm font-medium hover:text-accent"
                  >
                    {shortenPlayerName(row.playerName)}
                    {row.age != null && <span className="font-normal text-muted"> · {row.age}</span>}
                  </Link>
                  <Link
                    href={`/club/${row.otherClubId}`}
                    className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted hover:text-accent"
                  >
                    <span className="shrink-0">{isIn ? t("transferFrom") : t("transferTo")}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={row.otherClubLogo} alt="" className="h-3.5 w-3.5 shrink-0 object-contain" />
                    <span className="truncate">{row.otherClubName}</span>
                  </Link>
                </div>
                <div className="shrink-0 text-right">
                  {row.type && (
                    <span className="inline-block max-w-[110px] truncate rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted">
                      {row.type}
                    </span>
                  )}
                  <div className="mt-0.5 text-[11px] tabular-nums text-muted">
                    {new Date(row.date).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {visible[direction] < list.length && (
          <button
            type="button"
            onClick={() => setVisible((v) => ({ ...v, [direction]: v[direction] + PAGE_SIZE }))}
            className="mt-1 w-full rounded-lg py-1.5 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            {showMoreLabel} ({list.length - visible[direction]})
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      {renderColumn("in")}
      {renderColumn("out")}
    </div>
  );
}
