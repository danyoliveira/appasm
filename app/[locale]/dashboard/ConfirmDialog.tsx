"use client";

import { useTranslations } from "next-intl";

export default function ConfirmDialog({
  open,
  message,
  isPending,
  onConfirm,
  onCancel,
  tone = "danger",
  icon,
  confirmLabel,
  cancelLabel,
}: {
  open: boolean;
  message: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  // "danger" (default) keeps the original destructive-delete look. "accent"
  // is for neutral/positive confirmations (e.g. "go to Match Mode?").
  tone?: "danger" | "accent";
  icon?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl"
      >
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
            tone === "danger" ? "bg-red-500/10" : "bg-accent/10"
          }`}
        >
          {icon ?? (tone === "danger" ? "⚠️" : "🏟️")}
        </div>
        <p className="mt-3 text-sm text-foreground">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <CancelButton onCancel={onCancel} label={cancelLabel} />
          <ConfirmButton isPending={isPending} onConfirm={onConfirm} tone={tone} label={confirmLabel} />
        </div>
      </div>
    </div>
  );
}

function CancelButton({ onCancel, label }: { onCancel: () => void; label?: string }) {
  const t = useTranslations("dashboard");
  return (
    <button
      type="button"
      onClick={onCancel}
      className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
    >
      {label ?? t("cancelButton")}
    </button>
  );
}

function ConfirmButton({
  isPending,
  onConfirm,
  tone,
  label,
}: {
  isPending?: boolean;
  onConfirm: () => void;
  tone: "danger" | "accent";
  label?: string;
}) {
  const t = useTranslations("dashboard");
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={onConfirm}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${
        tone === "danger" ? "bg-red-500 text-white" : "bg-accent text-accent-foreground"
      }`}
    >
      {isPending ? t("savingClub") : (label ?? t("deleteButton"))}
    </button>
  );
}
