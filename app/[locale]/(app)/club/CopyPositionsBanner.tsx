"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Icon from "@/components/Icon";
import { copyPreviousPositions } from "../actions";
import type { CopyablePositionsSummary } from "./playerProfile";

// Positions are kept per spell, so a coach back at a club starts without
// them — this offers to bring over the ones set last time, for the players
// who have none yet. "Agora não" hides it on this device until the offer
// changes (another spell, a different number of players).
export default function CopyPositionsBanner({
  teamId,
  summary,
}: {
  teamId: number;
  summary: CopyablePositionsSummary;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const storageKey = `asm:copyPositionsDismissed:${teamId}:${summary.endedAt}:${summary.count}`;
  // Hidden until the saved choice has been read, so it never flashes for
  // someone who already said no.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(storageKey) === "1";
      } catch {}
      setHidden(dismissed);
    }, 0);
    return () => clearTimeout(id);
  }, [storageKey]);

  if (hidden) return null;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const period =
    formatDate(summary.startedAt) === formatDate(summary.endedAt)
      ? formatDate(summary.startedAt)
      : `${formatDate(summary.startedAt)} – ${formatDate(summary.endedAt)}`;

  function handleCopy() {
    setFailed(false);
    startTransition(async () => {
      try {
        await copyPreviousPositions(teamId);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  function handleDismiss() {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setHidden(true);
  }

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon name="target" className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{t("copyPositionsTitle")}</h3>
        <p className="text-xs text-muted">{t("copyPositionsHint", { period, count: summary.count })}</p>
        {failed && <p className="mt-1 text-xs text-red-500">{t("copyPositionsError")}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={isPending}
          onClick={handleDismiss}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          {t("copyPositionsDismiss")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleCopy}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? t("savingClub") : t("copyPositionsButton")}
        </button>
      </div>
    </div>
  );
}
