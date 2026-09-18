import "server-only";
import { getTeamInfo } from "@/lib/api-football/cache";

// A manual preparation's opponent is either a real API-Football club
// (opponent_team_id set — name/logo resolved live, never duplicated) or a
// club outside API-Football's own database entirely (opponent_name/
// opponent_logo stored directly, since there's nothing to look up).
export interface ManualOpponentRow {
  opponent_team_id: number | null;
  opponent_name: string | null;
  opponent_logo: string | null;
}

export interface ResolvedOpponent {
  id: number | null;
  name: string;
  logo: string;
}

export async function resolveManualOpponent(row: ManualOpponentRow): Promise<ResolvedOpponent> {
  if (row.opponent_team_id != null) {
    const info = await getTeamInfo(row.opponent_team_id).catch(() => []);
    const team = info[0]?.team;
    return { id: row.opponent_team_id, name: team?.name ?? "?", logo: team?.logo ?? "" };
  }
  return { id: null, name: row.opponent_name ?? "?", logo: row.opponent_logo ?? "" };
}
