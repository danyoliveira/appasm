import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getTeamInfo,
  getSquad,
  getInjuries,
  getPlayersStatistics,
  getTeamSeasonFixtures,
  getCountries,
  getPlayerProfile,
} from "@/lib/api-football/cache";
import {
  getCurrentCompetitions,
  combineTeamStats,
  getStatsPerCompetition,
  resolveSelectedCompetition,
  COMPETITION_FILTER_COOKIE,
} from "@/lib/api-football/teamStats";
import { getFixtureAppearances } from "@/lib/api-football/verifyParticipation";
import { buildFlagResolver } from "@/lib/api-football/flags";
import type { Injury, TeamStatistics, TeamLeague } from "@/lib/api-football/client";
import { toCalendarRow } from "./fixtureHelpers";
import { translateInjuryType } from "./playerShared";
import ClubHeaderAccent from "../ClubHeaderAccent";
import FixtureCalendar, { type CalendarRow } from "./FixtureCalendar";
import RefreshButton from "./RefreshButton";
import SquadSection, {
  type AvailabilityInfo,
  type PendingInjury,
  type PlayerSeasonStat,
} from "./SquadSection";

export default async function ClubPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const isCoach = profile?.role === "coach";

  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();

  const teamId = coachProfile?.api_football_team_id ?? null;

  let teamInfo = null;
  let squad = null;
  let pastCalendarRows: CalendarRow[] = [];
  let futureCalendarRows: CalendarRow[] = [];
  let clubDataError = false;
  let injuries: Injury[] = [];
  let teamStats: TeamStatistics | null = null;
  let competitions: TeamLeague[] = [];
  let allCompetitions: TeamLeague[] = [];
  let friendlyCompetitionIds = new Set<number>();
  let selectedCompetitionId: number | null = null;
  const playerStatsById = new Map<number, PlayerSeasonStat>();
  const flagUrlByPlayerId = new Map<number, string | null>();

  let defaultCompetition: TeamLeague | null = null;
  let defaultSeason: number | null = null;

  if (teamId) {
    try {
      [teamInfo, squad] = await Promise.all([getTeamInfo(teamId), getSquad(teamId)]);
    } catch {
      clubDataError = true;
    }
  }

  if (teamId && !clubDataError && squad?.[0]?.players.length) {
    try {
      const squadPlayers = squad[0].players;
      const [countries, profiles] = await Promise.all([
        getCountries().catch(() => []),
        Promise.all(squadPlayers.map((p) => getPlayerProfile(p.id).catch(() => []))),
      ]);
      const resolveFlagUrl = buildFlagResolver(countries);
      squadPlayers.forEach((p, i) => {
        const flag = resolveFlagUrl(profiles[i][0]?.player.nationality);
        if (flag) flagUrlByPlayerId.set(p.id, flag);
      });
    } catch {
      // Bonus data — silently skip if unavailable.
    }
  }

  if (teamId && !clubDataError) {
    try {
      const result = await getCurrentCompetitions(teamId);
      competitions = result.competitions;
      allCompetitions = result.allCompetitions;
      friendlyCompetitionIds = new Set(result.friendlyCompetitions.map((c) => c.league.id));
      defaultCompetition = result.defaultCompetition;
      defaultSeason = result.defaultSeason;

      const store = await cookies();
      selectedCompetitionId = resolveSelectedCompetition(
        store.get(COMPETITION_FILTER_COOKIE)?.value,
        allCompetitions,
      );
    } catch {
      // Bonus data — silently skip if unavailable.
    }
  }

  if (teamId && !clubDataError && defaultCompetition && defaultSeason) {
    try {
      const [injuriesResult, playersStats, statsByCompetitionId, seasonFixtures] = await Promise.all([
        getInjuries(teamId, defaultSeason).catch(() => []),
        getPlayersStatistics(teamId, defaultSeason).catch(() => []),
        getStatsPerCompetition(teamId, allCompetitions, defaultSeason),
        getTeamSeasonFixtures(teamId, defaultSeason).catch(() => []),
      ]);
      injuries = injuriesResult;

      // "All competitions" (no specific selection) never includes friendlies.
      const relevantAllFixtures = seasonFixtures.filter((fx) =>
        selectedCompetitionId
          ? fx.league.id === selectedCompetitionId
          : !friendlyCompetitionIds.has(fx.league.id),
      );
      const pastFixtures = relevantAllFixtures
        .filter((fx) => fx.goals.home != null && fx.goals.away != null)
        .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime());
      const futureFixtures = relevantAllFixtures
        .filter((fx) => fx.goals.home == null || fx.goals.away == null)
        .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime());
      pastCalendarRows = pastFixtures.map((fx) => toCalendarRow(fx, teamId));
      futureCalendarRows = futureFixtures.map((fx) => toCalendarRow(fx, teamId));

      // "All competitions" never includes friendlies — only real
      // competitions (League/Cup) get summed for the combined view.
      const combinedStats = combineTeamStats(
        competitions
          .map((c) => statsByCompetitionId.get(c.league.id))
          .filter((s): s is TeamStatistics => s != null),
      );
      teamStats = selectedCompetitionId
        ? (statsByCompetitionId.get(selectedCompetitionId) ?? combinedStats)
        : combinedStats;

      for (const p of playersStats) {
        const relevant = selectedCompetitionId
          ? p.statistics.filter((s) => s.league.id === selectedCompetitionId)
          : p.statistics.filter((s) => !friendlyCompetitionIds.has(s.league.id));
        const totals = relevant.reduce(
          (acc, s) => ({
            appearances: acc.appearances + (s.games.appearences ?? 0),
            minutes: acc.minutes + (s.games.minutes ?? 0),
            goals: acc.goals + (s.goals.total ?? 0),
            assists: acc.assists + (s.goals.assists ?? 0),
            saves: acc.saves + (s.goals.saves ?? 0),
            conceded: acc.conceded + (s.goals.conceded ?? 0),
          }),
          { appearances: 0, minutes: 0, goals: 0, assists: 0, saves: 0, conceded: 0 },
        );
        playerStatsById.set(p.player.id, totals);
      }

      // The bulk /players endpoint is sometimes stale/incomplete per
      // competition (minutes/appearances can be wrong even after the
      // by-id refetch in fetchAllPlayersStatistics). Verify against every
      // season fixture's actual lineup/appearance data instead — one
      // request per fixture (cached, shared across every player and this
      // page), not per player, so it scales with fixtures, not squad size.
      const appearancesPerFixture = await Promise.all(
        pastFixtures.map((fx) => getFixtureAppearances(fx.fixture.id)),
      );

      const verifiedById = new Map<number, PlayerSeasonStat>();
      for (const appearances of appearancesPerFixture) {
        for (const [playerId, appearance] of appearances) {
          const existing = verifiedById.get(playerId) ?? {
            appearances: 0,
            minutes: 0,
            goals: 0,
            assists: 0,
            saves: 0,
            conceded: 0,
          };
          verifiedById.set(playerId, {
            appearances: existing.appearances + 1,
            minutes: existing.minutes + appearance.minutes,
            goals: existing.goals + appearance.goals,
            assists: existing.assists + appearance.assists,
            saves: existing.saves + appearance.saves,
            conceded: existing.conceded + appearance.conceded,
          });
        }
      }

      // Verified fixture data wins wherever it's available for a player.
      for (const [playerId, verified] of verifiedById) {
        playerStatsById.set(playerId, verified);
      }
    } catch {
      // Bonus data — silently skip if unavailable.
    }
  }

  // TEMP preview data — the season hasn't started yet so the API has no
  // real minutes/goals for anyone. Fake a few entries to check how the
  // squad card stats look. Remove once real match data exists.
  if (playerStatsById.size === 0 && squad?.[0]?.players.length) {
    const sample = squad[0].players.slice(0, 5);
    sample.forEach((player, i) => {
      const isGoalkeeper = player.position === "Goalkeeper";
      playerStatsById.set(player.id, isGoalkeeper
        ? { appearances: 5, minutes: 450, goals: 0, assists: 0, saves: 12 + i, conceded: 3 }
        : { appearances: 5 - i, minutes: 380 - i * 40, goals: 3 - i, assists: 2, saves: 0, conceded: 0 });
    });
  }

  const injuriesByPlayerId = new Map<number, PendingInjury>(
    injuries.map((injury) => [
      injury.player.id,
      { key: injury.player.reason, reason: translateInjuryType(injury.player.reason, locale) },
    ]),
  );

  const availabilityByPlayerId = new Map<number, AvailabilityInfo>();
  if (teamId) {
    const { data: availabilityRows } = await supabase
      .from("player_availability")
      .select("player_id, status, last_seen_injury_key, excluded")
      .eq("team_id", teamId);

    availabilityRows?.forEach((row) => {
      availabilityByPlayerId.set(row.player_id, {
        status: row.status,
        lastSeenInjuryKey: row.last_seen_injury_key,
        excluded: row.excluded ?? false,
      });
    });
  }

  let lastUpdatedAt: string | null = null;
  if (teamId) {
    const { data: cacheRow } = await supabase
      .from("api_football_cache")
      .select("fetched_at")
      .eq("cache_key", `team:${teamId}:squad`)
      .maybeSingle();
    lastUpdatedAt = cacheRow?.fetched_at ?? null;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("clubSectionTitle")}
      </h1>

      {!teamId && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">{t("noClubChosenYet")}</p>
          {isCoach && (
            <Link
              href="/profile"
              className="mt-4 inline-block text-sm font-medium text-accent"
            >
              {t("chooseClubTitle")} →
            </Link>
          )}
        </div>
      )}

      {teamId && clubDataError && (
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          Não foi possível carregar os dados do clube agora (limite de pedidos à
          API-Football ou falha temporária). Tenta recarregar a página daqui a
          pouco.
        </p>
      )}

      {teamId && !clubDataError && (
        <>
          {teamInfo?.[0] && (
            <div className="mt-8">
              <ClubHeaderAccent
                logoUrl={teamInfo[0].team.logo}
                stats={
                  teamStats
                    ? [
                        { label: t("statPlayed"), value: teamStats.fixtures.played.total },
                        {
                          label: t("statRecord"),
                          value: `${teamStats.fixtures.wins.total}-${teamStats.fixtures.draws.total}-${teamStats.fixtures.loses.total}`,
                        },
                        {
                          label: t("statGoals"),
                          value: `${teamStats.goals.for.total.total}:${teamStats.goals.against.total.total}`,
                        },
                        { label: t("statCleanSheets"), value: teamStats.clean_sheet.total },
                      ]
                    : undefined
                }
              >
                <div className="text-xl font-semibold">{teamInfo[0].team.name}</div>
              </ClubHeaderAccent>
            </div>
          )}

          <section className="mt-10">
            <h2 className="text-lg font-semibold">{t("fixtureCalendarTitle")}</h2>
            <FixtureCalendar
              past={pastCalendarRows}
              future={futureCalendarRows}
              locale={locale}
              logoUrl={teamInfo?.[0]?.team.logo ?? null}
              labels={{
                dateTime: t("columnDateTime"),
                opponent: t("columnOpponent"),
                competition: t("columnCompetition"),
                venue: t("columnVenue"),
                result: t("columnResult"),
                home: t("homeLabel"),
                away: t("awayLabel"),
                showMorePast: t("showMorePastButton"),
                showMoreFuture: t("showMoreFutureButton"),
                noFixturesFound: t("noFixturesFoundInCalendar"),
                nextFixture: t("nextFixtureLabel"),
              }}
            />
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">
              {t("squadTitleWithCount", {
                count: (squad?.[0]?.players ?? []).filter(
                  (p) => !availabilityByPlayerId.get(p.id)?.excluded,
                ).length,
              })}
            </h2>
            <div className="mt-4">
              <SquadSection
                teamId={teamId}
                logoUrl={teamInfo?.[0]?.team.logo ?? null}
                players={squad?.[0]?.players ?? []}
                availabilityByPlayerId={availabilityByPlayerId}
                injuriesByPlayerId={injuriesByPlayerId}
                statsByPlayerId={playerStatsById}
                flagUrlByPlayerId={flagUrlByPlayerId}
                isCoach={isCoach}
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted">
              <span>
                {lastUpdatedAt
                  ? t("lastUpdatedLabel", { date: new Date(lastUpdatedAt).toLocaleDateString(locale) })
                  : t("lastUpdatedNever")}
              </span>
              <RefreshButton
                teamId={teamId}
                label={t("refreshDataButton")}
                refreshingLabel={t("refreshingDataButton")}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
