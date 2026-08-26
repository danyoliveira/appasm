import "server-only";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// The open-ended stint for a club — the one with no ended_at yet. There is
// always at most one of these per team at a time; null only if the coach
// hasn't picked a club yet, or for data that predates this feature.
export async function getCurrentStintId(
  supabase: SupabaseServerClient,
  teamId: number,
): Promise<string | null> {
  const { data } = await supabase
    .from("coaching_stints")
    .select("id")
    .eq("team_id", teamId)
    .is("ended_at", null)
    .maybeSingle();
  return data?.id ?? null;
}
