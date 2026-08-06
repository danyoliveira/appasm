"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "";
  const revokedFromRedirect = searchParams.get("revoked") === "1";
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <label className="flex flex-col gap-1 text-sm">
        {t("emailLabel")}
        <input
          type="email"
          name="email"
          required
          className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t("passwordLabel")}
        <input
          type="password"
          name="password"
          required
          className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
        />
      </label>

      {state.error && (
        <p className="text-sm text-red-500">{t("errorInvalid")}</p>
      )}
      {(state.revoked || revokedFromRedirect) && (
        <p className="text-sm text-red-500">{t("errorRevoked")}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex w-fit items-center rounded-full bg-accent px-6 py-3 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {t("submitLabel")}
      </button>
    </form>
  );
}
