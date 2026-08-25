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
  label,
  path,
  onRegenerate,
  isRegenerating,
}: {
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
    <div>
      <label className="mb-1 block text-xs text-muted">{label}</label>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="w-full truncate rounded-md border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none"
        />
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          {copied ? t("liveStatsCopiedLabel") : t("liveStatsCopyButton")}
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
      <button
        type="button"
        disabled={isCreating}
        onClick={handleCreate}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {t("liveStatsCreateButton")}
      </button>
    );
  }

  if (!isManager) return null;

  const isLive = Boolean(session.startedAt && !session.endedAt);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          <CopyableLink
            label={t("liveStatsMemberLinkLabel")}
            path={session.memberLink}
            onRegenerate={() => setConfirmTarget("member")}
            isRegenerating={regenerating === "member"}
          />
          <CopyableLink
            label={t("liveStatsViewerLinkLabel")}
            path={session.viewerLink}
            onRegenerate={() => setConfirmTarget("viewer")}
            isRegenerating={regenerating === "viewer"}
          />
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
