"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  setPlayerAvailability,
  resolveApiInjury,
  type PlayerStatus,
} from "../../../actions";
import { StatusControl, InjuryConfirmBanner, type PendingInjury } from "../../playerShared";

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

  function handleStatusChange(next: PlayerStatus) {
    startTransition(async () => {
      await setPlayerAvailability(teamId, playerId, playerName, next);
      router.refresh();
    });
  }

  return (
    <StatusControl
      status={status}
      isCoach={isCoach}
      isPending={isPending}
      onChange={handleStatusChange}
      t={t}
    />
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

  function handleResolveInjury(isReal: boolean) {
    startTransition(async () => {
      await resolveApiInjury(teamId, playerId, playerName, pendingInjury.key, isReal);
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
    </div>
  );
}
