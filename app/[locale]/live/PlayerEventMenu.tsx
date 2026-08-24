"use client";

import { useTranslations } from "next-intl";
import { LIVE_EVENT_ICON, lastName, type LineupPlayer, type LiveEventType } from "./liveStatsShared";

const MENU_EVENT_TYPES: LiveEventType[] = ["goal", "assist", "yellow_card", "red_card"];

const EVENT_LABEL_KEYS: Record<LiveEventType, string> = {
  goal: "liveEventGoal",
  assist: "liveEventAssist",
  yellow_card: "liveEventYellowCard",
  red_card: "liveEventRedCard",
  substitution: "liveEventSubstitution",
};

export default function PlayerEventMenu({
  open,
  mode,
  playerName,
  playerNumber,
  benchPlayers,
  isPending,
  onSelectEvent,
  onRequestSubstitute,
  onConfirmSubstitute,
  onBack,
  onCancel,
}: {
  open: boolean;
  // "menu" — pick a stat event or start a substitution.
  // "substitute" — pick who comes on from the bench.
  mode: "menu" | "substitute";
  playerName: string;
  playerNumber: number | null;
  benchPlayers: LineupPlayer[];
  isPending?: boolean;
  onSelectEvent: (eventType: LiveEventType) => void;
  onRequestSubstitute: () => void;
  onConfirmSubstitute: (inPlayer: LineupPlayer) => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("dashboard");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
      >
        {mode === "menu" ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("liveStatsAddEventTitle")}</p>
            <p className="mt-1 text-sm font-medium">
              {playerNumber != null ? `${playerNumber} · ` : ""}
              {lastName(playerName)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {MENU_EVENT_TYPES.map((eventType) => (
                <button
                  key={eventType}
                  type="button"
                  disabled={isPending}
                  onClick={() => onSelectEvent(eventType)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  <span className="text-xl">{LIVE_EVENT_ICON[eventType]}</span>
                  {t(EVENT_LABEL_KEYS[eventType])}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending || benchPlayers.length === 0}
                onClick={onRequestSubstitute}
                className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <span className="text-xl">{LIVE_EVENT_ICON.substitution}</span>
                {t("liveEventSubstitution")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("liveStatsSubstituteInLabel")}
            </p>
            <p className="mt-1 text-sm font-medium">
              {t("liveStatsSubstituteOutLabel", { name: lastName(playerName) })}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {benchPlayers.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={isPending}
                  onClick={() => onConfirmSubstitute(p)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  <span className="w-5 shrink-0 text-xs text-muted">{p.number ?? ""}</span>
                  {lastName(p.name)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onBack}
              className="mt-4 w-full rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
            >
              ← {t("liveStatsBackButton")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 w-full rounded-full px-4 py-2 text-center text-xs font-medium text-muted hover:underline"
        >
          {t("cancelButton")}
        </button>
      </div>
    </div>
  );
}
