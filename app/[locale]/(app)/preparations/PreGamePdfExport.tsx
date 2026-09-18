"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { TacticalSnapshotRow } from "./TacticalSnapshotList";
import type { PreparationVideoRow } from "./PreparationVideoList";
import type { TeamColors } from "./useTeamColors";
import { CATEGORY_LABEL_KEYS, SUBMOMENT_LABEL_KEYS } from "./gameMomentLabels";
import { VIDEO_CATEGORIES, type GameSubmoment, type VideoCategory } from "./videoCategories";

export default function PreGamePdfExport({
  ourTeamName,
  opponentName,
  tacticalRows,
  videoRows,
  teamColors,
}: {
  ourTeamName: string;
  opponentName: string;
  tacticalRows: TacticalSnapshotRow[];
  videoRows: PreparationVideoRow[];
  teamColors: TeamColors;
}) {
  const t = useTranslations("dashboard");
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleDownload() {
    setIsGenerating(true);
    try {
      const [{ pdf }, { default: PreGamePdf }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./PreGamePdf"),
      ]);

      const categoryLabels = Object.fromEntries(
        VIDEO_CATEGORIES.map((key) => [key, t(CATEGORY_LABEL_KEYS[key])]),
      ) as Record<VideoCategory, string>;
      const submomentLabels = Object.fromEntries(
        Object.keys(SUBMOMENT_LABEL_KEYS).map((key) => [key, t(SUBMOMENT_LABEL_KEYS[key as GameSubmoment])]),
      ) as Record<GameSubmoment, string>;

      const labels = {
        title: t("preGamePdfTitle"),
        generatedOn: t("progressionGeneratedOn"),
        tacticalSectionTitle: t("tacticalAnalysisTitle"),
        videoSectionTitle: t("videoAnalysisTitle"),
        ourTeamLabel: t("tacticalOurTeamTab"),
        opponentLabel: t("preparationOpponentLabel"),
        categoryLabels,
        submomentLabels,
        noTacticalSnapshots: t("tacticalNoneSaved"),
        noVideos: t("videoNoneFound"),
        videoPlayerPrefix: t("videoPlayerLabel"),
        videoTagLabel: t("videoTagLabel"),
        footerNote: t("progressionFooterNote"),
      };

      const blob = await pdf(
        <PreGamePdf
          data={{ ourTeamName, opponentName, tacticalRows, videoRows }}
          labels={labels}
          teamColors={teamColors}
          generatedAt={new Date()}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeOpponent = opponentName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      link.download = `pre-jogo-${safeOpponent || "adversario"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isGenerating}
      className="shrink-0 rounded-full border border-accent px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
    >
      {isGenerating ? t("savingClub") : `⬇ ${t("progressionReportDownload")}`}
    </button>
  );
}
