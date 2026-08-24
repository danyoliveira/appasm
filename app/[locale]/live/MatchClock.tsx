"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Phase = "pre" | "first-half" | "halftime" | "second-half" | "ended";

function phaseOf(startedAt: string | null, halftimeAt: string | null, secondHalfAt: string | null, endedAt: string | null): Phase {
  if (endedAt) return "ended";
  if (secondHalfAt) return "second-half";
  if (halftimeAt) return "halftime";
  if (startedAt) return "first-half";
  return "pre";
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function MatchClock({
  startedAt,
  halftimeAt,
  secondHalfAt,
  endedAt,
  canControl,
  onKickoff,
  onHalftime,
  onSecondHalf,
  onFullTime,
  onRestart,
}: {
  startedAt: string | null;
  halftimeAt: string | null;
  secondHalfAt: string | null;
  endedAt: string | null;
  canControl: boolean;
  onKickoff: () => void;
  onHalftime: () => void;
  onSecondHalf: () => void;
  onFullTime: () => void;
  onRestart: () => void;
}) {
  const t = useTranslations("dashboard");
  const phase = phaseOf(startedAt, halftimeAt, secondHalfAt, endedAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phase !== "first-half" && phase !== "second-half") return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  if (phase === "pre") {
    return canControl ? (
      <button
        type="button"
        onClick={onKickoff}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        🏁 {t("liveStatsKickoffButton")}
      </button>
    ) : (
      <span className="text-lg font-semibold uppercase text-muted">vs</span>
    );
  }

  const referenceMs = phase === "ended" && endedAt ? new Date(endedAt).getTime() : now;
  const elapsedMs =
    phase === "halftime" && halftimeAt && startedAt
      ? new Date(halftimeAt).getTime() - new Date(startedAt).getTime()
      : referenceMs - new Date(startedAt!).getTime();

  const phaseLabelKey: Record<Exclude<Phase, "pre">, string> = {
    "first-half": "liveStatsPhaseFirstHalf",
    halftime: "liveStatsPhaseHalftime",
    "second-half": "liveStatsPhaseSecondHalf",
    ended: "liveStatsPhaseEnded",
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent">
        {t(phaseLabelKey[phase])}
      </span>
      <span className="text-lg font-semibold tabular-nums">{formatClock(elapsedMs)}</span>
      {canControl && phase === "first-half" && (
        <button
          type="button"
          onClick={onHalftime}
          className="mt-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {t("liveStatsHalftimeButton")}
        </button>
      )}
      {canControl && phase === "halftime" && (
        <button
          type="button"
          onClick={onSecondHalf}
          className="mt-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {t("liveStatsSecondHalfButton")}
        </button>
      )}
      {canControl && phase === "second-half" && (
        <button
          type="button"
          onClick={onFullTime}
          className="mt-1 rounded-full bg-red-500 px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          {t("liveStatsFullTimeButton")}
        </button>
      )}
      {canControl && (
        <button
          type="button"
          onClick={onRestart}
          className="mt-0.5 text-[11px] font-medium text-muted hover:text-red-500 hover:underline"
        >
          ↺ {t("liveStatsRestartButton")}
        </button>
      )}
    </div>
  );
}
