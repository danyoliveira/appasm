import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LIVE_STAT_CONFIG, parseLiveStatConfig, type LiveStatConfig } from "@/app/[locale]/live/liveStatConfig";

// The club's current ASM Live Mode fields (the built-in default until the
// coach saves their own). Works with the user or the admin client.
export async function loadTeamStatConfig(supabase: SupabaseClient, teamId: number): Promise<LiveStatConfig> {
  const { data } = await supabase.from("live_stat_configs").select("config").eq("team_id", teamId).maybeSingle();
  return parseLiveStatConfig(data?.config) ?? DEFAULT_LIVE_STAT_CONFIG;
}
