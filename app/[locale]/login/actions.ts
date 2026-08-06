"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: boolean; revoked?: boolean };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const locale = (formData.get("locale") as string) || "pt";
  const redirectTo = (formData.get("redirectTo") as string) || `/${locale}/dashboard`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: true };
  }

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
