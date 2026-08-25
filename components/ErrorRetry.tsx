"use client";

import { useTranslations } from "next-intl";

// Shared body for every route's error.tsx — Next.js swaps the nearest one
// of these in when that segment's Server Component throws, keeping the
// surrounding layout (sidebar, header) intact instead of losing the whole
// page to Next's generic error screen.
export default function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("common");

  return (
    <div className="mx-auto flex min-h-[40vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-foreground">{t("errorTitle")}</p>
      <p className="mt-1 text-sm text-muted">{t("errorMessage")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        {t("errorRetryButton")}
      </button>
    </div>
  );
}
