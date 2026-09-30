"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import ConfirmDialog from "@/components/ConfirmDialog";
import { updateMemberRole, setMemberStatus, cancelInvite } from "../actions";
import { SectionHeading } from "../OpponentScouting";

export interface Member {
  id: string;
  email: string;
  full_name: string | null;
  role: "coach" | "member" | "viewer";
  status: "active" | "revoked";
}

// An invite that was generated but not used yet.
export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
}

export default function MembersSection({
  members,
  pendingInvites,
}: {
  members: Member[];
  pendingInvites: PendingInvite[];
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Revoking locks someone out straight away — it asks first.
  const [revokeTarget, setRevokeTarget] = useState<Member | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PendingInvite | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  function run(action: () => Promise<void>) {
    setFailed(false);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch {
        setFailed(true);
      } finally {
        setRevokeTarget(null);
        setCancelTarget(null);
      }
    });
  }

  function copyInviteLink(invite: PendingInvite) {
    navigator.clipboard.writeText(`${window.location.origin}/${locale}/register?token=${invite.token}`).then(() => {
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  const roleLabel = (role: string) => (role === "viewer" ? t("roleViewer") : t("roleMember"));

  return (
    <div>
      <SectionHeading icon="users" title={t("membersSectionTitle")} count={members.length} />

      {members.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("noMembersYet")}</p>
      ) : (
        <div className="mt-4 divide-y divide-border rounded-xl border border-border bg-background">
          {members.map((member) => {
            const revoked = member.status === "revoked";
            return (
              <div key={member.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className={`min-w-0 flex-1 ${revoked ? "opacity-60" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{member.full_name || member.email}</span>
                    {revoked && (
                      <span className="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                        {t("memberRevokedBadge")}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted">{member.email}</div>
                </div>

                {/* New people only ever get "Visualização". Someone still on
                    the old "Edição" access keeps the picker, so they can be
                    moved over. */}
                {member.role !== "member" ? (
                  <span className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-muted">
                    {roleLabel(member.role)}
                  </span>
                ) : (
                <select
                  value={member.role}
                  disabled={isPending || revoked}
                  aria-label={t("inviteRoleLabel")}
                  onChange={(e) => {
                    const role = e.target.value as "member" | "viewer";
                    run(() => updateMemberRole(member.id, role));
                  }}
                  className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
                >
                  <option value="member">{t("roleMember")}</option>
                  <option value="viewer">{t("roleViewer")}</option>
                </select>
                )}

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    revoked ? run(() => setMemberStatus(member.id, "active")) : setRevokeTarget(member)
                  }
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    revoked
                      ? "border-accent text-accent hover:bg-accent/10"
                      : "border-border text-muted hover:border-red-500 hover:text-red-500"
                  }`}
                >
                  {revoked ? t("reactivateAccessButton") : t("revokeAccessButton")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {t("pendingInvitesTitle")}
            <span className="tabular-nums">· {pendingInvites.length}</span>
          </h3>
          <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{invite.email}</div>
                  <div className="text-xs text-muted">
                    {roleLabel(invite.role)} ·{" "}
                    {t("pendingInviteExpires", {
                      date: new Date(invite.expires_at).toLocaleDateString(locale, { day: "numeric", month: "short" }),
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyInviteLink(invite)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    copiedId === invite.id
                      ? "bg-green-600 text-white"
                      : "border border-border bg-surface text-foreground hover:border-accent hover:text-accent"
                  }`}
                >
                  {copiedId === invite.id ? `✓ ${t("liveStatsCopiedLabel")}` : t("pendingInviteCopyLink")}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setCancelTarget(invite)}
                  className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-red-500 disabled:opacity-50"
                >
                  {t("pendingInviteCancel")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {failed && <p className="mt-3 text-sm text-red-500">{t("liveConfigSaveError")}</p>}

      <ConfirmDialog
        open={revokeTarget != null}
        message={t("revokeAccessConfirm", { name: revokeTarget?.full_name || revokeTarget?.email || "" })}
        confirmLabel={t("revokeAccessButton")}
        isPending={isPending}
        onConfirm={() => revokeTarget && run(() => setMemberStatus(revokeTarget.id, "revoked"))}
        onCancel={() => setRevokeTarget(null)}
      />
      <ConfirmDialog
        open={cancelTarget != null}
        message={t("pendingInviteCancelConfirm", { email: cancelTarget?.email ?? "" })}
        confirmLabel={t("pendingInviteCancel")}
        isPending={isPending}
        onConfirm={() => cancelTarget && run(() => cancelInvite(cancelTarget.id))}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
