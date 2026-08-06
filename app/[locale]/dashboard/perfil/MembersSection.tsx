"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { updateMemberRole, setMemberStatus } from "../actions";

export interface Member {
  id: string;
  email: string;
  full_name: string | null;
  role: "coach" | "member" | "viewer";
  status: "active" | "revoked";
}

export default function MembersSection({ members }: { members: Member[] }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRoleChange(id: string, role: "member" | "viewer") {
    startTransition(async () => {
      await updateMemberRole(id, role);
      router.refresh();
    });
  }

  function handleStatusToggle(id: string, current: "active" | "revoked") {
    startTransition(async () => {
      await setMemberStatus(id, current === "active" ? "revoked" : "active");
      router.refresh();
    });
  }

  if (members.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold">{t("membersSectionTitle")}</h2>
        <p className="mt-2 text-sm text-muted">{t("noMembersYet")}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold">{t("membersSectionTitle")}</h2>
      <div className="mt-4 space-y-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {member.full_name || member.email}
              </div>
              <div className="truncate text-xs text-muted">{member.email}</div>
            </div>

            <select
              value={member.role}
              disabled={isPending}
              onChange={(e) =>
                handleRoleChange(member.id, e.target.value as "member" | "viewer")
              }
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-50"
            >
              <option value="member">{t("roleMember")}</option>
              <option value="viewer">{t("roleViewer")}</option>
            </select>

            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStatusToggle(member.id, member.status)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                member.status === "active"
                  ? "border-border hover:border-red-500 hover:text-red-500"
                  : "border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
              }`}
            >
              {member.status === "active" ? t("revokeAccessButton") : t("reactivateAccessButton")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
