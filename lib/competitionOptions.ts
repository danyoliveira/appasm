import "server-only";
import { getCurrentCompetitions } from "@/lib/api-football/teamStats";

export interface CompetitionOption {
  id: number;
  name: string;
  logo: string;
}

// The club's current competitions (friendlies included), as offered when
// creating/editing a game from scratch.
export async function getCompetitionOptions(teamId: number): Promise<CompetitionOption[]> {
  try {
    const { allCompetitions } = await getCurrentCompetitions(teamId);
    return allCompetitions.map((c) => ({ id: c.league.id, name: c.league.name, logo: c.league.logo }));
  } catch {
    return [];
  }
}
