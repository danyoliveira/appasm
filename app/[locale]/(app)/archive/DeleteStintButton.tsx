"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icon";
import { deleteArchivedStint } from "../actions";

// Removes an ended spell from the archive (a club picked by mistake, a
// test). An icon on the archive list, a labelled button on the spell's own
// page — which then goes back to the list.
export default function DeleteStintButton({
  stintId,
  clubName,
  period,
  preparations,
  variant,
}: {
  stintId: string;
  clubName: string;
  period: string;
  // Preparations made during the spell — they are kept, but no longer
  // reachable from the archive, so the confirmation says so.
  preparations: number;
  variant: "icon" | "button";
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirmDelete() {
    setFailed(false);
    startTransition(async () => {
      try {
        await deleteArchivedStint(stintId);
        setOpen(false);
        if (variant === "button") router.replace("/archive");
        else router.refresh();
      } catch {
        setOpen(false);
        setFailed(true);
      }
    });
  }

  const message = [
    t("archiveDeleteStintMessage"),
    preparations > 0 ? t("archiveDeleteStintPreparations", { count: preparations }) : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("archiveDeleteStint")}
          title={failed ? t("archiveDeleteStintError") : t("archiveDeleteStint")}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-red-500/10 hover:text-red-500 ${
            failed ? "text-red-500" : "text-muted"
          }`}
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-red-500/40 hover:text-red-500"
          >
            <Icon name="trash" className="h-3.5 w-3.5" />
            {t("archiveDeleteStint")}
          </button>
          {failed && <span className="text-xs text-red-500">{t("archiveDeleteStintError")}</span>}
        </div>
      )}

      <ConfirmDialog
        open={open}
        title={t("archiveDeleteStintTitle", { club: clubName, period })}
        message={message}
        isPending={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setOpen(false)}
        confirmLabel={t("archiveDeleteStint")}
      />
    </>
  );
}
