"use client";

import { useTranslations } from "next-intl";
import { LIVE_EVENT_ICON, type LiveEntryRow } from "./liveStatsShared";

const EVENT_LABEL_KEYS: Record<string, string> = {
  goal: "liveEventGoal",
  assist: "liveEventAssist",
  yellow_card: "liveEventYellowCard",
  red_card: "liveEventRedCard",
  substitution: "liveEventSubstitution",
};

export default function LiveFeedList({
  entries,
  homeName,
  awayName,
  onDelete,
}: {
  entries: LiveEntryRow[];
  homeName: string;
  awayName: string;
  onDelete?: (id: string) => void;
}) {
  const t = useTranslations("dashboard");

  if (entries.length === 0) {
    return <p className="text-sm text-muted">{t("liveStatsEmptyFeed")}</p>;
  }

  return (
    <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
          <span className="shrink-0 text-sm">{entry.eventType ? LIVE_EVENT_ICON[entry.eventType] : "•"}</span>
          <span className="shrink-0 text-muted">
            {entry.minute != null ? `${entry.minute}${entry.extraMinute ? `+${entry.extraMinute}` : ""}'` : "—"}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{entry.eventType ? t(EVENT_LABEL_KEYS[entry.eventType]) : entry.notes}</span>
            {entry.playerName && <span className="text-muted"> · {entry.playerName}</span>}
            {entry.notes && entry.eventType && <span className="text-muted"> ({entry.notes})</span>}
          </span>
          {entry.teamSide && (
            <span className="shrink-0 truncate text-muted">
              {entry.teamSide === "home" ? homeName : awayName}
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(entry.id)}
              className="shrink-0 px-1 font-medium text-red-500 hover:underline"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
