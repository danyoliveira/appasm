import "server-only";
import { getFixtureById, getTeamInfo } from "@/lib/api-football/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LiveMatchTeams {
  homeName: string;
  homeLogo: string;
  awayName: string;
  awayLogo: string;
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
      .select("opponent_team_id")
      .eq("id", manualId)
      .maybeSingle();
    if (!manualRow) return null;

    const opponentInfo = await getTeamInfo(manualRow.opponent_team_id).catch(() => []);
    const opponent = opponentInfo[0]?.team ?? null;
    if (!opponent) return null;

    // Manual preparations don't record home/away — default to us at home.
    return {
      homeName: our.name,
      homeLogo: our.logo,
      awayName: opponent.name,
      awayLogo: opponent.logo,
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
  };
}
