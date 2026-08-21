"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { deletePreparationVideo } from "../actions";

export interface PreparationVideoRow {
  id: string;
  url: string;
  notes: string | null;
  embedUrl: string | null;
}

export default function PreparationVideoList({
  rows,
  isCoach,
}: {
  rows: PreparationVideoRow[];
  isCoach: boolean;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deletePreparationVideo(id);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return <p className="mt-2 text-sm text-muted">{t("videoNoneFound")}</p>;
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-border bg-background p-3">
          {row.embedUrl ? (
            <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                src={row.embedUrl}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <a
              href={row.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium text-accent hover:underline"
            >
              {row.url} ↗
            </a>
          )}

          {row.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{row.notes}</p>}

          {isCoach && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleDelete(row.id)}
              className="mt-2 text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
            >
              {t("deleteButton")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
