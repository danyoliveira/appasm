import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStintId } from "@/lib/coachingStints";
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
  computeBiggestAndStreaks,
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
  type DueReturnInjury,
} from "./SquadSection";
import ClubDetailTabs from "./ClubDetailTabs";
import ClubNotesList, { type ClubNote } from "./ClubNotesList";
import TeamStatsComparison, {
  HEADLINE_TEAM_STAT_FIELDS,
  HOME_TEAM_STAT_FIELDS,
  AWAY_TEAM_STAT_FIELDS,
  BIGGEST_RESULTS_FIELDS,
  PENALTY_FIELDS,
} from "./TeamStatsComparison";
import {
  FormStrip,
  RollingFormChart,
  GoalDifferenceChart,
  type ProgressionMatch,
} from "./ClubProgressionChart";
import type { TeamManualStatsInput } from "../actions";

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

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
  const currentStintId = teamId ? await getCurrentStintId(supabase, teamId) : null;

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

  // Hand-entered stats win over the API/verified ones wherever the coach
  // has filled them in — same "internal beats external when present" rule
  // as the player page's own comparison table.
  if (teamId && currentStintId && squad?.[0]?.players.length) {
    const { data: manualRows } = await supabase
      .from("player_manual_stats")
      .select("player_id, appearances, minutes, goals, assists, saves, conceded")
      .eq("team_id", teamId)
      .eq("stint_id", currentStintId);

    manualRows?.forEach((row) => {
      const existing = playerStatsById.get(row.player_id) ?? {
        appearances: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        saves: 0,
        conceded: 0,
      };
      playerStatsById.set(row.player_id, {
        appearances: row.appearances ?? existing.appearances,
        minutes: row.minutes ?? existing.minutes,
        goals: row.goals ?? existing.goals,
        assists: row.assists ?? existing.assists,
        saves: row.saves ?? existing.saves,
        conceded: row.conceded ?? existing.conceded,
      });
    });
  }

  const injuriesByPlayerId = new Map<number, PendingInjury>(
    injuries.map((injury) => [
      injury.player.id,
      { key: injury.player.reason, reason: translateInjuryType(injury.player.reason, locale) },
    ]),
  );

  // Club-level notes (not about a specific player) — coach-only, same as
  // player notes.
  let clubNotes: ClubNote[] = [];
  if (isCoach && teamId) {
    const { data: notesData } = await supabase
      .from("club_notes")
      .select("id, content, created_at, updated_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });
    clubNotes = notesData ?? [];
  }

  const availabilityByPlayerId = new Map<number, AvailabilityInfo>();
  if (teamId) {
    const { data: availabilityRows } = await supabase
      .from("player_availability")
      .select("player_id, status, last_seen_injury_key, excluded")
      .eq("team_id", teamId)
      .eq("stint_id", currentStintId);

    availabilityRows?.forEach((row) => {
      availabilityByPlayerId.set(row.player_id, {
        status: row.status,
        lastSeenInjuryKey: row.last_seen_injury_key,
        excluded: row.excluded ?? false,
      });
    });
  }

  // Open injuries whose expected return date has arrived — prompts the
  // coach to confirm the actual return instead of letting a stale estimate
  // sit there forever.
  const dueReturnByPlayerId = new Map<number, DueReturnInjury>();
  if (teamId && currentStintId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: openInjuries } = await supabase
      .from("player_injuries")
      .select("id, player_id, expected_return_at")
      .eq("team_id", teamId)
      .eq("stint_id", currentStintId)
      .is("actual_return_at", null)
      .not("expected_return_at", "is", null)
      .lte("expected_return_at", today);

    openInjuries?.forEach((row) => {
      dueReturnByPlayerId.set(row.player_id, {
        injuryId: row.id,
        expectedReturnAt: row.expected_return_at,
      });
    });
  }

  // Chronological (oldest first) for the progression chart — pastCalendarRows
  // is newest-first for the calendar list above.
  const progressionMatches: ProgressionMatch[] = [...pastCalendarRows].reverse().map((row) => ({
    id: row.id,
    date: row.date,
    opponentName: row.opponent.name,
    isHome: row.isHome,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    result: row.result,
  }));

  // Computed from the season's actual results rather than the API's
  // per-competition figures, so it's accurate for "all competitions" too.
  const biggestAndStreaks = computeBiggestAndStreaks(progressionMatches);

  // Hand-entered mirror of the club's season stats — same external/internal
  // comparison rule as the player page, extended to home/away splits,
  // biggest results, and penalties (not just the four headline numbers).
  let internalTeamStats: TeamManualStatsInput = {
    played: null,
    wins: null,
    draws: null,
    loses: null,
    goalsFor: null,
    goalsAgainst: null,
    cleanSheets: null,
    playedHome: null,
    playedAway: null,
    winsHome: null,
    winsAway: null,
    drawsHome: null,
    drawsAway: null,
    losesHome: null,
    losesAway: null,
    goalsForHome: null,
    goalsForAway: null,
    goalsAgainstHome: null,
    goalsAgainstAway: null,
    cleanSheetsHome: null,
    cleanSheetsAway: null,
    biggestWinGoalsFor: null,
    biggestWinGoalsAgainst: null,
    biggestLossGoalsFor: null,
    biggestLossGoalsAgainst: null,
    penaltyScored: null,
    penaltyMissed: null,
  };
  if (teamId && currentStintId) {
    const { data: teamManualRow } = await supabase
      .from("team_manual_stats")
      .select(
        "played, wins, draws, loses, goals_for, goals_against, clean_sheets, played_home, played_away, wins_home, wins_away, draws_home, draws_away, loses_home, loses_away, goals_for_home, goals_for_away, goals_against_home, goals_against_away, clean_sheets_home, clean_sheets_away, biggest_win_goals_for, biggest_win_goals_against, biggest_loss_goals_for, biggest_loss_goals_against, penalty_scored, penalty_missed",
      )
      .eq("team_id", teamId)
      .eq("stint_id", currentStintId)
      .maybeSingle();

    if (teamManualRow) {
      internalTeamStats = {
        played: teamManualRow.played,
        wins: teamManualRow.wins,
        draws: teamManualRow.draws,
        loses: teamManualRow.loses,
        goalsFor: teamManualRow.goals_for,
        goalsAgainst: teamManualRow.goals_against,
        cleanSheets: teamManualRow.clean_sheets,
        playedHome: teamManualRow.played_home,
        playedAway: teamManualRow.played_away,
        winsHome: teamManualRow.wins_home,
        winsAway: teamManualRow.wins_away,
        drawsHome: teamManualRow.draws_home,
        drawsAway: teamManualRow.draws_away,
        losesHome: teamManualRow.loses_home,
        losesAway: teamManualRow.loses_away,
        goalsForHome: teamManualRow.goals_for_home,
        goalsForAway: teamManualRow.goals_for_away,
        goalsAgainstHome: teamManualRow.goals_against_home,
        goalsAgainstAway: teamManualRow.goals_against_away,
        cleanSheetsHome: teamManualRow.clean_sheets_home,
        cleanSheetsAway: teamManualRow.clean_sheets_away,
        biggestWinGoalsFor: teamManualRow.biggest_win_goals_for,
        biggestWinGoalsAgainst: teamManualRow.biggest_win_goals_against,
        biggestLossGoalsFor: teamManualRow.biggest_loss_goals_for,
        biggestLossGoalsAgainst: teamManualRow.biggest_loss_goals_against,
        penaltyScored: teamManualRow.penalty_scored,
        penaltyMissed: teamManualRow.penalty_missed,
      };
    }
  }
  const externalTeamStats: TeamManualStatsInput = {
    played: teamStats?.fixtures.played.total ?? null,
    wins: teamStats?.fixtures.wins.total ?? null,
    draws: teamStats?.fixtures.draws.total ?? null,
    loses: teamStats?.fixtures.loses.total ?? null,
    goalsFor: teamStats?.goals.for.total.total ?? null,
    goalsAgainst: teamStats?.goals.against.total.total ?? null,
    cleanSheets: teamStats?.clean_sheet.total ?? null,
    playedHome: teamStats?.fixtures.played.home ?? null,
    playedAway: teamStats?.fixtures.played.away ?? null,
    winsHome: teamStats?.fixtures.wins.home ?? null,
    winsAway: teamStats?.fixtures.wins.away ?? null,
    drawsHome: teamStats?.fixtures.draws.home ?? null,
    drawsAway: teamStats?.fixtures.draws.away ?? null,
    losesHome: teamStats?.fixtures.loses.home ?? null,
    losesAway: teamStats?.fixtures.loses.away ?? null,
    goalsForHome: teamStats?.goals.for.total.home ?? null,
    goalsForAway: teamStats?.goals.for.total.away ?? null,
    goalsAgainstHome: teamStats?.goals.against.total.home ?? null,
    goalsAgainstAway: teamStats?.goals.against.total.away ?? null,
    cleanSheetsHome: teamStats?.clean_sheet.home ?? null,
    cleanSheetsAway: teamStats?.clean_sheet.away ?? null,
    biggestWinGoalsFor: biggestAndStreaks.biggestWin?.goalsFor ?? null,
    biggestWinGoalsAgainst: biggestAndStreaks.biggestWin?.goalsAgainst ?? null,
    biggestLossGoalsFor: biggestAndStreaks.biggestLoss?.goalsFor ?? null,
    biggestLossGoalsAgainst: biggestAndStreaks.biggestLoss?.goalsAgainst ?? null,
    penaltyScored: teamStats?.penalty?.scored.total ?? null,
    penaltyMissed: teamStats?.penalty?.missed.total ?? null,
  };

  let lastUpdatedAt: string | null = null;
  if (teamId) {
    const { data: cacheRow } = await supabase
      .from("api_football_cache")
      .select("fetched_at")
      .eq("cache_key", `team:${teamId}:squad`)
      .maybeSingle();
    lastUpdatedAt = cacheRow?.fetched_at ?? null;
  }

  const generalContent = (
    <div className="space-y-10">
      <section>
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

      <section>
        <h2 className="text-lg font-semibold">
          {t("squadTitleWithCount", {
            count: (squad?.[0]?.players ?? []).filter(
              (p) => !availabilityByPlayerId.get(p.id)?.excluded,
            ).length,
          })}
        </h2>
        <div className="mt-4">
          <SquadSection
            teamId={teamId ?? 0}
            logoUrl={teamInfo?.[0]?.team.logo ?? null}
            players={squad?.[0]?.players ?? []}
            availabilityByPlayerId={availabilityByPlayerId}
            injuriesByPlayerId={injuriesByPlayerId}
            dueReturnByPlayerId={dueReturnByPlayerId}
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
          {teamId && (
            <RefreshButton
              teamId={teamId}
              label={t("refreshDataButton")}
              refreshingLabel={t("refreshingDataButton")}
            />
          )}
        </div>
      </section>
    </div>
  );

  const physicalContent = (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
      <p className="text-sm text-muted">{t("clubPhysicalComingSoon")}</p>
    </div>
  );

  const statsContent = teamId ? (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <TeamStatsComparison
          teamId={teamId}
          isCoach={isCoach}
          fields={HEADLINE_TEAM_STAT_FIELDS}
          externalValues={externalTeamStats}
          internalValues={internalTeamStats}
          title={t("teamStatsTitle")}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <TeamStatsComparison
            teamId={teamId}
            isCoach={isCoach}
            fields={HOME_TEAM_STAT_FIELDS}
            externalValues={externalTeamStats}
            internalValues={internalTeamStats}
            title={t("homeLabel")}
          />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <TeamStatsComparison
            teamId={teamId}
            isCoach={isCoach}
            fields={AWAY_TEAM_STAT_FIELDS}
            externalValues={externalTeamStats}
            internalValues={internalTeamStats}
            title={t("awayLabel")}
          />
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <TeamStatsComparison
            teamId={teamId}
            isCoach={isCoach}
            fields={BIGGEST_RESULTS_FIELDS}
            externalValues={externalTeamStats}
            internalValues={internalTeamStats}
            title={t("statBiggestTitle")}
          />
          {(biggestAndStreaks.longestWinStreak > 0 ||
            biggestAndStreaks.longestDrawStreak > 0 ||
            biggestAndStreaks.longestLossStreak > 0) && (
            <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              {biggestAndStreaks.longestWinStreak > 0 && (
                <StatRow label={t("statStreakWins")} value={biggestAndStreaks.longestWinStreak} />
              )}
              {biggestAndStreaks.longestDrawStreak > 0 && (
                <StatRow label={t("statStreakDraws")} value={biggestAndStreaks.longestDrawStreak} />
              )}
              {biggestAndStreaks.longestLossStreak > 0 && (
                <StatRow label={t("statStreakLoses")} value={biggestAndStreaks.longestLossStreak} />
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <TeamStatsComparison
            teamId={teamId}
            isCoach={isCoach}
            fields={PENALTY_FIELDS}
            externalValues={externalTeamStats}
            internalValues={internalTeamStats}
            title={t("statPenaltiesTitle")}
          />
        </div>
      </div>
    </div>
  ) : null;

  const progressionContent = (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-muted">{t("progressionFormStripTitle")}</h3>
        <div className="mt-3">
          <FormStrip matches={progressionMatches} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-lg font-semibold">📈 {t("clubProgressionTitle")}</h2>
        <p className="mt-1 text-xs text-muted">{t("progressionRollingExplainer", { count: 5 })}</p>
        <div className="mt-4">
          <RollingFormChart matches={progressionMatches} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-muted">{t("progressionGoalDifferenceTitle")}</h3>
        <div className="mt-4">
          <GoalDifferenceChart matches={progressionMatches} />
        </div>
      </div>
    </div>
  );

  const notesContent =
    isCoach && teamId ? <ClubNotesList teamId={teamId} notes={clubNotes} /> : null;

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

          <ClubDetailTabs
            generalContent={generalContent}
            physicalContent={physicalContent}
            statsContent={statsContent}
            progressionContent={progressionContent}
            notesContent={notesContent}
          />
        </>
      )}
    </div>
  );
}
