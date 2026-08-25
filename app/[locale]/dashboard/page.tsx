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
  getTeamInfo,
  getTopScorers,
  getTopAssists,
} from "@/lib/api-football/cache";
import {
  getCurrentCompetitions,
  combineTeamStats,
  getStatsPerCompetition,
  resolveSelectedCompetition,
  COMPETITION_FILTER_COOKIE,
} from "@/lib/api-football/teamStats";
import type { StandingRow, Fixture, Injury, TeamStatistics, TopScorer } from "@/lib/api-football/client";

// One row of the top-scorers/top-assists lists — same shape either way,
// just fed a different number (goals vs assists).
function RankedPlayerRow({ rank, scorer, value }: { rank: number; scorer: TopScorer; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-2.5">
      <span className="w-4 shrink-0 text-center text-xs text-muted">{rank}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={scorer.player.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{scorer.player.name}</div>
        <div className="truncate text-xs text-muted">{scorer.statistics[0]?.team.name}</div>
      </div>
      <div className="shrink-0 text-sm font-semibold">{value}</div>
    </div>
  );
}
import SeasonStatsGrid from "./SeasonStatsGrid";
import Countdown from "./Countdown";
import NextFixturePrepareButton from "./NextFixturePrepareButton";
import ClubHeaderAccent from "./ClubHeaderAccent";
import { isNonInjuryReason, translateInjuryType, shortenPlayerName } from "./club/playerShared";
import { matchResult } from "./club/fixtureHelpers";

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
  let topScorers: TopScorer[] = [];
  let topAssists: TopScorer[] = [];
  let nextFixture: Fixture | null = null;
  let opponentStats: TeamStatistics | null = null;
  let opponentInjuries: Injury[] = [];
  let opponentUnavailable: Injury[] = [];
  let opponentLastFixture: Fixture | null = null;
  let opponentNextFixture: Fixture | null = null;
  let headToHead: Fixture[] = [];
  let isNextFixturePrepared = false;
  let ourLogo: string | null = null;

  if (teamId) {
    try {
      const [fixtures, current, store, ourTeamInfo] = await Promise.all([
        getNextFixtures(teamId),
        getCurrentCompetitions(teamId),
        cookies(),
        getTeamInfo(teamId).catch(() => []),
      ]);
      ourLogo = ourTeamInfo[0]?.team.logo ?? null;
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

        const [standingsData, topScorersData, topAssistsData] = await Promise.all([
          getStandings(standingsLeagueId, standingsSeason).catch(() => []),
          getTopScorers(standingsLeagueId, standingsSeason).catch(() => []),
          getTopAssists(standingsLeagueId, standingsSeason).catch(() => []),
        ]);
        standings = standingsData[0]?.league.standings[0] ?? [];
        topScorers = topScorersData;
        topAssists = topAssistsData;

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
            preparationRow,
          ] = await Promise.all([
            getInjuries(opponentId, opponentSeason).catch(() => []),
            getHeadToHead(teamId, opponentId).catch(() => []),
            getStatsPerCompetition(opponentId, opponentCompetitions.allCompetitions, opponentSeason),
            getLastFixtures(opponentId).catch(() => []),
            getNextFixtures(opponentId).catch(() => []),
            supabase
              .from("fixture_preparations")
              .select("id")
              .eq("team_id", teamId)
              .eq("fixture_id", nextFixture.fixture.id)
              .maybeSingle(),
          ]);
          isNextFixturePrepared = preparationRow.data != null;
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
      <ClubHeaderAccent logoUrl={ourLogo}>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("overviewGreeting", { name: profile.full_name || "" })}
        </h1>
      </ClubHeaderAccent>

      {!teamId && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">{t("noClubChosenYet")}</p>
          <Link
            href="/dashboard/club"
            className="mt-4 inline-block text-sm font-medium text-accent"
          >
            {t("goToClubButton")} →
          </Link>
        </div>
      )}

      {/* The hero — everything else on this page is either context for this
          match or general reference, so it leads and gets the most visual
          weight (same gradient treatment as the Live Mode panel). */}
      {teamId && (
        <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-surface to-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t("nextFixtureLabel")}</h2>

          {!nextFixture || !opponent ? (
            <p className="mt-4 text-sm text-muted">{t("noUpcomingFixtures")}</p>
          ) : (
            <>
              <Link
                href={`/dashboard/club/${opponent.id}`}
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

              <NextFixturePrepareButton
                fixtureId={nextFixture.fixture.id}
                isPrepared={isNextFixturePrepared}
                opponentName={opponent.name}
                labels={{
                  prepareAction: t("preparationStartButton"),
                  inProgressAction: t("preparationInProgressButton"),
                  confirmStart: t("preparationConfirmStart"),
                  cancel: t("cancelButton"),
                }}
              />
            </>
          )}
        </section>
      )}

      {/* Scouting content for that same match, split into its own cards
          instead of one long scroll inside the hero — each is skipped
          entirely when there's nothing to show. */}
      {(opponentInjuries.length > 0 || opponentUnavailable.length > 0) && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t("opponentAbsencesTitle")}</h2>

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-muted">{t("injuriesTitle")}</h3>
            {opponentInjuries.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("noInjuriesFound")}</p>
            ) : (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {opponentInjuries.map((injury) => (
                  <Link
                    key={injury.player.id}
                    href={`/dashboard/club/player/${injury.player.id}`}
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
                    href={`/dashboard/club/player/${injury.player.id}`}
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
        </section>
      )}

      {(headToHead.length > 0 || opponentLastFixture || opponentNextFixture || opponentStats) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {headToHead.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm lg:col-span-2">
              <h2 className="text-lg font-semibold">{t("headToHeadTitle")}</h2>
              <div className="mt-4 space-y-2">
                {headToHead.map((fx) => (
                  <div
                    key={fx.fixture.id}
                    className="rounded-lg border border-border bg-background p-2.5 text-sm"
                  >
                    <Link
                      href={`/dashboard/club/fixture/${fx.fixture.id}`}
                      className="flex items-center gap-1 text-xs text-muted hover:text-accent"
                    >
                      <span>{new Date(fx.fixture.date).toLocaleDateString(locale)}</span>
                      <span>·</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fx.league.logo} alt="" className="h-3 w-3 shrink-0 object-contain" />
                      <span className="truncate">{fx.league.name}</span>
                    </Link>
                    <div className="mt-0.5 font-medium">
                      <Link href={`/dashboard/club/${fx.teams.home.id}`} className="hover:text-accent">
                        {fx.teams.home.name}
                      </Link>{" "}
                      <Link href={`/dashboard/club/fixture/${fx.fixture.id}`} className="hover:text-accent">
                        {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                      </Link>{" "}
                      <Link href={`/dashboard/club/${fx.teams.away.id}`} className="hover:text-accent">
                        {fx.teams.away.name}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(opponentLastFixture || opponentNextFixture || opponentStats) && (
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm lg:col-span-3">
              <h2 className="text-lg font-semibold">{t("opponentFormTitle")}</h2>

              {(opponentLastFixture || opponentNextFixture) && (
                <div className="mt-4 space-y-2">
                  {opponentLastFixture && opponentLastOpponent && (
                    <Link
                      href={`/dashboard/club/fixture/${opponentLastFixture.fixture.id}`}
                      className="block rounded-lg border border-border bg-background p-2.5 text-sm transition-colors hover:border-accent"
                    >
                      <div className="flex items-center justify-between gap-2">
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
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={opponentLastFixture.league.logo}
                          alt=""
                          className="h-3 w-3 shrink-0 object-contain"
                        />
                        <span className="truncate">{opponentLastFixture.league.name}</span>
                      </div>
                    </Link>
                  )}
                  {opponentNextFixture && opponentNextOpponent && (
                    <div className="rounded-lg border border-border bg-background p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
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
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={opponentNextFixture.league.logo}
                          alt=""
                          className="h-3 w-3 shrink-0 object-contain"
                        />
                        <span className="truncate">{opponentNextFixture.league.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {opponentStats && (
                <div className="mt-4">
                  <SeasonStatsGrid t={t} stats={opponentStats} />
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* General league reference, lowest priority for day-to-day use — one
          full-width card instead of the old our-stats/standings pairing
          (our own numbers were redundant with the standings row below). */}
      {teamId && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{t("competitionDataTitle")}</h2>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-muted">{t("standingsTitle")}</h3>
              <p className="mt-1 text-sm text-muted">{t("standingsSubtitle")}</p>

              {standings.length === 0 ? (
                <p className="mt-4 text-sm text-muted">{t("noStandingsFound")}</p>
              ) : (
                <div className="mt-2 overflow-hidden rounded-lg border border-border">
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
                              href={`/dashboard/club/${row.team.id}`}
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
            </div>

            {topScorers.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted">{t("topScorersTitle")}</h3>
                <div className="mt-2 space-y-2">
                  {topScorers.slice(0, 3).map((scorer, i) => (
                    <RankedPlayerRow
                      key={scorer.player.id}
                      rank={i + 1}
                      scorer={scorer}
                      value={scorer.statistics[0]?.goals.total ?? 0}
                    />
                  ))}
                </div>

                {topAssists.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-muted">{t("topAssistsTitle")}</h3>
                    <div className="mt-2 space-y-2">
                      {topAssists.slice(0, 3).map((scorer, i) => (
                        <RankedPlayerRow
                          key={scorer.player.id}
                          rank={i + 1}
                          scorer={scorer}
                          value={scorer.statistics[0]?.goals.assists ?? 0}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {isCoach && (
        <Link
          href="/dashboard/profile"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent"
        >
          {t("membersSectionTitle")} · {t("peopleWithAccessCount", { count: peopleCount })} →
        </Link>
      )}
    </div>
  );
}
