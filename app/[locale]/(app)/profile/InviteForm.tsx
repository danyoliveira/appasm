"use client";

import { useActionState, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createInvite, type InviteState } from "../actions";
import { SectionHeading } from "../OpponentScouting";

const initialState: InviteState = {};

export default function InviteForm() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createInvite, initialState);
  const [copied, setCopied] = useState(false);

  const fullUrl =
    state.invitePath && typeof window !== "undefined"
      ? `${window.location.origin}${state.invitePath}`
      : state.invitePath;

  // A new invite also belongs in the "pending invites" list below.
  useEffect(() => {
    if (state.invitePath) router.refresh();
  }, [state.invitePath, router]);

  function copyLink() {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <SectionHeading icon="at" title={t("inviteSectionTitle")} />
      <p className="mt-2 text-sm text-muted">
        {t("inviteHint")} {t("inviteViewOnlyHint")}
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="locale" value={locale} />
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
          {t("inviteEmailLabel")}
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            className="rounded-lg border border-border bg-background px-3 py-2 font-normal text-foreground outline-none focus:border-accent"
          />
        </label>
        {/* Only "Visualização" is on offer for now — "Edição" stays hidden
            until it has permissions of its own. */}
        <div className="flex flex-col gap-1 text-sm font-medium">
          {t("inviteRoleLabel")}
          <span className="rounded-lg border border-border bg-background px-3 py-2 font-normal text-muted">
            {t("roleViewer")}
          </span>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("savingClub") : t("inviteGenerateButton")}
        </button>
      </form>

      {/* It used to show nothing at all when the invite couldn't be created. */}
      {state.error && !pending && <p className="mt-3 text-sm text-red-500">{t("inviteError")}</p>}

      {fullUrl && (
        <div className="mt-4 rounded-xl border border-green-600/30 bg-green-600/5 p-3">
          <p className="text-xs font-medium text-green-700 dark:text-green-400">{t("inviteReadyHint")}</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={fullUrl}
              onFocus={(e) => e.target.select()}
              aria-label={t("inviteLinkLabel")}
              className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted outline-none"
            />
            <button
              type="button"
              onClick={copyLink}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                copied
                  ? "bg-green-600 text-white"
                  : "border border-border bg-surface hover:border-accent hover:text-accent"
              }`}
            >
              {copied ? `✓ ${t("liveStatsCopiedLabel")}` : t("inviteCopyButton")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
