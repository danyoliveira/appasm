"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createInvite, type InviteState } from "../actions";

const initialState: InviteState = {};

export default function InviteForm() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(createInvite, initialState);
  const [copied, setCopied] = useState(false);

  const fullUrl =
    state.invitePath && typeof window !== "undefined"
      ? `${window.location.origin}${state.invitePath}`
      : state.invitePath;

  function copyLink() {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold">{t("inviteSectionTitle")}</h2>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="locale" value={locale} />
        <label className="flex flex-1 flex-col gap-1 text-sm">
          {t("inviteEmailLabel")}
          <input
            type="email"
            name="email"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("inviteRoleLabel")}
          <select
            name="role"
            defaultValue="member"
            className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          >
            <option value="member">{t("roleMember")}</option>
            <option value="viewer">{t("roleViewer")}</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t("inviteGenerateButton")}
        </button>
      </form>

      {fullUrl && (
        <div className="mt-4 flex items-center gap-2">
          <input
            readOnly
            value={fullUrl}
            className="flex-1 truncate rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted"
          />
          <button
            type="button"
            onClick={copyLink}
            className="shrink-0 rounded-full border border-border px-4 py-2 text-sm transition-colors hover:border-accent"
          >
            {copied ? "✓" : t("inviteCopyButton")}
          </button>
        </div>
      )}
    </div>
  );
}
