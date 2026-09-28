"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import PlayerAvatar from "@/components/PlayerAvatar";
import { dismissMergeSuggestion, mergeManualPlayer } from "../actions";
import { translatePosition } from "./playerShared";

export interface MergeCandidate {
  id: number;
  name: string;
  photo: string | null;
  position: string;
  number: number | null;
}

export interface MergeSuggestionView {
  manual: MergeCandidate;
  api: MergeCandidate;
}

// "The hand-added X looks like Y that just arrived from the API — merge?"
// Never merges on its own: the coach confirms (or dismisses) each pair.
export default function MergeSuggestions({ suggestions }: { suggestions: MergeSuggestionView[] }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<MergeSuggestionView | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!suggestions.length) return null;

  function renderCard(player: MergeCandidate, label: string) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-background p-3">
        <PlayerAvatar photo={player.photo} size="h-10 w-10" />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
          <div className="truncate text-sm font-semibold">{player.name}</div>
          <div className="text-xs text-muted">
            {[translatePosition(player.position, t), player.number != null ? `#${player.number}` : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2">
      {suggestions.map((s) => (
        <div
          key={`${s.manual.id}:${s.api.id}`}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 px-4 py-3"
        >
          <PlayerAvatar photo={s.manual.photo} size="h-8 w-8" />
          <p className="min-w-[200px] flex-1 text-sm">
            {t.rich("mergeSuggestionText", {
              manual: s.manual.name,
              api: s.api.name,
              b: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await dismissMergeSuggestion(s.manual.id, s.api.id);
                  router.refresh();
                })
              }
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              {t("mergeNotSameButton")}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setError(null);
                setConfirming(s);
              }}
              className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
            >
              {t("mergeButton")}
            </button>
          </div>
        </div>
      ))}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
          >
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold">{t("mergeConfirmTitle")}</h3>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                {renderCard(confirming.manual, t("mergeManualLabel"))}
                <span className="self-center text-muted sm:rotate-0">
                  <Icon name="chevron" />
                </span>
                {renderCard(confirming.api, t("mergeApiLabel"))}
              </div>
              <p className="text-sm text-muted">{t("mergeConfirmBody")}</p>
              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirming(null)}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
              >
                {t("cancelButton")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await mergeManualPlayer(confirming.manual.id, confirming.api.id);
                      setConfirming(null);
                      router.refresh();
                    } catch {
                      setError(t("mergeError"));
                    }
                  })
                }
                className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-sm disabled:opacity-50"
              >
                {isPending ? "..." : t("mergeButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
