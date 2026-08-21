"use client";

import { useTransition } from "react";
import { refreshClubData } from "../actions";

export default function RefreshButton({
  teamId,
  label,
  refreshingLabel,
}: {
  teamId: number;
  label: string;
  refreshingLabel: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => { await refreshClubData(teamId); })}
      className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent disabled:opacity-50"
    >
      {isPending ? refreshingLabel : label}
    </button>
  );
}
