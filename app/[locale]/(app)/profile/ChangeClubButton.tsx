"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import type { Country } from "@/lib/api-football/client";
import ClubPicker, { type CurrentClub } from "./ClubPicker";

// "Mudar clube" opens the picker in its own dialog — a focused place for the
// platform's most consequential setting, instead of a list unfolding in the
// middle of the profile page.
export default function ChangeClubButton({
  countries,
  currentClub,
}: {
  countries: Country[];
  currentClub: CurrentClub;
}) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
      >
        {t("changeClubButton")}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("changeClubModalTitle")}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-3xl border border-border bg-surface shadow-xl sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{t("changeClubModalTitle")}</h2>
                <p className="mt-0.5 text-xs text-muted">{t("changeClubModalHint")}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("cancelButton")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <ClubPicker countries={countries} currentClub={currentClub} onDone={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
