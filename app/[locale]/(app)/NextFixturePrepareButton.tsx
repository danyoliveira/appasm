"use client";

import { announceNavigation } from "@/components/NavigationProgress";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function NextFixturePrepareButton({
  preparationKey,
  isPrepared,
  opponentName,
  labels,
}: {
  // A calendar fixture's id, or "manual-<uuid>" for a game added by hand.
  preparationKey: number | string;
  isPrepared: boolean;
  opponentName: string;
  labels: {
    prepareAction: string;
    inProgressAction: string;
    confirmStart: string;
    cancel: string;
  };
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleClick() {
    if (isPrepared) {
      announceNavigation();
      router.push(`/preparations/${preparationKey}`);
    } else {
      setConfirmOpen(true);
    }
  }

  function handleConfirm() {
    announceNavigation();
    router.push(`/preparations/${preparationKey}`);
    setConfirmOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          isPrepared
            ? "mt-4 inline-block rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10"
            : "mt-4 inline-block rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
        }
      >
        {isPrepared ? labels.inProgressAction : labels.prepareAction}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        tone="accent"
        icon="🏟️"
        title={labels.confirmStart}
        message={opponentName}
        confirmLabel={labels.prepareAction}
        cancelLabel={labels.cancel}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
