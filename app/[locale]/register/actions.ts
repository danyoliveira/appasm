"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validateInviteToken, coachExists } from "@/lib/invites";

export type RegisterState = { error?: string };

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

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    return { error: createError.message };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { error: signInError.message };
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

  const admin = createAdminClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    return { error: createError.message };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { error: signInError.message };
  }

  redirect(`/${locale}/dashboard`);
}
