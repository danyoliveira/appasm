"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createLiveSession,
  getLiveSessionPresence,
  regenerateLiveSessionToken,
  setLiveSessionStatus,
  type LiveSessionInfo,
} from "./liveStatsActions";
import ConfirmDialog from "@/components/ConfirmDialog";

const PRESENCE_POLL_MS = 5000;

// One shareable link as a row: who it's for, how many have it open right
// now, and Abrir / Copiar / Novo link.
function CopyableLink({
  icon,
  label,
  hint,
  path,
  onlineCount,
  onRegenerate,
  isRegenerating,
}: {
  icon: string;
  label: string;
  hint: string;
  path: string;
  onlineCount: number | null;
  // Omitted for view-only access: the link is there to open or copy, not
  // to replace.
  onRegenerate?: () => void;
  isRegenerating: boolean;
}) {
  const t = useTranslations("dashboard");
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-base">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold">{label}</span>
            {onlineCount !== null && (
              <span
                title={t("liveStatsOnlineCountLabel", { count: onlineCount })}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  onlineCount > 0
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : "bg-background text-muted ring-1 ring-border"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${onlineCount > 0 ? "bg-green-500" : "bg-muted/60"}`} />
                {t("liveStatsOnlineShort", { count: onlineCount })}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted">{hint}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          {t("liveStatsOpenButton")} ↗
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            copied
              ? "bg-green-600 text-white"
              : "border border-border bg-surface text-foreground hover:border-accent hover:text-accent"
          }`}
        >
          {copied ? `✓ ${t("liveStatsCopiedLabel")}` : t("liveStatsCopyButton")}
        </button>
        {onRegenerate && (
          <button
            type="button"
            disabled={isRegenerating}
            onClick={onRegenerate}
            title={t("liveStatsRegenerateButton")}
            className="rounded-full px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-red-500 disabled:opacity-50"
          >
            {t("liveStatsRegenerateButton")}
          </button>
        )}
      </div>
    </div>
  );
}

