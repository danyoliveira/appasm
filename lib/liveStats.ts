import "server-only";
import { getFixtureById, getTeamInfo } from "@/lib/api-football/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveManualOpponent } from "@/lib/manualOpponent";

export interface LiveMatchTeams {
  homeName: string;
  homeLogo: string;
  awayName: string;
  awayLogo: string;
  // Which side is the coach's own club — Live Mode's home/away is whatever
  // the fixture says, not necessarily "us", so anything scoped to our own
  // team only (e.g. Modo GK) needs this to know which side to use.
  ourSide: "home" | "away";
}

// Shared by the authenticated dashboard path and the token-based guest path
// — both only ever have `preparationKey` + the session's `teamId` to work
// from, and every lookup here (API-Football cache, manual_preparations) is
// already admin-client-backed, so it needs no user auth session either way.
export async function resolveLiveMatchTeams(
  preparationKey: string,
  teamId: number,
): Promise<LiveMatchTeams | null> {
  const ourTeamInfo = await getTeamInfo(teamId).catch(() => []);
  const our = ourTeamInfo[0]?.team ?? null;
  if (!our) return null;

  if (preparationKey.startsWith("manual-")) {
    const admin = createAdminClient();
    const manualId = preparationKey.slice("manual-".length);
    const { data: manualRow } = await admin
      .from("manual_preparations")
      .select("opponent_team_id, opponent_name, opponent_logo")
      .eq("id", manualId)
      .maybeSingle();
    if (!manualRow) return null;

    const opponent = await resolveManualOpponent(manualRow);

    // Manual preparations don't record home/away — default to us at home.
    return {
      homeName: our.name,
      homeLogo: our.logo,
      awayName: opponent.name,
      awayLogo: opponent.logo,
      ourSide: "home",
    };
  }

  const fixtureId = Number(preparationKey);
  const fixtureResult = await getFixtureById(fixtureId).catch(() => []);
  const fixture = fixtureResult[0] ?? null;
  if (!fixture) return null;

  return {
    homeName: fixture.teams.home.name,
    homeLogo: fixture.teams.home.logo,
    awayName: fixture.teams.away.name,
    awayLogo: fixture.teams.away.logo,
    ourSide: fixture.teams.home.id === teamId ? "home" : "away",
  };
}
