import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function validateInviteToken(token: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("invites")
    .select("email, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!data || data.status !== "pending" || new Date(data.expires_at) < new Date()) {
    return null;
  }

  return { email: data.email as string };
}

/** True once the coach's (bootstrap) account has been created. */
export async function coachExists(): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "coach");

  return (count ?? 0) > 0;
}
