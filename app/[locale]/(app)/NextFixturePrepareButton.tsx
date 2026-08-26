"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function NextFixturePrepareButton({
  fixtureId,
  isPrepared,
  opponentName,
  labels,
}: {
  fixtureId: number;
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
      router.push(`/preparations/${fixtureId}`);
    } else {
      setConfirmOpen(true);
    }
  }

  function handleConfirm() {
    router.push(`/preparations/${fixtureId}`);
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
