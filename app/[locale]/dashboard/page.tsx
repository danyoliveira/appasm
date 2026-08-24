import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getNextFixtures,
  getLastFixtures,
  getStandings,
  getInjuries,
  getHeadToHead,
} from "@/lib/api-football/cache";
import {
  getCurrentCompetitions,
  combineTeamStats,
  getStatsPerCompetition,
  resolveSelectedCompetition,
  COMPETITION_FILTER_COOKIE,
} from "@/lib/api-football/teamStats";
import type { StandingRow, Fixture, Injury, TeamStatistics } from "@/lib/api-football/client";
import SeasonStatsGrid from "./SeasonStatsGrid";
import Countdown from "./Countdown";
import { isNonInjuryReason, translateInjuryType, shortenPlayerName } from "./clube/playerShared";
import { matchResult } from "./clube/fixtureHelpers";

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
  let opponentUnavailable: Injury[] = [];
  let opponentLastFixture: Fixture | null = null;
  let opponentNextFixture: Fixture | null = null;
  let headToHead: Fixture[] = [];

  if (teamId) {
    try {
      const [fixtures, current, store] = await Promise.all([
        getNextFixtures(teamId),
        getCurrentCompetitions(teamId),
        cookies(),
      ]);
      // API-Football's "next" fixtures endpoint can lag in marking a match as
      // finished — guard against picking one back up here by requiring it to
      // still have no final score, not just a future-looking date.
      nextFixture = fixtures.find((fx) => fx.goals.home == null && fx.goals.away == null) ?? null;
      const cookieValue = store.get(COMPETITION_FILTER_COOKIE)?.value;
      const selectedCompetitionId = resolveSelectedCompetition(cookieValue, current.allCompetitions);

      if (current.defaultCompetition && current.defaultSeason) {
        const selectedCompetition = selectedCompetitionId
          ? current.allCompetitions.find((c) => c.league.id === selectedCompetitionId)
          : null;
        const standingsLeagueId = selectedCompetition?.league.id ?? current.defaultCompetition.league.id;
        const standingsSeason =
          selectedCompetition?.seasons.find((s) => s.current)?.year ?? current.defaultSeason;

        const [standingsData, statsByCompetitionId] = await Promise.all([
          getStandings(standingsLeagueId, standingsSeason).catch(() => []),
          getStatsPerCompetition(teamId, current.allCompetitions, current.defaultSeason),
        ]);
        standings = standingsData[0]?.league.standings[0] ?? [];
        // "All competitions" never includes friendlies.
        const combinedOurStats = combineTeamStats(
          current.competitions
            .map((c) => statsByCompetitionId.get(c.league.id))
            .filter((s): s is TeamStatistics => s != null),
        );
        ourStats = selectedCompetitionId
          ? (statsByCompetitionId.get(selectedCompetitionId) ?? combinedOurStats)
          : combinedOurStats;

        if (nextFixture) {
          const opponentTeam =
            nextFixture.teams.home.id === teamId ? nextFixture.teams.away : nextFixture.teams.home;
          const opponentId = opponentTeam.id;
          const opponentCompetitions = await getCurrentCompetitions(opponentId);
          const opponentSeason = opponentCompetitions.defaultSeason ?? current.defaultSeason;
          const opponentSelectedId = resolveSelectedCompetition(
            cookieValue,
            opponentCompetitions.allCompetitions,
          );

          const [
            opponentInjuriesResult,
            headToHeadResult,
            opponentStatsByCompetitionId,
            opponentLastFixturesResult,
            opponentNextFixturesResult,
          ] = await Promise.all([
            getInjuries(opponentId, opponentSeason).catch(() => []),
            getHeadToHead(teamId, opponentId).catch(() => []),
            getStatsPerCompetition(opponentId, opponentCompetitions.allCompetitions, opponentSeason),
            getLastFixtures(opponentId).catch(() => []),
            getNextFixtures(opponentId).catch(() => []),
          ]);
          opponentInjuries = opponentInjuriesResult;
          opponentLastFixture = opponentLastFixturesResult[0] ?? null;
          opponentNextFixture =
            opponentNextFixturesResult.find(
              (fx) =>
                fx.fixture.id !== nextFixture!.fixture.id &&
                new Date(fx.fixture.date).getTime() > new Date(nextFixture!.fixture.date).getTime(),
            ) ?? null;
          headToHead = headToHeadResult;
          const combinedOpponentStats = combineTeamStats(
            opponentCompetitions.competitions
              .map((c) => opponentStatsByCompetitionId.get(c.league.id))
              .filter((s): s is TeamStatistics => s != null),
          );
          opponentStats = opponentSelectedId
            ? (opponentStatsByCompetitionId.get(opponentSelectedId) ?? combinedOpponentStats)
            : combinedOpponentStats;

          // /injuries returns one row per fixture a player missed, so the
          // same player shows up once per matchweek — keep only their most
          // recent entry so each injured player appears a single time.
          const latestInjuryByPlayer = new Map<number, Injury>();
          opponentInjuries.forEach((injury) => {
            const existing = latestInjuryByPlayer.get(injury.player.id);
            if (!existing || new Date(injury.fixture.date) > new Date(existing.fixture.date)) {
              latestInjuryByPlayer.set(injury.player.id, injury);
            }
          });
          const dedupedInjuries = Array.from(latestInjuryByPlayer.values());

          // Suspensions, national duty, coach's decision, etc. aren't a
          // medical injury — split them into their own "unavailable" list.
          opponentInjuries = dedupedInjuries.filter(
            (injury) => !isNonInjuryReason(injury.player.reason),
          );
          opponentUnavailable = dedupedInjuries.filter((injury) =>
            isNonInjuryReason(injury.player.reason),
          );
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

  const opponentLastResult =
    opponentLastFixture && opponent ? matchResult(opponentLastFixture, opponent.id) : null;
  const opponentLastOpponent =
    opponentLastFixture && opponent
      ? opponentLastFixture.teams.home.id === opponent.id
        ? opponentLastFixture.teams.away
        : opponentLastFixture.teams.home
      : null;
  const opponentNextOpponent =
    opponentNextFixture && opponent
      ? opponentNextFixture.teams.home.id === opponent.id
        ? opponentNextFixture.teams.away
        : opponentNextFixture.teams.home
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
              <p className="mt-4 text-sm text-muted">{t("noStandingsFound")}</p>
            ) : (
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                      <th className="w-8 px-3 py-2">#</th>
                      <th className="px-3 py-2">{t("clubColumn")}</th>
                      <th className="w-12 px-3 py-2 text-center">{t("playedColumn")}</th>
                      <th className="w-12 px-3 py-2 text-center">{t("pointsColumn")}</th>
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
                <Link
                  href={`/dashboard/clube/${opponent.id}`}
                  className="mt-3 flex items-center gap-3 transition-opacity hover:opacity-80"
                >
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
                </Link>

                <Countdown
                  target={nextFixture.fixture.date}
                  labels={{
                    days: t("countdownDays"),
                    hours: t("countdownHours"),
                    minutes: t("countdownMinutes"),
                    seconds: t("countdownSeconds"),
                    live: t("countdownLive"),
                  }}
                />

                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-muted">{t("injuriesTitle")}</h3>
                  {opponentInjuries.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{t("noInjuriesFound")}</p>
                  ) : (
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {opponentInjuries.map((injury) => (
                        <Link
                          key={injury.player.id}
                          href={`/dashboard/clube/jogador/${injury.player.id}`}
                          className="flex items-start gap-3 rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-accent"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={injury.player.photo}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {shortenPlayerName(injury.player.name)}
                            </div>
                            <div className="line-clamp-2 text-xs text-muted">
                              {translateInjuryType(injury.player.reason, locale)}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {opponentUnavailable.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-muted">{t("unavailableTitle")}</h3>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {opponentUnavailable.map((injury) => (
                        <Link
                          key={injury.player.id}
                          href={`/dashboard/clube/jogador/${injury.player.id}`}
                          className="flex items-start gap-3 rounded-lg border border-border bg-background p-2.5 transition-colors hover:border-accent"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={injury.player.photo}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {shortenPlayerName(injury.player.name)}
                            </div>
                            <div className="line-clamp-2 text-xs text-muted">
                              {translateInjuryType(injury.player.reason, locale)}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {headToHead.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-muted">{t("headToHeadTitle")}</h3>
                    <div className="mt-2 space-y-2">
                      {headToHead.map((fx) => (
                        <div
                          key={fx.fixture.id}
                          className="rounded-lg border border-border bg-background p-2.5 text-sm"
                        >
                          <Link
                            href={`/dashboard/clube/jogo/${fx.fixture.id}`}
                            className="block text-xs text-muted hover:text-accent"
                          >
                            {new Date(fx.fixture.date).toLocaleDateString(locale)}
                          </Link>
                          <div className="mt-0.5 font-medium">
                            <Link
                              href={`/dashboard/clube/${fx.teams.home.id}`}
                              className="hover:text-accent"
                            >
                              {fx.teams.home.name}
                            </Link>{" "}
                            <Link
                              href={`/dashboard/clube/jogo/${fx.fixture.id}`}
                              className="hover:text-accent"
                            >
                              {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                            </Link>{" "}
                            <Link
                              href={`/dashboard/clube/${fx.teams.away.id}`}
                              className="hover:text-accent"
                            >
                              {fx.teams.away.name}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(opponentLastFixture || opponentNextFixture) && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-muted">{t("opponentScheduleTitle")}</h3>
                    <div className="mt-2 space-y-2">
                      {opponentLastFixture && opponentLastOpponent && (
                        <Link
                          href={`/dashboard/clube/jogo/${opponentLastFixture.fixture.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2.5 text-sm transition-colors hover:border-accent"
                        >
                          <span className="shrink-0 text-xs text-muted">
                            {t("opponentLastMatchLabel")}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            {opponentLastResult && (
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                                  opponentLastResult === "W"
                                    ? "bg-green-600"
                                    : opponentLastResult === "L"
                                      ? "bg-red-500"
                                      : "bg-muted"
                                }`}
                              >
                                {opponentLastResult}
                              </span>
                            )}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={opponentLastOpponent.logo}
                              alt=""
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                            <span className="truncate">{opponentLastOpponent.name}</span>
                            <span className="shrink-0 font-medium">
                              {opponentLastFixture.goals.home ?? "-"} -{" "}
                              {opponentLastFixture.goals.away ?? "-"}
                            </span>
                          </span>
                        </Link>
                      )}
                      {opponentNextFixture && opponentNextOpponent && (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2.5 text-sm">
                          <span className="shrink-0 text-xs text-muted">
                            {t("opponentNextMatchLabel")}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={opponentNextOpponent.logo}
                              alt=""
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                            <span className="truncate">{opponentNextOpponent.name}</span>
                            <span className="shrink-0 text-xs text-muted">
                              {new Date(opponentNextFixture.fixture.date).toLocaleDateString(locale)}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {opponentStats && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-muted">{t("seasonStatsTitle")}</h3>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">{t("statPlayed")}</span>
                        <span className="font-semibold">{opponentStats.fixtures.played.total}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">{t("statRecord")}</span>
                        <span className="font-semibold">
                          {opponentStats.fixtures.wins.total}-{opponentStats.fixtures.draws.total}-
                          {opponentStats.fixtures.loses.total}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">{t("statGoals")}</span>
                        <span className="font-semibold">
                          {opponentStats.goals.for.total.total}:{opponentStats.goals.against.total.total}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">{t("statCleanSheets")}</span>
                        <span className="font-semibold">{opponentStats.clean_sheet.total}</span>
                      </div>
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
