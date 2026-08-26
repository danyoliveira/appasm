"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type Phase = "pre" | "in" | "post";
type TabKey = "general" | Phase;

// Three signals, in order of trust:
// 1. A live-stats session's started_at/ended_at are exact, when one exists.
// 2. Without a session, API-Football's own result (`finished`) still tells
//    us for certain a real fixture is over — no need to guess from the
//    clock. Manual preparations (opponent outside the fixture list) never
//    get a result from the API, so this only helps real fixtures.
// 3. Only with neither do we fall back to a time-window guess: kickoff
//    minus an hour (warm-up/team-talk window) through a rough two-hour
//    match length (90' + half-time + stoppage).
// "Informação Geral" sits outside this — it's reference data, not tied to
// a match-day phase, so focus mode never selects it automatically.
function currentPhase(
  matchDate: string,
  liveSession: { startedAt: string | null; endedAt: string | null } | null,
  finished: boolean,
): Phase {
  if (liveSession?.endedAt) return "post";
  if (liveSession?.startedAt) return "in";
  if (finished) return "post";

  const now = Date.now();
  const kickoff = new Date(matchDate).getTime();
  const oneHour = 60 * 60 * 1000;
  const assumedMatchLength = 2 * 60 * 60 * 1000;
  if (now < kickoff - oneHour) return "pre";
  if (now < kickoff + assumedMatchLength) return "in";
  return "post";
}

export default function PreparationTabs({
  generalInfoContent,
  preGameContent,
  preGameContentFocus,
  inGameContent,
  inGameContentFocus,
  matchDate,
  opponentName,
  liveSession,
  finished = false,
}: {
  generalInfoContent?: ReactNode;
  preGameContent?: ReactNode;
  preGameContentFocus?: ReactNode;
  inGameContent?: ReactNode;
  inGameContentFocus?: ReactNode;
  matchDate: string;
  opponentName: string;
  liveSession?: { startedAt: string | null; endedAt: string | null } | null;
  finished?: boolean;
}) {
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<TabKey>("general");
  const [isFocusMode, setIsFocusMode] = useState(false);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("generalInfoTitle") },
    { key: "pre", label: t("preparationTabPreGame") },
    { key: "in", label: t("preparationTabInGame") },
    { key: "post", label: t("preparationTabPostGame") },
  ];

  const comingSoon = (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
      {t("preparationComingSoon")}
    </div>
  );

  function contentFor(key: TabKey, isFocusModeArg: boolean) {
    if (key === "general") return generalInfoContent ?? comingSoon;
    if (key === "pre") return (isFocusModeArg ? preGameContentFocus : preGameContent) ?? comingSoon;
    if (key === "in") return (isFocusModeArg ? inGameContentFocus : inGameContent) ?? comingSoon;
    return comingSoon;
  }

  if (isFocusMode) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {t("preparationTitleForOpponent", { opponent: opponentName })}
            </h1>
            <button
              type="button"
              onClick={() => setIsFocusMode(false)}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              ✕ {t("exitFocusModeButton")}
            </button>
          </div>

          <div className="mt-6">
            {contentFor(currentPhase(matchDate, liveSession ?? null, finished), true)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t2) => (
            <button
              key={t2.key}
              type="button"
              onClick={() => setTab(t2.key)}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t2.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t2.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setIsFocusMode(true)}
          className="mb-1.5 shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {t("focusModeButton")}
        </button>
      </div>

      <div className="mt-6">{contentFor(tab, false)}</div>
    </div>
  );
}
