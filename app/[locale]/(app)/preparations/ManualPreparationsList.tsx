"use client";

import { useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { deleteManualPreparation } from "../actions";

export interface ManualPreparationRow {
  id: string;
  matchDate: string;
  opponentName: string;
  opponentLogo: string;
}

export default function ManualPreparationsList({
  rows,
  locale,
  isCoach,
}: {
  rows: ManualPreparationRow[];
  locale: string;
  isCoach: boolean;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteManualPreparation(id);
      router.refresh();
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-muted">{t("preparationManualSectionTitle")}</h2>
      <div className="mt-2 divide-y divide-border rounded-2xl border border-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <Link
              href={`/preparations/manual-${row.id}`}
              className="flex min-w-0 flex-1 items-center gap-2 hover:text-accent"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.opponentLogo} alt="" className="h-5 w-5 shrink-0 object-contain" />
              <span className="truncate">{row.opponentName}</span>
              <span className="shrink-0 text-xs text-muted">
                {new Date(row.matchDate).toLocaleDateString(locale)}{" "}
                {new Date(row.matchDate).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </Link>
            {isCoach && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleDelete(row.id)}
                className="shrink-0 text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
              >
                {t("deleteButton")}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
