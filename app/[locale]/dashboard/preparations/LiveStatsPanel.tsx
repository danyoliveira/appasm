"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  createLiveSession,
  regenerateLiveSessionToken,
  setLiveSessionStatus,
  type LiveSessionInfo,
} from "./liveStatsActions";
import ConfirmDialog from "../ConfirmDialog";

function CopyableLink({
  icon,
  label,
  path,
  onRegenerate,
  isRegenerating,
}: {
  icon: string;
  label: string;
  path: string;
  onRegenerate: () => void;
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
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px]">
          {icon}
        </span>
        {label}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="w-full truncate rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            copied
              ? "bg-green-600 text-white"
              : "border border-border text-muted hover:border-accent hover:text-accent"
          }`}
        >
          {copied ? `✓ ${t("liveStatsCopiedLabel")}` : t("liveStatsCopyButton")}
        </button>
        <button
          type="button"
          disabled={isRegenerating}
          onClick={onRegenerate}
          title={t("liveStatsRegenerateButton")}
          className="shrink-0 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-red-500 hover:text-red-500 disabled:opacity-50"
        >
          {t("liveStatsRegenerateButton")}
        </button>
      </div>
    </div>
  );
}

// The ficha/formação/notas wizard only ever runs through the guest links —
// this dashboard tab is just session control: create it, share the two
// links, start/end the match.
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
  const [regenerating, setRegenerating] = useState<"member" | "viewer" | null>(null);
  // Which link a confirmation is pending for — regenerating kills the old
  // link immediately (no grace period), so this always confirms first.
  const [confirmTarget, setConfirmTarget] = useState<"member" | "viewer" | null>(null);

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
    await setLiveSessionStatus(session.id, "end");
    setSession({ ...session, endedAt: new Date().toISOString() });
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

  if (!isManager) return null;

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
            <p className="text-xs text-muted">
              {isEnded ? t("liveStatsEnded") : isLive ? t("countdownLive") : t("liveStatsNotStarted")}
            </p>
          </div>
        </div>
        {isLive && (
          <button
            type="button"
            onClick={handleEnd}
            className="shrink-0 rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            {t("liveStatsEndButton")}
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CopyableLink
          icon="✎"
          label={t("liveStatsMemberLinkLabel")}
          path={session.memberLink}
          onRegenerate={() => setConfirmTarget("member")}
          isRegenerating={regenerating === "member"}
        />
        <CopyableLink
          icon="👁"
          label={t("liveStatsViewerLinkLabel")}
          path={session.viewerLink}
          onRegenerate={() => setConfirmTarget("viewer")}
          isRegenerating={regenerating === "viewer"}
        />
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        message={
          confirmTarget === "member"
            ? t("liveStatsRegenerateMemberConfirm")
            : t("liveStatsRegenerateViewerConfirm")
        }
        isPending={regenerating !== null}
        confirmLabel={t("liveStatsRegenerateButton")}
        onConfirm={handleConfirmRegenerate}
        onCancel={() => setConfirmTarget(null)}
      />
    </div>
  );
}
