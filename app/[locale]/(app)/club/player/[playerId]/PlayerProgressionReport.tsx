"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PlayerStatus } from "../../../actions";
import { statusLabelKey } from "../../playerShared";
import { getLogoColor } from "@/lib/logoColor";
import type { WeightEntry } from "./PlayerBodyMetrics";

export interface ProgressionReportData {
  playerName: string;
  clubName: string | null;
  clubLogoUrl: string | null;
  photoUrl: string | null;
  isGoalkeeper: boolean;
  // Resolved season totals — the hand-entered (internal) number wins
  // wherever the coach has filled it in, falling back to the API
  // (external) one otherwise, same rule as the comparison table.
  seasonTotals: {
    appearances: number | null;
    minutes: number | null;
    rating: number | null;
    goalsOrSaves: number | null;
    assistsOrConceded: number | null;
  };
  physical: {
    heightCm: number | null;
    currentWeight: number | null;
    previousWeight: number | null;
    firstWeight: number | null;
  };
  tracking: {
    notesCount: number;
    videosCount: number;
    videosByCategory: { category: string; label: string; count: number }[];
  };
  availability: {
    status: PlayerStatus;
    injuryCount: number;
  };
  notes: { content: string; date: string }[];
  videos: { url: string; categoryLabel: string | null; notes: string | null; date: string }[];
  injuries: {
    description: string;
    start: string;
    end: string | null;
    durationDays: number | null;
    expectedReturnAt: string | null;
  }[];
  weightEntries: WeightEntry[];
}

function Delta({ value, digits = 1 }: { value: number | null; digits?: number }) {
  if (value == null || Number.isNaN(value)) return null;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return <span className="text-muted">· =</span>;
  const isUp = rounded > 0;
  return (
    <span className={isUp ? "text-green-600" : "text-yellow-600"}>
      {isUp ? "▲" : "▼"} {Math.abs(rounded)}
    </span>
  );
}

export default function PlayerProgressionReport({ data }: { data: ProgressionReportData }) {
  const t = useTranslations("dashboard");
  const [isGenerating, setIsGenerating] = useState(false);

  const weightSinceLast =
    data.physical.currentWeight != null && data.physical.previousWeight != null
      ? data.physical.currentWeight - data.physical.previousWeight
      : null;
  const weightSinceStart =
    data.physical.currentWeight != null && data.physical.firstWeight != null
      ? data.physical.currentWeight - data.physical.firstWeight
      : null;

  async function handleDownload() {
    setIsGenerating(true);
    try {
      const [{ pdf }, { default: PlayerProgressionPdf }, accentColor] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./PlayerProgressionPdf"),
        getLogoColor(data.clubLogoUrl),
      ]);
      const labels = {
        title: t("progressionReportTitle"),
        generatedOn: t("progressionGeneratedOn"),
        performanceTitle: t("progressionPerformanceTitle"),
        rating: t("statRating"),
        goalsOrSaves: data.isGoalkeeper ? t("playerStatSaves") : t("playerStatGoals"),
        assistsOrConceded: data.isGoalkeeper ? t("playerStatConceded") : t("playerStatAssists"),
        appearances: t("playerStatAppearances"),
        minutes: t("playerStatMinutes"),
        physicalTitle: t("progressionPhysicalTitle"),
        height: t("statHeight"),
        weight: t("statWeight"),
        sinceLast: t("progressionSinceLast"),
        sinceStart: t("progressionSinceStart"),
        trackingTitle: t("progressionTrackingTitle"),
        notes: t("playerNotesTitle"),
        videos: t("playerVideosTitle"),
        availabilityTitle: t("progressionAvailabilityTitle"),
        status: t("squadColumnStatus"),
        statusValue: t(statusLabelKey(data.availability.status)),
        injuries: t("injuryHistoryTitle"),
        injuryOngoing: t("injuryOngoingBadge"),
        injuryExpectedReturnLabel: t("injuryExpectedReturnPrefix"),
        footerNote: t("progressionFooterNote"),
        seasonTitle: t("progressionSeasonTitle"),
        weightChartTitle: t("progressionWeightChartTitle"),
        weightChartNotEnoughData: t("weightChartNotEnoughData"),
        notesEmpty: t("noNotesFound"),
        videosEmpty: t("videoNoneFound"),
        injuriesEmpty: t("noInjuryHistory"),
        durationDaysLabel: (count: number) => t("injuryDurationDays", { count }),
      };
      const blob = await pdf(
        <PlayerProgressionPdf
          data={data}
          labels={labels}
          accentColor={accentColor}
          generatedAt={new Date()}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeName = data.playerName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      link.download = `relatorio-progressao-${safeName || "jogador"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">📈 {t("progressionReportTitle")}</h2>
        <button
          type="button"
          onClick={handleDownload}
          disabled={isGenerating}
          className="shrink-0 rounded-full border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
        >
          {isGenerating ? t("savingClub") : `⬇ ${t("progressionReportDownload")}`}
        </button>
      </div>

      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("progressionPerformanceTitle")}
          </h3>

          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("playerStatAppearances")}</span>
              <span className="font-semibold">{data.seasonTotals.appearances ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("playerStatMinutes")}</span>
              <span className="font-semibold">{data.seasonTotals.minutes ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("statRating")}</span>
              <span className="font-semibold">{data.seasonTotals.rating?.toFixed(1) ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">
                {data.isGoalkeeper ? t("playerStatSaves") : t("playerStatGoals")}
              </span>
              <span className="font-semibold">{data.seasonTotals.goalsOrSaves ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">
                {data.isGoalkeeper ? t("playerStatConceded") : t("playerStatAssists")}
              </span>
              <span className="font-semibold">{data.seasonTotals.assistsOrConceded ?? "-"}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("progressionPhysicalTitle")}
          </h3>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("statHeight")}</span>
              <span className="font-semibold">
                {data.physical.heightCm != null ? `${data.physical.heightCm} cm` : "-"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("statWeight")}</span>
              <span className="font-semibold">
                {data.physical.currentWeight != null ? `${data.physical.currentWeight} kg` : "-"}{" "}
                <Delta value={weightSinceLast} />
              </span>
            </div>
            {weightSinceStart != null && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">{t("progressionSinceStart")}</span>
                <span className="font-semibold">
                  <Delta value={weightSinceStart} />
                </span>
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("progressionTrackingTitle")}
          </h3>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("playerNotesTitle")}</span>
              <span className="font-semibold">{data.tracking.notesCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("playerVideosTitle")}</span>
              <span className="font-semibold">{data.tracking.videosCount}</span>
            </div>
            {data.tracking.videosByCategory.map((c) => (
              <div key={c.category} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted">{c.label}</span>
                <span>{c.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("progressionAvailabilityTitle")}
          </h3>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("squadColumnStatus")}</span>
              <span className="font-semibold">{t(statusLabelKey(data.availability.status))}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">{t("injuryHistoryTitle")}</span>
              <span className="font-semibold">{data.availability.injuryCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
