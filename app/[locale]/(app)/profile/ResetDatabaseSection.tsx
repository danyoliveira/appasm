"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import { resetDatabase } from "../actions";

// Perfil → Utilização, coach only: a full factory reset of the platform.
// Kept far from every other setting (own red-tinted card, own dialog with a
// typed confirmation phrase instead of a plain OK/cancel) because unlike
// everything else here, this can't be undone by re-editing a field —
// there's nothing left afterwards to edit.
export default function ResetDatabaseSection() {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  const phrase = t("resetDatabaseConfirmPhrase");
  const canConfirm = confirmText === phrase;

  function confirm() {
    if (!canConfirm) return;
    // No try/catch here: resetDatabase() redirects to "/" on success, and
    // redirect() works by throwing — the same shape as signOut() elsewhere
    // in the sidebar. Anything that fails before that point (not
    // authorized, a truncate error) surfaces through the app's error
    // boundary, which is the right outcome for a rare, admin-only action.
    startTransition(async () => {
      await resetDatabase();
    });
  }

  function close() {
    if (isPending) return;
    setOpen(false);
    setConfirmText("");
  }

  return (
    <section className="rounded-2xl border border-red-500/30 bg-red-500/[0.03] p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
          <Icon name="trash" className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold text-red-600 dark:text-red-400">{t("resetDatabaseTitle")}</h2>
      </div>
      <p className="mt-2 text-sm text-muted">{t("resetDatabaseHint")}</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 flex items-center gap-1.5 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
        {t("resetDatabaseButton")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-[overlay-in_150ms_ease-out]"
          onClick={close}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl animate-[dialog-in_180ms_ease-out]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/10 text-lg">⚠️</div>
            <h2 className="mt-3 text-base font-semibold">{t("resetDatabaseDialogTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("resetDatabaseDialogMessage")}</p>

            <label className="mt-4 block text-sm">
              <span className="text-muted">{t("resetDatabaseConfirmInstruction", { phrase: `"${phrase}"` })}</span>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder={phrase}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-red-500"
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                {t("cancelButton")}
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!canConfirm || isPending}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {isPending ? t("resetDatabaseInProgress") : t("resetDatabaseConfirmButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
