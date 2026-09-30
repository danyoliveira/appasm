"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import TeamCrest from "@/components/TeamCrest";
import { RESULT_TONE } from "../../OpponentScouting";

export interface StintGameRow {
  key: string;
  opponentName: string;
  opponentLogo: string;
  // "Casa · 20 set. 2026 · Primeira Liga", already in the app's language.
  meta: string;
  // Our goals first; null while the game has no result.
  score: { goalsFor: number; goalsAgainst: number } | null;
  // Set when the coach prepared this game: what the preparation holds
  // ("3 análises táticas · 3 vídeos") and whether it was marked finished.
  preparation: { content: string; finished: boolean } | null;
}

// A whole season is 40–50 games — only the latest ones show until asked.
const COLLAPSED_COUNT = 8;

// Every game of the spell in one list: what was played (with the result)
// and what was prepared (opens the archived preparation). The two used to
// be separate sections that mostly repeated each other.
export default function StintGames({ stintId, rows }: { stintId: string; rows: StintGameRow[] }) {
  const t = useTranslations("dashboard");
  const [onlyPrepared, setOnlyPrepared] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const preparedCount = rows.filter((r) => r.preparation).length;
  const filtered = onlyPrepared ? rows.filter((r) => r.preparation) : rows;
  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED_COUNT);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
      active ? "bg-accent text-accent-foreground" : "bg-background text-muted ring-1 ring-border hover:text-foreground"
    }`;

  return (
    <div className="mt-3">
      {preparedCount > 0 && preparedCount < rows.length && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setOnlyPrepared(false)} className={chip(!onlyPrepared)}>
            {t("archiveFilterAll", { count: rows.length })}
          </button>
          <button type="button" onClick={() => setOnlyPrepared(true)} className={chip(onlyPrepared)}>
            {t("archiveFilterPrepared", { count: preparedCount })}
          </button>
        </div>
      )}

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {visible.map((row) => {
          const result = row.score
            ? row.score.goalsFor > row.score.goalsAgainst
              ? "W"
              : row.score.goalsFor < row.score.goalsAgainst
                ? "L"
                : "D"
            : null;
          const content = (
            <>
              <TeamCrest logo={row.opponentLogo} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{row.opponentName}</span>
                  {row.preparation?.finished && (
                    <span className="shrink-0 rounded-full bg-green-600/10 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                      ✓ {t("preparationFinishedBadge")}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted">{row.meta}</div>
                {row.preparation && (
                  <div className="mt-0.5 truncate text-xs font-medium text-accent">
                    {t("archivePreparationLabel")} · <span className="font-normal text-muted">{row.preparation.content}</span>
                  </div>
                )}
              </div>
              {row.score && result ? (
                <span className={`shrink-0 rounded-md px-2 py-1 text-sm font-bold tabular-nums ${RESULT_TONE[result]}`}>
                  {row.score.goalsFor} - {row.score.goalsAgainst}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted">{t("fixtureStatusNotStarted")}</span>
              )}
              <span aria-hidden className={`w-4 shrink-0 text-muted ${row.preparation ? "" : "invisible"}`}>
                →
              </span>
            </>
          );
          return row.preparation ? (
            <Link
              key={row.key}
              href={`/archive/${stintId}/preparation/${row.key}`}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-background"
            >
              {content}
            </Link>
          ) : (
            <div key={row.key} className="flex items-center gap-3 px-3 py-2.5">
              {content}
            </div>
          );
        })}
      </div>

      {filtered.length > COLLAPSED_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          {expanded ? t("archiveShowLess") : t("archiveShowAll", { count: filtered.length })}
        </button>
      )}
    </div>
  );
}
