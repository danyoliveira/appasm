"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { LIVE_EVENT_ICON, LIVE_EVENT_TYPES, type LiveEntryInput, type LiveEventType } from "./liveStatsShared";

const EVENT_LABEL_KEYS: Record<LiveEventType, string> = {
  goal: "liveEventGoal",
  assist: "liveEventAssist",
  yellow_card: "liveEventYellowCard",
  red_card: "liveEventRedCard",
  substitution: "liveEventSubstitution",
};

export default function LiveEntryForm({
  homeName,
  awayName,
  onSubmit,
}: {
  homeName: string;
  awayName: string;
  onSubmit: (input: LiveEntryInput) => Promise<void>;
}) {
  const t = useTranslations("dashboard");
  const [eventType, setEventType] = useState<LiveEventType | null>(null);
  const [teamSide, setTeamSide] = useState<"home" | "away">("home");
  const [minute, setMinute] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, startSaving] = useTransition();

  if (!eventType) {
    return (
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("liveStatsAddEventTitle")}
        </h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {LIVE_EVENT_TYPES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setEventType(key)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
            >
              <span>{LIVE_EVENT_ICON[key]}</span>
              {t(EVENT_LABEL_KEYS[key])}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function reset() {
    setEventType(null);
    setTeamSide("home");
    setMinute("");
    setPlayerName("");
    setNotes("");
  }

  function handleSubmit() {
    if (!eventType) return;
    startSaving(async () => {
      await onSubmit({
        eventType,
        teamSide,
        minute: minute.trim() ? Number(minute.trim()) : null,
        extraMinute: null,
        playerName,
        notes,
      });
      reset();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <span>{LIVE_EVENT_ICON[eventType]}</span>
          {t(EVENT_LABEL_KEYS[eventType])}
        </h4>
        <button type="button" onClick={reset} className="text-xs text-muted hover:text-foreground">
          {t("cancelButton")}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="mb-1 block text-xs text-muted">{t("liveStatsTeamSideLabel")}</label>
          <select
            value={teamSide}
            onChange={(e) => setTeamSide(e.target.value as "home" | "away")}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="home">{homeName}</option>
            <option value="away">{awayName}</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">{t("liveStatsMinuteLabel")}</label>
          <input
            type="number"
            min={0}
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-muted">{t("liveStatsPlayerLabel")}</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs text-muted">{t("videoNotesLabel")}</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>

      <button
        type="button"
        disabled={isSaving}
        onClick={handleSubmit}
        className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? t("savingClub") : t("liveStatsSendButton")}
      </button>
    </div>
  );
}
