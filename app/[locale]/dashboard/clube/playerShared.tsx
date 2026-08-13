import type { PlayerStatus } from "../actions";

export const POSITION_LABEL_KEYS: Record<string, string> = {
  Goalkeeper: "positionGoalkeeper",
  Defender: "positionDefender",
  Midfielder: "positionMidfielder",
  Attacker: "positionAttacker",
};

export function translatePosition(position: string, t: (key: string) => string) {
  const key = POSITION_LABEL_KEYS[position];
  return key ? t(key) : position;
}

export interface AvailabilityInfo {
  status: PlayerStatus;
  lastSeenInjuryKey: string | null;
  excluded: boolean;
}

export interface PendingInjury {
  key: string;
  reason: string;
}

export interface PlayerSeasonStat {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  conceded: number;
}

export const STATUS_DOT: Record<PlayerStatus, string> = {
  available: "bg-green-600",
  doubtful: "bg-yellow-500",
  injured: "bg-red-500",
  suspended: "bg-muted",
  unavailable: "bg-orange-500",
};

export const STATUS_TEXT: Record<PlayerStatus, string> = {
  available: "text-green-600",
  doubtful: "text-yellow-600",
  injured: "text-red-500",
  suspended: "text-muted",
  unavailable: "text-orange-600",
};

export const STATUS_KEYS = [
  "available",
  "doubtful",
  "injured",
  "suspended",
  "unavailable",
] as const;

export function statusLabelKey(status: PlayerStatus) {
  return {
    available: "statusAvailable",
    doubtful: "statusDoubtful",
    injured: "statusInjured",
    suspended: "statusSuspended",
    unavailable: "statusUnavailable",
  }[status];
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" strokeWidth={2}>
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusControl({
  status,
  isCoach,
  isPending,
  onChange,
  t,
}: {
  status: PlayerStatus;
  isCoach: boolean;
  isPending: boolean;
  onChange: (status: PlayerStatus) => void;
  t: (key: string) => string;
}) {
  if (!isCoach) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        <span className={STATUS_TEXT[status]}>{t(statusLabelKey(status))}</span>
      </span>
    );
  }

  return (
    <div className="relative w-fit">
      <select
        value={status}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value as PlayerStatus)}
        className={`appearance-none rounded-full border border-border bg-background py-1 pl-5 pr-6 text-xs font-medium outline-none focus:border-accent disabled:opacity-50 ${STATUS_TEXT[status]}`}
      >
        {STATUS_KEYS.map((key) => (
          <option key={key} value={key} className="text-foreground">
            {t(statusLabelKey(key))}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${STATUS_DOT[status]}`}
      />
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted">
        <ChevronIcon />
      </span>
    </div>
  );
}

export function InjuryConfirmBanner({
  pendingInjury,
  isPending,
  onResolve,
  t,
}: {
  pendingInjury: PendingInjury;
  isPending: boolean;
  onResolve: (isReal: boolean) => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  return (
    <div className="rounded-xl bg-yellow-500/10 p-2.5 text-xs">
      <p className="text-yellow-700 dark:text-yellow-500">
        {t("apiInjuryPrompt", { reason: pendingInjury.reason })}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onResolve(true)}
          className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
        >
          {t("confirmInjuryButton")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onResolve(false)}
          className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
        >
          {t("dismissInjuryButton")}
        </button>
      </div>
    </div>
  );
}
