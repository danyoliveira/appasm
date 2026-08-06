import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getTeamInfo,
  getSquad,
  getNextFixtures,
  getLastFixtures,
  getCurrentLeagueAndSeason,
  getInjuries,
  getTeamStatistics,
  getPlayersStatistics,
} from "@/lib/api-football/cache";
import type { Injury, TeamStatistics } from "@/lib/api-football/client";
import { matchResult, FixtureTeamsRow } from "./fixtureHelpers";
import SeasonStatsGrid from "../SeasonStatsGrid";
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
  let fixtures = null;
  let lastFixtures = null;
  let clubDataError = false;

  if (teamId) {
    try {
      [teamInfo, squad, fixtures, lastFixtures] = await Promise.all([
        getTeamInfo(teamId),
        getSquad(teamId),
        getNextFixtures(teamId),
        getLastFixtures(teamId),
      ]);
    } catch {
      clubDataError = true;
    }
  }

  let injuries: Injury[] = [];
  let teamStats: TeamStatistics | null = null;
  const playerStatsById = new Map<number, PlayerSeasonStat>();
  if (teamId && !clubDataError) {
    try {
      const current = await getCurrentLeagueAndSeason(teamId);
      if (current) {
        const [injuriesResult, teamStatsResult, playersStats] = await Promise.all([
          getInjuries(teamId, current.season).catch(() => []),
          getTeamStatistics(teamId, current.league.id, current.season).catch(() => null),
          getPlayersStatistics(teamId, current.season).catch(() => []),
        ]);
        injuries = injuriesResult;
        teamStats = teamStatsResult;

        for (const p of playersStats) {
          const totals = p.statistics.reduce(
            (acc, s) => ({
              minutes: acc.minutes + (s.games.minutes ?? 0),
              goals: acc.goals + (s.goals.total ?? 0),
              assists: acc.assists + (s.goals.assists ?? 0),
              saves: acc.saves + (s.goals.saves ?? 0),
              conceded: acc.conceded + (s.goals.conceded ?? 0),
            }),
            { minutes: 0, goals: 0, assists: 0, saves: 0, conceded: 0 },
          );
          playerStatsById.set(p.player.id, totals);
        }
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
        ? { minutes: 450, goals: 0, assists: 0, saves: 12 + i, conceded: 3 }
        : { minutes: 380 - i * 40, goals: 3 - i, assists: 2, saves: 0, conceded: 0 });
    });
  }

  const injuriesByPlayerId = new Map<number, PendingInjury>(
    injuries.map((injury) => [
      injury.player.id,
      { key: injury.player.reason, reason: injury.player.reason },
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
              href="/dashboard/perfil"
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
          <section className="mt-8 rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-border">
            {teamInfo?.[0] && (
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={teamInfo[0].team.logo}
                  alt=""
                  className="h-14 w-14 object-contain"
                />
                <div className="text-xl font-semibold">{teamInfo[0].team.name}</div>
              </div>
            )}
          </section>

          {teamStats && (
            <section className="mt-10">
              <h2 className="text-lg font-semibold">{t("seasonStatsTitle")}</h2>
              <div className="mt-4">
                <SeasonStatsGrid t={t} stats={teamStats} />
              </div>
            </section>
          )}

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-semibold">{t("recentFormTitle")}</h2>
              {!lastFixtures || lastFixtures.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("noRecentResults")}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {lastFixtures.slice(0, 3).map((fx) => {
                    const result = matchResult(fx, teamId);
                    return (
                      <div
                        key={fx.fixture.id}
                        className="rounded-lg border border-border bg-surface p-3 text-sm"
                      >
                        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                          <span>{new Date(fx.fixture.date).toLocaleDateString(locale)}</span>
                          {result && (
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                                result === "W"
                                  ? "bg-green-600"
                                  : result === "L"
                                    ? "bg-red-500"
                                    : "bg-muted"
                              }`}
                            >
                              {result}
                            </span>
                          )}
                        </div>
                        <FixtureTeamsRow
                          home={fx.teams.home}
                          away={fx.teams.away}
                          center={
                            <span className="font-semibold">
                              {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                            </span>
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold">{t("fixturesTitle")}</h2>
              {!fixtures || fixtures.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("noUpcomingFixtures")}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {fixtures.slice(0, 3).map((fx) => (
                    <div
                      key={fx.fixture.id}
                      className="rounded-lg border border-border bg-surface p-3 text-sm"
                    >
                      <div className="mb-1.5 text-xs text-muted">
                        {new Date(fx.fixture.date).toLocaleDateString(locale)}
                      </div>
                      <FixtureTeamsRow
                        home={fx.teams.home}
                        away={fx.teams.away}
                        center={<span className="text-xs text-muted">vs</span>}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">
              {t("squadTitleWithCount", { count: squad?.[0]?.players.length ?? 0 })}
            </h2>
            <div className="mt-4">
              <SquadSection
                teamId={teamId}
                players={squad?.[0]?.players ?? []}
                availabilityByPlayerId={availabilityByPlayerId}
                injuriesByPlayerId={injuriesByPlayerId}
                statsByPlayerId={playerStatsById}
                isCoach={isCoach}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
