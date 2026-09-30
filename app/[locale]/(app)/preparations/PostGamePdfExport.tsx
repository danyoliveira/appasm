"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getLiveMatchRecap } from "./liveStatsActions";
import type { TeamColors } from "./useTeamColors";

// "Download PDF" for the Pós-Jogo tab — same spot and look as the Pré-Jogo
// one. The match summary is fetched when the button is pressed (the tab's
// own copy lives further down the tree), so the report is always current.
export default function PostGamePdfExport({
  sessionId,
  matchDate,
  competition,
  notes,
  teamColors,
}: {
  sessionId: string;
  matchDate: string | null;
  competition: string | null;
  // The coach's saved post-match analysis.
  notes: string | null;
  teamColors: TeamColors;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [isGenerating, setIsGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleDownload() {
    setIsGenerating(true);
    setFailed(false);
    try {
      const [recap, { pdf }, { default: PostGamePdf }, { registerPdfFonts }, { buildPostGamePdfData }] =
        await Promise.all([
          getLiveMatchRecap(sessionId),
          import("@react-pdf/renderer"),
          import("./PostGamePdf"),
          import("@/lib/pdfFonts"),
          import("./postGamePdfData"),
        ]);
      if (!recap) {
        setFailed(true);
        return;
      }
      registerPdfFonts();
      const ours = { color: teamColors.usColor, text: teamColors.usTextColor };
      const theirs = { color: teamColors.opponentColor, text: teamColors.opponentTextColor };
      const home = recap.ourSide === "home" ? ours : theirs;
      const away = recap.ourSide === "home" ? theirs : ours;
      const data = buildPostGamePdfData(
        recap,
        {
          matchDate,
          competition,
          notes,
          colors: { home: home.color, homeText: home.text, away: away.color, awayText: away.text },
        },
        t,
      );
      const blob = await pdf(
        <PostGamePdf
          data={data}
          labels={{
            title: t("postGamePdfTitle"),
            generatedOn: t("progressionGeneratedOn"),
            matchDateLabel: t("preGamePdfMatchDate"),
            notesTitle: t("postGameNotesTitle"),
            eventsTitle: t("liveStatsEventsListTitle"),
            formationTitle: t("liveStatsFormationTitle"),
            substitutesLabel: t("liveStatsSubstitutesLabel"),
            collectiveTitle: t("collectiveStatsTitle"),
            possessionLabel: t("collectivePossessionLabel"),
            gkTitle: t("gkStatsTitle"),
            noEvents: t("liveStatsEmptyFeed"),
            footerNote: t("progressionFooterNote"),
          }}
          generatedAt={new Date()}
          locale={locale}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const slug = (name: string) =>
        name
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      link.download = `pos-jogo-${slug(recap.homeName)}-${slug(recap.awayName)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={isGenerating}
      title={failed ? t("liveConfigSaveError") : undefined}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        failed ? "border-red-500 text-red-500" : "border-accent text-accent hover:bg-accent/10"
      }`}
    >
      {isGenerating ? t("savingClub") : `⬇ ${t("progressionReportDownload")}`}
    </button>
  );
}
