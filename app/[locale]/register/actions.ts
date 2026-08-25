"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validateInviteToken, coachExists } from "@/lib/invites";

// Codes, not raw messages — RegisterForm/CreateCoachForm translate these
// client-side (t(`error${code}`)). Keeps every string localized, and never
// leaks a raw Supabase error message (English-only, sometimes internal
// wording) straight into the UI.
export type RegisterErrorCode = "invalid" | "already-bootstrapped" | "password-too-short" | "generic";
export type RegisterState = { error?: RegisterErrorCode };

const MIN_PASSWORD_LENGTH = 8;

export async function acceptInvite(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const token = formData.get("token") as string;
  const email = formData.get("email") as string;
  const fullName = formData.get("fullName") as string;
  const password = formData.get("password") as string;
  const locale = (formData.get("locale") as string) || "pt";

  const invite = await validateInviteToken(token);
  if (!invite || invite.email !== email) {
    return { error: "invalid" };
  }

  // The form's minLength is a UX hint, not enforcement — anyone posting to
  // this action directly bypasses it entirely, so it has to be checked here.
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "password-too-short" };
  }

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    return { error: "generic" };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { error: "generic" };
  }

  redirect(`/${locale}/dashboard`);
}

export async function createCoachAccount(
  _prevState: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const email = formData.get("email") as string;
  const fullName = formData.get("fullName") as string;
  const password = formData.get("password") as string;
  const locale = (formData.get("locale") as string) || "pt";

  // Defensive re-check: someone else may have completed bootstrap between
  // this page loading and this submit.
  if (await coachExists()) {
    return { error: "already-bootstrapped" };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: "password-too-short" };
  }

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    return { error: "generic" };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { error: "generic" };
  }

  redirect(`/${locale}/dashboard`);
}
