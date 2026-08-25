"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { createCoachAccount, type RegisterErrorCode, type RegisterState } from "./actions";

const initialState: RegisterState = {};

const ERROR_KEYS: Record<RegisterErrorCode, string> = {
  invalid: "errorInvalid",
  "already-bootstrapped": "errorAlreadyBootstrapped",
  "password-too-short": "errorPasswordTooShort",
  generic: "errorGeneric",
};

export default function CreateCoachForm() {
  const t = useTranslations("register");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(
    createCoachAccount,
    initialState,
  );

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="locale" value={locale} />

      <label className="flex flex-col gap-1 text-sm">
        {t("fullNameLabel")}
        <input
          type="text"
          name="fullName"
          required
          className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
        />
      </label>

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
          minLength={8}
          className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
        />
      </label>

      {state.error && (
        <p className="text-sm text-red-500">{t(ERROR_KEYS[state.error])}</p>
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
