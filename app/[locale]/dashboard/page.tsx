import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getNextFixtures,
  getCurrentLeagueAndSeason,
  getStandings,
  getInjuries,
  getHeadToHead,
  getTeamStatistics,
} from "@/lib/api-football/cache";
import type { StandingRow, Fixture, Injury, TeamStatistics } from "@/lib/api-football/client";
import SeasonStatsGrid from "./SeasonStatsGrid";

export default async function DashboardOverviewPage({
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
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  const isCoach = profile.role === "coach";

  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();

  const teamId = coachProfile?.api_football_team_id ?? null;

  let standings: StandingRow[] = [];
  let nextFixture: Fixture | null = null;
  let ourStats: TeamStatistics | null = null;
  let opponentStats: TeamStatistics | null = null;
  let opponentInjuries: Injury[] = [];
  let headToHead: Fixture[] = [];

  if (teamId) {
    try {
      const [fixtures, current] = await Promise.all([
        getNextFixtures(teamId),
        getCurrentLeagueAndSeason(teamId),
      ]);
      nextFixture = fixtures[0] ?? null;

      if (current) {
        const standingsData = await getStandings(current.league.id, current.season).catch(
          () => [],
        );
        standings = standingsData[0]?.league.standings[0] ?? [];
        ourStats = await getTeamStatistics(teamId, current.league.id, current.season).catch(
          () => null,
        );

        if (nextFixture) {
          const opponentTeam =
            nextFixture.teams.home.id === teamId ? nextFixture.teams.away : nextFixture.teams.home;
          const opponentId = opponentTeam.id;

          [opponentInjuries, headToHead, opponentStats] = await Promise.all([
            getInjuries(opponentId, current.season).catch(() => []),
            getHeadToHead(teamId, opponentId).catch(() => []),
            getTeamStatistics(opponentId, current.league.id, current.season).catch(() => null),
          ]);
        }
      }
    } catch {
      // Cards below just fall back to their empty state.
    }
  }

  let peopleCount = 0;
  if (isCoach) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .neq("id", user.id);
    peopleCount = count ?? 0;
  }

  const opponent = nextFixture
    ? nextFixture.teams.home.id === teamId
      ? nextFixture.teams.away
      : nextFixture.teams.home
    : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("overviewGreeting", { name: profile.full_name || "" })}
      </h1>

      {!teamId && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">{t("noClubChosenYet")}</p>
          <Link
            href="/dashboard/clube"
            className="mt-4 inline-block text-sm font-medium text-accent"
          >
            {t("goToClubButton")} →
          </Link>
        </div>
      )}

      {ourStats && (
        <section className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t("seasonStatsTitle")}</h2>
          <div className="mt-4">
            <SeasonStatsGrid t={t} stats={ourStats} />
          </div>
        </section>
      )}

      {teamId && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">{t("standingsTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("standingsSubtitle")}</p>

            {standings.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{t("noClubChosenYet")}</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[360px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">{t("clubColumn")}</th>
                      <th className="px-3 py-2 text-center">{t("playedColumn")}</th>
                      <th className="px-3 py-2 text-center">{t("pointsColumn")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row) => (
                      <tr
                        key={row.team.id}
                        className={`border-b border-border last:border-b-0 ${
                          row.team.id === teamId ? "bg-accent/5" : ""
                        }`}
                      >
                        <td className="px-3 py-2 text-muted">{row.rank}</td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/dashboard/clube/${row.team.id}`}
                            className="flex items-center gap-2 hover:text-accent"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={row.team.logo} alt="" className="h-5 w-5 object-contain" />
                            <span className="truncate">{row.team.name}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-center text-muted">{row.all.played}</td>
                        <td className="px-3 py-2 text-center font-medium">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">{t("nextFixtureLabel")}</h2>

            {!nextFixture || !opponent ? (
              <p className="mt-4 text-sm text-muted">{t("noUpcomingFixtures")}</p>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={opponent.logo} alt="" className="h-12 w-12 object-contain" />
                  <div>
                    <div className="text-lg font-medium">{opponent.name}</div>
                    <div className="text-sm text-muted">
                      {nextFixture.fixture.venue.name && `${nextFixture.fixture.venue.name} · `}
                      {new Date(nextFixture.fixture.date).toLocaleDateString(locale)} ·{" "}
                      {new Date(nextFixture.fixture.date).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-muted">{t("injuriesTitle")}</h3>
                  {opponentInjuries.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{t("noInjuriesFound")}</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {opponentInjuries.map((injury) => (
                        <div
                          key={`${injury.player.id}-${injury.fixture.id}`}
                          className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={injury.player.photo}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {injury.player.name}
                            </div>
                            <div className="truncate text-xs text-muted">
                              {injury.player.reason}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {headToHead.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-muted">{t("headToHeadTitle")}</h3>
                    <div className="mt-2 space-y-2">
                      {headToHead.map((fx) => (
                        <div
                          key={fx.fixture.id}
                          className="rounded-lg border border-border bg-background p-2.5 text-sm"
                        >
                          <div className="text-xs text-muted">
                            {new Date(fx.fixture.date).toLocaleDateString(locale)}
                          </div>
                          <div className="mt-0.5 font-medium">
                            {fx.teams.home.name} {fx.goals.home ?? "-"} -{" "}
                            {fx.goals.away ?? "-"} {fx.teams.away.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {opponentStats && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-muted">{t("seasonStatsTitle")}</h3>
                    <div className="mt-2">
                      <SeasonStatsGrid t={t} stats={opponentStats} />
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {isCoach && (
        <Link
          href="/dashboard/perfil"
          className="mt-6 flex items-center justify-between rounded-2xl border border-border bg-surface p-6 shadow-sm transition-colors hover:border-accent"
        >
          <div>
            <h2 className="text-xs uppercase tracking-widest text-muted">
              {t("membersSectionTitle")}
            </h2>
            <p className="mt-1 text-lg font-medium">
              {t("peopleWithAccessCount", { count: peopleCount })}
            </p>
          </div>
          <span className="text-sm font-medium text-accent">{t("goToProfileButton")} →</span>
        </Link>
      )}
    </div>
  );
}
