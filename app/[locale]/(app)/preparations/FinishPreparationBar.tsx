"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icon";
import { setPreparationFinished } from "../actions";

// Top of the Pós-Jogo tab: once the game is over the coach finishes the
// preparation (Concluída — read-only until reopened); after that it shows
// when it was finished, with a way to reopen it.
export default function FinishPreparationBar({
  preparationKey,
  finishedAt,
  gameOver,
  isCoach,
}: {
  preparationKey: string;
  finishedAt: string | null;
  // Only offered after the game.
  gameOver: boolean;
  isCoach: boolean;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"finish" | "reopen" | null>(null);
  const [failed, setFailed] = useState(false);

  if (!finishedAt && (!gameOver || !isCoach)) return null;

  function run(finished: boolean) {
    setFailed(false);
    startTransition(async () => {
      try {
        await setPreparationFinished(preparationKey, finished);
        setConfirm(null);
        router.refresh();
      } catch {
        setFailed(true);
        setConfirm(null);
      }
    });
  }

  return (
    <div className="mb-4">
      {finishedAt ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-green-600/30 bg-green-600/5 px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <Icon name="check" className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">
              {t("preparationFinishedOn", {
                date: new Date(finishedAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
              })}
            </p>
            <p className="text-xs text-muted">{t("preparationFinishedReadOnlyHint")}</p>
          </div>
          {isCoach && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirm("reopen")}
              className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              {t("preparationReopenButton")}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent/5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("preparationFinishTitle")}</p>
            <p className="text-xs text-muted">{t("preparationFinishHint")}</p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirm("finish")}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            <Icon name="check" className="h-4 w-4" />
            {t("preparationFinishButton")}
          </button>
        </div>
      )}
      {failed && <p className="mt-2 text-xs text-red-500">{t("preparationFinishError")}</p>}

      <ConfirmDialog
        open={confirm != null}
        tone="accent"
        message={confirm === "reopen" ? t("preparationReopenConfirm") : t("preparationFinishConfirm")}
        confirmLabel={confirm === "reopen" ? t("preparationReopenButton") : t("preparationFinishButton")}
        isPending={isPending}
        onConfirm={() => run(confirm === "finish")}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
