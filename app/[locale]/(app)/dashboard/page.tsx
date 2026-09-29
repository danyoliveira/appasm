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
import Icon, { type IconName } from "@/components/Icon";
import TeamCrest from "@/components/TeamCrest";
import SeasonStatsGrid from "../SeasonStatsGrid";
import Countdown from "../Countdown";
import NextFixturePrepareButton from "../NextFixturePrepareButton";
import ClubHeaderAccent from "../ClubHeaderAccent";
import FixtureHeroAccent from "../FixtureHeroAccent";
import {
  isNonInjuryReason,
  translateInjuryType,
  shortenPlayerName,
} from "../club/playerShared";
import RecentNotesPanel from "../notes/RecentNotesPanel";
import { loadTeamNotes } from "../notes/loadTeamNotes";
import { matchResult } from "../club/fixtureHelpers";
import { loadLiveScores, withLiveScores } from "@/lib/liveScores";

// Same heading on every dashboard card: a small tinted icon tile, the
// title, and an optional count.
function SectionHeading({ icon, title, count }: { icon: IconName; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted ring-1 ring-border">
          {count}
        </span>
      )}
    </div>
  );
}

const RESULT_TONE: Record<"W" | "D" | "L", string> = {
  W: "bg-green-600 text-white",
  D: "bg-border text-foreground",
  L: "bg-red-500 text-white",
};


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
  let standingsLeague: { name: string; logo: string } | null = null;
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
  let ourName: string | null = null;

  if (teamId) {
    try {
      const [apiFixtures, current, store, ourTeamInfo, liveScores] = await Promise.all([
        getNextFixtures(teamId),
        getCurrentCompetitions(teamId),
        cookies(),
        getTeamInfo(teamId).catch(() => []),
        loadLiveScores(supabase, teamId),
      ]);
      const fixtures = withLiveScores(apiFixtures, liveScores);
      ourLogo = ourTeamInfo[0]?.team.logo ?? null;
      ourName = ourTeamInfo[0]?.team.name ?? null;
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
        standingsLeague = (selectedCompetition ?? current.defaultCompetition).league;
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

  // Notes across the club and its players (coach-only, same as the notes
  // themselves) — the dashboard shows reminders + the latest few; the full
  // list with filters lives on the Notas page.
  const teamNotes = isCoach && teamId ? await loadTeamNotes(supabase, teamId) : null;

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
      <ClubHeaderAccent
        logoUrl={ourLogo}
        eyebrow={new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
      >
        <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
          {profile.full_name?.trim() ? t("overviewGreeting", { name: profile.full_name.trim().split(/\s+/)[0] }) : t("overviewGreetingNoName")}
        </h1>
        {(ourName || (nextFixture && opponent)) && (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            {ourName && <span className="font-medium text-foreground">{ourName}</span>}
            {ourName && nextFixture && opponent && <span aria-hidden className="hidden opacity-50 sm:inline">•</span>}
            {nextFixture && opponent && (
              <span>
                {t("nextFixtureLabel")}: {opponent.name} ·{" "}
                {new Date(nextFixture.fixture.date).toLocaleDateString(locale, { day: "numeric", month: "short" })}
              </span>
            )}
          </p>
        )}
      </ClubHeaderAccent>

      {!teamId && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-muted">{t("noClubChosenYet")}</p>
          <Link
            href="/club"
            className="mt-4 inline-block text-sm font-medium text-accent"
          >
            {t("goToClubButton")} →
          </Link>
        </div>
      )}

      {/* Notes first — reminders and pinned notes are what the coach acts on
          day to day. */}
      {teamNotes && teamId && (
        <RecentNotesPanel
          variant="dashboard"
          teamId={teamId}
          notes={teamNotes.notes}
          players={teamNotes.players}
          playerInfo={teamNotes.playerInfo}
          clubLogo={ourLogo}
        />
      )}

      {/* The hero — the next match in one tight block: a header line (label,
          competition, home/away, venue), then the matchup on the left and
          the countdown + the one action on the right. */}
      {teamId && (
        <FixtureHeroAccent className="mt-6" homeLogo={ourLogo} awayLogo={opponent?.logo ?? null}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {t("nextFixtureLabel")}
            </h2>
            {nextFixture && opponent && (
              <>
                <span className="flex min-w-0 items-center gap-1.5 text-muted">
                  {nextFixture.league.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={nextFixture.league.logo} alt="" className="h-4 w-4 shrink-0 object-contain" />
                  )}
                  <span className="truncate">{nextFixture.league.name}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${
                    nextFixture.teams.home.id === teamId
                      ? "bg-accent/10 text-accent"
                      : "bg-background text-muted ring-1 ring-border"
                  }`}
                >
                  {nextFixture.teams.home.id === teamId ? t("homeLabel") : t("awayLabel")}
                </span>
                {nextFixture.fixture.venue.name && (
                  <span className="truncate text-muted">🏟️ {nextFixture.fixture.venue.name}</span>
                )}
              </>
            )}
          </div>

          {!nextFixture || !opponent ? (
            <p className="mt-4 text-sm text-muted">{t("noUpcomingFixtures")}</p>
          ) : (
            (() => {
              const date = new Date(nextFixture.fixture.date);
              const weAreHome = nextFixture.teams.home.id === teamId;
              const us = { id: teamId, name: ourName ?? "", logo: ourLogo ?? "" };
              const teamBlock = (team: { id: number; name: string; logo: string }, isUs: boolean, align: "left" | "right") => (
                <Link
                  href={isUs ? "/club" : `/club/${team.id}`}
                  className={`group flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 ${
                    align === "right" ? "sm:flex-row-reverse sm:text-right" : "sm:text-left"
                  }`}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white p-2 shadow-md ring-1 ring-black/5 transition-transform group-hover:-translate-y-0.5 sm:h-14 sm:w-14">
                    <TeamCrest logo={team.logo} className="h-full w-full" />
                  </span>
                  <span className="line-clamp-2 min-w-0 text-sm font-semibold group-hover:text-accent sm:text-base">
                    {team.name}
                  </span>
                </Link>
              );
              return (
                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
                  <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3">
                    {weAreHome ? teamBlock(us, true, "left") : teamBlock(opponent, false, "left")}
                    <div className="text-center">
                      <div className="text-xl font-bold tabular-nums sm:text-2xl">
                        {date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="text-[11px] font-medium text-muted first-letter:uppercase">
                        {date.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" })}
                      </div>
                    </div>
                    {weAreHome ? teamBlock(opponent, false, "right") : teamBlock(us, true, "right")}
                  </div>

                  <div className="flex flex-col items-center gap-1 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 [&>*:first-child]:mt-0">
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
                  </div>
                </div>
              );
            })()
          )}
        </FixtureHeroAccent>
      )}

      {/* Scouting content for that same match, split into its own cards
          instead of one long scroll inside the hero — each is skipped
          entirely when there's nothing to show. */}
      {(opponentInjuries.length > 0 || opponentUnavailable.length > 0) && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <SectionHeading
            icon="users"
            title={t("opponentAbsencesTitle")}
            count={opponentInjuries.length + opponentUnavailable.length}
          />
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {[
              { title: t("injuriesTitle"), list: opponentInjuries, dot: "bg-red-500" },
              { title: t("unavailableTitle"), list: opponentUnavailable, dot: "bg-amber-500" },
            ]
              .filter((group) => group.list.length > 0 || group.title === t("injuriesTitle"))
              .map((group) => (
                <div key={group.title}>
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${group.dot}`} />
                    {group.title}
                    <span className="tabular-nums">· {group.list.length}</span>
                  </h3>
                  {group.list.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">{t("noInjuriesFound")}</p>
                  ) : (
                    <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
                      {group.list.map((injury) => (
                        <Link
                          key={injury.player.id}
                          href={`/club/player/${injury.player.id}`}
                          className="flex items-center gap-3 px-3 py-2 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-surface"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={injury.player.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {shortenPlayerName(injury.player.name)}
                          </span>
                          <span className="max-w-[45%] truncate text-xs text-muted">
                            {translateInjuryType(injury.player.reason, locale)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {(headToHead.length > 0 || opponentLastFixture || opponentNextFixture || opponentStats) && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div
            className={`grid gap-6 ${
              headToHead.length > 0 && (opponentLastFixture || opponentNextFixture || opponentStats)
                ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-0 lg:divide-x lg:divide-border lg:[&>*:first-child]:pr-6 lg:[&>*:last-child]:pl-6"
                : ""
            }`}
          >
            {(opponentLastFixture || opponentNextFixture || opponentStats) && (
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("opponentFormTitle")}</h3>
                {(opponentLastFixture || opponentNextFixture) && (
                  <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
                    {opponentLastFixture && opponentLastOpponent && (
                      <Link
                        href={`/club/fixture/${opponentLastFixture.fixture.id}`}
                        className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-sm transition-colors last:rounded-b-xl hover:bg-surface"
                      >
                        <span className="w-16 shrink-0 text-[11px] text-muted">{t("opponentLastMatchLabel")}</span>
                        <TeamCrest logo={opponentLastOpponent.logo} className="h-4 w-4" />
                        <span className="min-w-0 flex-1 truncate">{opponentLastOpponent.name}</span>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                            opponentLastResult ? RESULT_TONE[opponentLastResult] : "bg-border text-foreground"
                          }`}
                        >
                          {opponentLastFixture.goals.home ?? "-"} - {opponentLastFixture.goals.away ?? "-"}
                        </span>
                      </Link>
                    )}
                    {opponentNextFixture && opponentNextOpponent && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="w-16 shrink-0 text-[11px] text-muted">{t("opponentNextMatchLabel")}</span>
                        <TeamCrest logo={opponentNextOpponent.logo} className="h-4 w-4" />
                        <span className="min-w-0 flex-1 truncate">{opponentNextOpponent.name}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {new Date(opponentNextFixture.fixture.date).toLocaleDateString(locale, {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {opponentStats && (
                  <div className="mt-4">
                    <SeasonStatsGrid t={t} stats={opponentStats} />
                  </div>
                )}
              </div>
            )}

            {headToHead.length > 0 && (
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("headToHeadTitle")}</h3>
                <div className="mt-2 space-y-0.5">
                  {headToHead.map((fx) => {
                    const result = teamId ? matchResult(fx, teamId) : null;
                    return (
                      <Link
                        key={fx.fixture.id}
                        href={`/club/fixture/${fx.fixture.id}`}
                        className="block rounded-xl px-2.5 py-2 transition-colors hover:bg-background"
                      >
                        <div className="flex items-center gap-1 text-[10px] text-muted">
                          <span>{new Date(fx.fixture.date).toLocaleDateString(locale)}</span>
                          <span>·</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={fx.league.logo} alt="" className="h-3 w-3 shrink-0 object-contain" />
                          <span className="truncate">{fx.league.name}</span>
                        </div>
                        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                          <span className="flex min-w-0 items-center justify-end gap-1.5">
                            <span className={`truncate ${fx.teams.home.id === teamId ? "font-semibold" : ""}`}>
                              {fx.teams.home.name}
                            </span>
                            <TeamCrest logo={fx.teams.home.logo} className="h-4 w-4" />
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                              result ? RESULT_TONE[result] : "bg-border text-foreground"
                            }`}
                          >
                            {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <TeamCrest logo={fx.teams.away.logo} className="h-4 w-4" />
                            <span className={`truncate ${fx.teams.away.id === teamId ? "font-semibold" : ""}`}>
                              {fx.teams.away.name}
                            </span>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* General league reference, lowest priority for day-to-day use — one
          full-width card instead of the old our-stats/standings pairing
          (our own numbers were redundant with the standings row below). */}
      {teamId && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          {standingsLeague ? (
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm ring-1 ring-black/5">
                <TeamCrest logo={standingsLeague.logo} className="h-full w-full" />
              </span>
              <h2 className="text-base font-semibold">{standingsLeague.name}</h2>
            </div>
          ) : (
            <SectionHeading icon="grid" title={t("competitionDataTitle")} />
          )}

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
                            row.team.id === teamId ? "bg-accent/10 font-semibold" : ""
                          }`}
                        >
                          <td
                            className={`px-3 py-2 ${row.team.id === teamId ? "text-accent shadow-[inset_3px_0_0_var(--accent)]" : "text-muted"}`}
                          >
                            {row.rank}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/club/${row.team.id}`}
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
          href="/profile"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent"
        >
          <Icon name="users" className="h-4 w-4" />
          {t("peopleWithAccessCount", { count: peopleCount })} →
        </Link>
      )}
    </div>
  );
}
