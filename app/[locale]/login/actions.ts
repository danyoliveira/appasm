"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type LoginState = { error?: boolean; revoked?: boolean; rateLimited?: boolean };

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  const password = formData.get("password") as string;
  const locale = (formData.get("locale") as string) || "pt";
  const redirectTo = (formData.get("redirectTo") as string) || `/${locale}/dashboard`;

  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

  // Opportunistic cleanup, scoped to this email — cheap, and keeps the
  // table from growing forever without needing a separate cron job.
  await admin.from("login_attempts").delete().eq("email", email).lt("created_at", windowStart);

  const { count } = await admin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email", email);

  if ((count ?? 0) >= MAX_ATTEMPTS) {
    return { rateLimited: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await admin.from("login_attempts").insert({ email });
    return { error: true };
  }

  // Successful login — this email's slate is clean again.
  await admin.from("login_attempts").delete().eq("email", email);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user!.id)
    .maybeSingle();

  if (profile?.status === "revoked") {
    await supabase.auth.signOut();
    return { revoked: true };
  }

  redirect(redirectTo);
}
