"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  setPlayerAvailability,
  startPlayerInjury,
  confirmInjuryFromApi,
  dismissApiInjury,
  confirmPlayerReturn,
  updateInjuryExpectedReturn,
  type PlayerStatus,
} from "../../../actions";
import { StatusControl, InjuryConfirmBanner, type PendingInjury } from "../../playerShared";
import InjuryDetailsModal, { InjuryReturnBanner } from "../../InjuryTracking";

export function HeaderStatusChip({
  teamId,
  playerId,
  playerName,
  status,
  isCoach,
}: {
  teamId: number;
  playerId: number;
  playerName: string;
  status: PlayerStatus;
  isCoach: boolean;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  function handleStatusChange(next: PlayerStatus) {
    // "Injured" needs a description + expected return before it's real —
    // same rule as confirming one the API flagged — so it opens the modal
    // instead of writing the status straight away.
    if (next === "injured") {
      setModalOpen(true);
      return;
    }
    startTransition(async () => {
      await setPlayerAvailability(teamId, playerId, playerName, next);
      router.refresh();
    });
  }

  function handleSubmitInjury(description: string, expectedReturnAt: string | null) {
    startTransition(async () => {
      await startPlayerInjury(teamId, playerId, playerName, { description, expectedReturnAt });
      setModalOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <StatusControl
        status={status}
        isCoach={isCoach}
        isPending={isPending}
        onChange={handleStatusChange}
        t={t}
      />
      {modalOpen && (
        <InjuryDetailsModal
          playerName={playerName}
          isPending={isPending}
          onSubmit={handleSubmitInjury}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

export function PendingInjuryBanner({
  teamId,
  playerId,
  playerName,
  pendingInjury,
}: {
  teamId: number;
  playerId: number;
  playerName: string;
  pendingInjury: PendingInjury;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  function handleResolveInjury(isReal: boolean) {
    if (isReal) {
      setModalOpen(true);
      return;
    }
    startTransition(async () => {
      await dismissApiInjury(teamId, playerId, playerName, pendingInjury.key);
      router.refresh();
    });
  }

  function handleSubmitInjury(description: string, expectedReturnAt: string | null) {
    startTransition(async () => {
      await confirmInjuryFromApi(teamId, playerId, playerName, pendingInjury.key, {
        description,
        expectedReturnAt,
      });
      setModalOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <InjuryConfirmBanner
        pendingInjury={pendingInjury}
        isPending={isPending}
        onResolve={handleResolveInjury}
        t={t}
      />
      {modalOpen && (
        <InjuryDetailsModal
          playerName={playerName}
          initialDescription={pendingInjury.reason}
          isPending={isPending}
          onSubmit={handleSubmitInjury}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

export function InjuryReturnPrompt({
  teamId,
  playerId,
  playerName,
  injuryId,
  expectedReturnAt,
}: {
  teamId: number;
  playerId: number;
  playerName: string;
  injuryId: string;
  expectedReturnAt: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleConfirmReturn(actualReturnAt: string) {
    startTransition(async () => {
      await confirmPlayerReturn(teamId, playerId, playerName, injuryId, actualReturnAt);
      router.refresh();
    });
  }

  function handleUpdateExpectedReturn(nextExpectedReturnAt: string) {
    startTransition(async () => {
      await updateInjuryExpectedReturn(injuryId, nextExpectedReturnAt);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <InjuryReturnBanner
        expectedReturnAt={expectedReturnAt}
        isPending={isPending}
        onConfirmReturn={handleConfirmReturn}
        onUpdateExpectedReturn={handleUpdateExpectedReturn}
      />
    </div>
  );
}
