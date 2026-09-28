"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import PlayerCombobox, { type ComboboxPlayer } from "@/components/PlayerCombobox";
import ConfirmDialog from "@/components/ConfirmDialog";
import { mergeManualPlayer } from "../../../actions";

// Shown on a hand-added player's page: "this is actually <API player>" —
// for the cases the automatic suggestion doesn't catch (nicknames, very
// different spellings).
export default function ManualPlayerMergePanel({
  manualPlayerId,
  apiPlayers,
}: {
  manualPlayerId: number;
  apiPlayers: ComboboxPlayer[];
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = apiPlayers.find((p) => p.id === targetId) ?? null;

  return (
    <div className="mt-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sky-700 dark:text-sky-400">
          <Icon name="user" />
        </span>
        <p className="min-w-[200px] flex-1 text-sm">{t("manualPlayerPageNotice")}</p>
        {!open && apiPlayers.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
          >
            {t("mergeWithButton")}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <PlayerCombobox
            players={apiPlayers}
            value={targetId}
            onChange={setTargetId}
            placeholder={t("mergeWithPlaceholder")}
            noResultsLabel={t("dossierNoPlayersFound")}
            className="flex-1"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
            >
              {t("cancelButton")}
            </button>
            <button
              type="button"
              disabled={!target || isPending}
              onClick={() => setConfirming(true)}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
            >
              {t("mergeButton")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <ConfirmDialog
        open={confirming}
        message={t("mergeConfirmBodyNamed", { name: target?.name ?? "" })}
        isPending={isPending}
        onConfirm={() => {
          if (!target) return;
          startTransition(async () => {
            try {
              await mergeManualPlayer(manualPlayerId, target.id);
              setConfirming(false);
              router.replace(`/club/player/${target.id}`);
            } catch {
              setConfirming(false);
              setError(t("mergeError"));
            }
          });
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