// The ficha/formação/notas wizard only ever runs through the guest links —
// this dashboard tab is just session control: create it, share the
// links, start/end the match. Anyone but the coach gets the links alone
// (they record through them like any other holder of the link): no
// creating, ending, replacing a link or seeing who is online.
export default function LiveStatsPanel({
  preparationKey,
  isManager,
  initialSession,
}: {
  preparationKey: string;
  isManager: boolean;
  initialSession: LiveSessionInfo | null;
}) {
  const t = useTranslations("dashboard");
  const [session, setSession] = useState(initialSession);
  const [isCreating, setIsCreating] = useState(false);
  const [regenerating, setRegenerating] = useState<"member" | "viewer" | "gk" | null>(null);
  // Which link a confirmation is pending for — regenerating kills the old
  // link immediately (no grace period), so this always confirms first.
  const [confirmTarget, setConfirmTarget] = useState<"member" | "viewer" | "gk" | null>(null);
  const [memberOnline, setMemberOnline] = useState<number | null>(null);
  const [viewerOnline, setViewerOnline] = useState<number | null>(null);
  const [gkOnline, setGkOnline] = useState<number | null>(null);
  // "Terminar jogo" can't be undone from here (only from the input link's
  // Reiniciar) — always confirm.
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Lets the coach notice a link problem (regenerated, or nobody ever
  // opened it) within seconds instead of finding out mid-match — see
  // getLiveSessionPresence for how "online" is defined.
  useEffect(() => {
    if (!session || !isManager) return;
    const sessionId = session.id;
    let cancelled = false;

    async function poll() {
      const result = await getLiveSessionPresence(sessionId).catch(() => null);
      if (cancelled || !result) return;
      setMemberOnline(result.memberCount);
      setViewerOnline(result.viewerCount);
      setGkOnline(result.gkCoachCount);
    }

    poll();
    const interval = setInterval(poll, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // Only restart the poll loop when which session we're tracking changes
    // — not on every session field update (e.g. after ending the match),
    // which would just reset the interval's timer for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, isManager]);

  async function handleCreate() {
    setIsCreating(true);
    try {
      const created = await createLiveSession(preparationKey);
      setSession(created);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleEnd() {
    if (!session) return;
    setIsEnding(true);
    try {
      await setLiveSessionStatus(session.id, "end");
      setSession({ ...session, endedAt: new Date().toISOString() });
    } finally {
      setIsEnding(false);
      setConfirmEnd(false);
    }
  }

  async function handleConfirmRegenerate() {
    if (!session || !confirmTarget) return;
    const which = confirmTarget;
    setConfirmTarget(null);
    setRegenerating(which);
    try {
      const updated = await regenerateLiveSessionToken(session.id, which);
      setSession(updated);
    } finally {
      setRegenerating(null);
    }
  }

  if (!session) {
    if (!isManager) return null;
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-surface to-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-3xl">
          ⚡
        </div>
        <h3 className="mt-4 text-lg font-semibold tracking-tight">{t("liveModeCardTitle")}</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t("liveModeCardSubtitle")}</p>
        <button
          type="button"
          disabled={isCreating}
          onClick={handleCreate}
          className="mt-5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isCreating ? t("savingClub") : t("liveStatsCreateButton")}
        </button>
      </div>
    );
  }

  const isEnded = Boolean(session.endedAt);
  const isLive = Boolean(session.startedAt && !isEnded);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-surface to-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xl">
            ⚡
          </span>
          <div>
            <h3 className="text-sm font-semibold">{t("liveModeCardTitle")}</h3>
            <p className="flex items-center gap-1.5 text-xs text-muted">
              {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
              {isEnded ? t("liveStatsEnded") : isLive ? t("countdownLive") : t("liveStatsNotStarted")}
            </p>
          </div>
        </div>
        {isLive && isManager && (
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="shrink-0 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("liveStatsEndButton")}
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-muted">
        {isEnded ? t("liveStatsEndedHint") : isManager ? t("liveStatsLinksHint") : t("liveStatsLinksViewerHint")}
      </p>

      <div className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        <CopyableLink
          icon="✎"
          label={t("liveStatsMemberLinkLabel")}
          hint={t("liveStatsMemberLinkHint")}
          path={session.memberLink}
          onlineCount={memberOnline}
          onRegenerate={isManager ? () => setConfirmTarget("member") : undefined}
          isRegenerating={regenerating === "member"}
        />
        <CopyableLink
          icon="👁"
          label={t("liveStatsViewerLinkLabel")}
          hint={t("liveStatsViewerLinkHint")}
          path={session.viewerLink}
          onlineCount={viewerOnline}
          onRegenerate={isManager ? () => setConfirmTarget("viewer") : undefined}
          isRegenerating={regenerating === "viewer"}
        />
        <CopyableLink
          icon="🧤"
          label={t("liveStatsGkLinkLabel")}
          hint={t("liveStatsGkLinkHint")}
          path={session.gkLink}
          onlineCount={gkOnline}
          onRegenerate={isManager ? () => setConfirmTarget("gk") : undefined}
          isRegenerating={regenerating === "gk"}
        />
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        message={
          confirmTarget === "member"
            ? t("liveStatsRegenerateMemberConfirm")
            : confirmTarget === "viewer"
              ? t("liveStatsRegenerateViewerConfirm")
              : t("liveStatsRegenerateGkConfirm")
        }
        isPending={regenerating !== null}
        confirmLabel={t("liveStatsRegenerateButton")}
        onConfirm={handleConfirmRegenerate}
        onCancel={() => setConfirmTarget(null)}
      />
      <ConfirmDialog
        open={confirmEnd}
        message={t("liveStatsEndConfirm")}
        isPending={isEnding}
        confirmLabel={t("liveStatsEndButton")}
        onConfirm={handleEnd}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
}
