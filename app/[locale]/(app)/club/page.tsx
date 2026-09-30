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
import { translateInjuryType, orderSquadLikeGeneralTab, shortenPlayerName } from "./playerShared";
import ClubHeaderAccent from "../ClubHeaderAccent";
import FixtureCalendar, { type CalendarRow } from "./FixtureCalendar";
import RefreshButton from "./RefreshButton";
import SquadSection, {
  type AvailabilityInfo,
  type PendingInjury,
  type PlayerSeasonStat,
  type DueReturnInjury,
  type SquadStat,
} from "./SquadSection";
import ClubDetailTabs from "./ClubDetailTabs";
import NotesList from "../notes/NotesList";
import { CLUB_NOTE_COLUMNS, clubNoteFromRow, type NoteItem } from "../notes/noteShared";
import TeamDossier, { type DossierFile, type DossierPlayer } from "./TeamDossier";
import { CLUB_DOSSIER_CATEGORIES } from "./dossierShared";
import { loadDossierFiles } from "@/lib/dossier";
import { loadPlayerProfiles } from "@/lib/playerProfiles";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import { loadLiveGames, type LiveGameStats } from "@/lib/liveMatchHistory";
import { aggregateLivePlayerTotals } from "@/lib/livePlayerStats";
import { computeLiveTeamStats } from "@/lib/liveTeamStats";
import { loadTeamStatConfig } from "@/lib/liveStatConfigServer";
import { DEFAULT_LIVE_STAT_CONFIG } from "../../live/liveStatConfig";
import { loadLiveScores, withLiveScores } from "@/lib/liveScores";
import StatsSubTabs from "./StatsSubTabs";
import LiveStatsExplorer from "./LiveStatsExplorer";
import type { ManualPlayerInfo } from "./ManualPlayerDialog";
import type { MergeSuggestionView } from "./MergeSuggestions";
import { ageFromBirthDate, getManualPlayers, withManualPlayers } from "@/lib/manualPlayers";
import { findMergeSuggestions } from "@/lib/playerMatching";
import TeamStatsComparison, {
  HEADLINE_TEAM_STAT_FIELDS,
  HOME_TEAM_STAT_FIELDS,
  AWAY_TEAM_STAT_FIELDS,
  BIGGEST_RESULTS_FIELDS,
  PENALTY_FIELDS,
} from "./TeamStatsComparison";
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

  const [{ data: profile }, { data: coachProfile }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("profiles").select("api_football_team_id").eq("role", "coach").maybeSingle(),
  ]);
  const isCoach = profile?.role === "coach";

  const teamId = coachProfile?.api_football_team_id ?? null;
  const currentStintId = teamId ? await getCurrentStintId(supabase, teamId) : null;
  // The coach's specific positions (this spell) and preferred feet.
  const playerProfiles = teamId ? await loadPlayerProfiles(supabase, { teamId, stintId: currentStintId }) : {};

  // Everything below that doesn't depend on something else starts right
  // here, all at once — this page used to wait for ~20 queries one after
  // the other. Each block further down just awaits its own result.
  const settle = <T,>(p: PromiseLike<T>) =>
    Promise.resolve(p).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null }),
    );
  const pre = teamId
    ? {
        teamInfoSquad: settle(Promise.all([getTeamInfo(teamId), getSquad(teamId)])),
        countries: getCountries().catch(() => []),
        manualRows: getManualPlayers(supabase, teamId, currentStintId),
        competitions: settle(getCurrentCompetitions(teamId)),
        cookieStore: cookies(),
        manualStats: currentStintId
          ? Promise.resolve(
              supabase
                .from("player_manual_stats")
                .select("player_id, appearances, minutes, goals, assists, saves, conceded")
                .eq("team_id", teamId)
                .eq("stint_id", currentStintId),
            )
          : null,
        liveGames: (async () => {
          const { data: stintRow } = currentStintId
            ? await supabase.from("coaching_stints").select("started_at").eq("id", currentStintId).maybeSingle()
            : { data: null };
          return loadLiveGames(supabase, teamId, stintRow?.started_at ?? null);
        })().catch(() => [] as LiveGameStats[]),
        clubNotes: isCoach
          ? Promise.resolve(supabase.from("club_notes").select(CLUB_NOTE_COLUMNS).eq("team_id", teamId))
          : null,
        availability: Promise.resolve(
          supabase
            .from("player_availability")
            .select("player_id, status, last_seen_injury_key, excluded")
            .eq("team_id", teamId)
            .eq("stint_id", currentStintId),
        ),
        openInjuries: currentStintId
          ? Promise.resolve(
              supabase
                .from("player_injuries")
                .select("id, player_id, expected_return_at")
                .eq("team_id", teamId)
                .eq("stint_id", currentStintId)
                .is("actual_return_at", null)
                .not("expected_return_at", "is", null)
                .lte("expected_return_at", new Date().toISOString().slice(0, 10)),
            )
          : null,
        teamManual: currentStintId
          ? Promise.resolve(
              supabase
                .from("team_manual_stats")
                .select(
                  "played, wins, draws, loses, goals_for, goals_against, clean_sheets, played_home, played_away, wins_home, wins_away, draws_home, draws_away, loses_home, loses_away, goals_for_home, goals_for_away, goals_against_home, goals_against_away, clean_sheets_home, clean_sheets_away, biggest_win_goals_for, biggest_win_goals_against, biggest_loss_goals_for, biggest_loss_goals_against, penalty_scored, penalty_missed",
                )
                .eq("team_id", teamId)
                .eq("stint_id", currentStintId)
                .maybeSingle(),
            )
          : null,
        squadCacheRow: Promise.resolve(
          supabase.from("api_football_cache").select("fetched_at").eq("cache_key", `team:${teamId}:squad`).maybeSingle(),
        ),
        manualGames: Promise.resolve(
          supabase
            .from("manual_preparations")
            .select(
              "id, opponent_team_id, opponent_name, opponent_logo, match_date, competition_league_id, competition_name, competition_logo, is_home, goals_for, goals_against, finished_at",
            )
            .eq("team_id", teamId),
        ),
        finishedPreparations: Promise.resolve(
          supabase.from("fixture_preparations").select("fixture_id").eq("team_id", teamId).not("finished_at", "is", null),
        ),
        liveStatConfig: loadTeamStatConfig(supabase, teamId).catch(() => DEFAULT_LIVE_STAT_CONFIG),
        dossierFiles: currentStintId
          ? loadDossierFiles(supabase, { teamId, stintId: currentStintId, categories: CLUB_DOSSIER_CATEGORIES }).catch(
              () => [] as DossierFile[],
            )
          : Promise.resolve([] as DossierFile[]),
      }
    : null;

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

  if (pre) {
    const result = await pre.teamInfoSquad;
    if (result.ok) [teamInfo, squad] = result.value;
    else clubDataError = true;
  }

  // Countries (cached, long TTL) — flags for the squad, and the nationality
  // picker for hand-added players.
  const countries = pre ? await pre.countries : [];
  const countryOptions = countries
    .filter((c) => c.flag && c.name !== "World")
    .map((c) => ({ name: c.name, flag: c.flag, code: c.code }));
  const resolveFlagUrl = buildFlagResolver(countries);

  if (teamId && !clubDataError && squad?.[0]?.players.length) {
    try {
      const squadPlayers = squad[0].players;
      const profiles = await Promise.all(
        squadPlayers.map((p) => getPlayerProfile(p.id).catch(() => [])),
      );
      squadPlayers.forEach((p, i) => {
        const flag = resolveFlagUrl(profiles[i][0]?.player.nationality);
        if (flag) flagUrlByPlayerId.set(p.id, flag);
      });
    } catch {
      // Bonus data — silently skip if unavailable.
    }
  }

  // Hand-added players join the API squad from here on, so every list below
  // (squad, dossier picker, @mentions) sees them. The raw API list is kept
  // for spotting "this manual player has now arrived from the API".
  const apiSquadPlayers = squad?.[0]?.players ?? [];
  const manualRows = pre ? await pre.manualRows : [];
  if (teamId && !clubDataError) squad = withManualPlayers(squad ?? [], manualRows);
  manualRows.forEach((row) => {
    const flag = resolveFlagUrl(row.nationality);
    if (flag && !flagUrlByPlayerId.has(row.id)) flagUrlByPlayerId.set(row.id, flag);
  });

  const manualPlayerInfos: ManualPlayerInfo[] = manualRows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position as ManualPlayerInfo["position"],
    number: row.number,
    birthDate: row.birth_date,
    nationality: row.nationality,
    photoUrl: row.photo_url,
  }));

  let mergeSuggestionViews: MergeSuggestionView[] = [];
  const unlinkedManual = manualRows.filter((row) => row.id < 0);
  if (isCoach && unlinkedManual.length && apiSquadPlayers.length) {
    const { data: dismissalRows } = await supabase
      .from("manual_player_merge_dismissals")
      .select("manual_player_id, api_player_id")
      .in(
        "manual_player_id",
        unlinkedManual.map((row) => row.id),
      );
    const dismissed = new Set(
      (dismissalRows ?? []).map((d) => `${d.manual_player_id}:${d.api_player_id}`),
    );
    const apiById = new Map(apiSquadPlayers.map((p) => [p.id, p]));
    mergeSuggestionViews = findMergeSuggestions(
      unlinkedManual.map((row) => ({
        id: row.id,
        name: row.name,
        position: row.position,
        number: row.number,
        age: ageFromBirthDate(row.birth_date),
      })),
      apiSquadPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        number: p.number,
        age: p.age || null,
      })),
      dismissed,
    ).map((suggestion) => {
      const manual = unlinkedManual.find((row) => row.id === suggestion.manualId)!;
      const api = apiById.get(suggestion.apiId)!;
      return {
        manual: {
          id: manual.id,
          name: manual.name,
          photo: manual.photo_url,
          position: manual.position,
          number: manual.number,
        },
        api: { id: api.id, name: api.name, photo: api.photo, position: api.position, number: api.number },
      };
    });
  }

  if (pre && !clubDataError) {
    try {
      const settled = await pre.competitions;
      if (!settled.ok) throw new Error("competitions");
      const result = settled.value;
      competitions = result.competitions;
      allCompetitions = result.allCompetitions;
      friendlyCompetitionIds = new Set(result.friendlyCompetitions.map((c) => c.league.id));
      defaultCompetition = result.defaultCompetition;
      defaultSeason = result.defaultSeason;

      const store = await pre.cookieStore;
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
      const [injuriesResult, playersStats, statsByCompetitionId, apiSeasonFixtures, liveScores] = await Promise.all([
        getInjuries(teamId, defaultSeason).catch(() => []),
        getPlayersStatistics(teamId, defaultSeason).catch(() => []),
        getStatsPerCompetition(teamId, allCompetitions, defaultSeason),
        getTeamSeasonFixtures(teamId, defaultSeason).catch(() => []),
        loadLiveScores(supabase, teamId),
      ]);
      // No API-Football score yet → the ASM Live Mode one.
      const seasonFixtures = withLiveScores(apiSeasonFixtures, liveScores);
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

  // Hand-entered ("internal") stats are kept apart from the API/verified
  // ("external") ones — the squad section lets the coach pick which to show
  // (external by default; players created from scratch always use internal).
  const internalStatsById = new Map<number, SquadStat>();
  if (pre?.manualStats && squad?.[0]?.players.length) {
    const { data: manualStatRows } = await pre.manualStats;

    manualStatRows?.forEach((row) => {
      internalStatsById.set(row.player_id, {
        appearances: row.appearances,
        minutes: row.minutes,
        goals: row.goals,
        assists: row.assists,
        saves: row.saves,
        conceded: row.conceded,
      });
    });
  }

  // Finished ASM Live Mode games of this stint — the "Live Mode" sub-tab,
  // and the fallback for any internal stat the coach hasn't typed in.
  const liveGames: LiveGameStats[] = pre ? await pre.liveGames : [];
  if (squad?.[0]?.players.length) {
    const liveTotals = aggregateLivePlayerTotals(liveGames);
    for (const player of squad[0].players) {
      const live = liveTotals.get(player.id);
      if (!live) continue;
      const manual = internalStatsById.get(player.id);
      internalStatsById.set(player.id, {
        appearances: manual?.appearances ?? live.appearances,
        minutes: manual?.minutes ?? live.minutes,
        goals: manual?.goals ?? live.goals,
        assists: manual?.assists ?? live.assists,
        saves: manual?.saves ?? null,
        conceded: manual?.conceded ?? (player.position === "Goalkeeper" ? live.conceded : null),
      });
    }
  }

  const injuriesByPlayerId = new Map<number, PendingInjury>(
    injuries.map((injury) => [
      injury.player.id,
      { key: injury.player.reason, reason: translateInjuryType(injury.player.reason, locale) },
    ]),
  );

  // Club-level notes (not about a specific player) — coach-only, same as
  // player notes.
  let clubNotes: NoteItem[] = [];
  if (pre?.clubNotes) {
    const { data: notesData } = await pre.clubNotes;
    clubNotes = (notesData ?? []).map(clubNoteFromRow);
  }

  const availabilityByPlayerId = new Map<number, AvailabilityInfo>();
  if (pre) {
    const { data: availabilityRows } = await pre.availability;

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
  if (pre?.openInjuries) {
    const { data: openInjuries } = await pre.openInjuries;

    openInjuries?.forEach((row) => {
      dueReturnByPlayerId.set(row.player_id, {
        injuryId: row.id,
        expectedReturnAt: row.expected_return_at,
      });
    });
  }

  // Chronological (oldest first) so streaks read correctly — pastCalendarRows
  // is newest-first for the calendar list above.
  const progressionMatches = [...pastCalendarRows].reverse().map((row) => ({
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
  if (pre?.teamManual) {
    const { data: teamManualRow } = await pre.teamManual;

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
  // Internal team stats the coach hasn't typed in come from ASM Live Mode —
  // the same competition scope as the external figures (a selected
  // competition, or everything but friendlies).
  const liveTeamStats = computeLiveTeamStats(
    liveGames.filter((g) =>
      selectedCompetitionId
        ? g.leagueId === selectedCompetitionId
        : g.leagueId == null || !friendlyCompetitionIds.has(g.leagueId),
    ),
  );

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
  if (pre) {
    const { data: cacheRow } = await pre.squadCacheRow;
    lastUpdatedAt = cacheRow?.fetched_at ?? null;
  }

  // Games created from scratch join the calendar (only the calendar — the
  // season streaks/biggest-result figures above stay API-only). Same
  // competition filter as the API fixtures when one is selected.
  let calendarPast = pastCalendarRows;
  let calendarFuture = futureCalendarRows;
  if (pre) {
    const { data: allManualGameRows } = await pre.manualGames;
    const manualGameRows = (allManualGameRows ?? []).filter(
      (row) => !selectedCompetitionId || row.competition_league_id === selectedCompetitionId,
    );

    if (manualGameRows?.length) {
      const opponents = await Promise.all(manualGameRows.map(resolveManualOpponent));
      const now = new Date().getTime();
      const manualCalendarRows: CalendarRow[] = manualGameRows.map((row, i) => {
        const hasScore = row.goals_for != null && row.goals_against != null;
        return {
          id: 0,
          manualKey: `manual-${row.id}`,
          date: row.match_date,
          opponent: { id: opponents[i].id, name: opponents[i].name, logo: opponents[i].logo },
          competition: row.competition_name
            ? { name: row.competition_name, logo: row.competition_logo ?? "" }
            : null,
          isHome: row.is_home,
          result: hasScore
            ? row.goals_for! > row.goals_against!
              ? "W"
              : row.goals_for! < row.goals_against!
                ? "L"
                : "D"
            : null,
          goalsFor: row.goals_for,
          goalsAgainst: row.goals_against,
          finished: hasScore || new Date(row.match_date).getTime() < now,
          preparationFinished: row.finished_at != null,
        };
      });
      const byDateDesc = (a: CalendarRow, b: CalendarRow) => b.date.localeCompare(a.date);
      calendarPast = [
        ...pastCalendarRows,
        ...manualCalendarRows.filter((r) => new Date(r.date).getTime() < now),
      ].sort(byDateDesc);
      calendarFuture = [
        ...futureCalendarRows,
        ...manualCalendarRows.filter((r) => new Date(r.date).getTime() >= now),
      ].sort((a, b) => a.date.localeCompare(b.date));
    }
  }

  // Games whose preparation was finished (Concluída) get a ✓ in the calendar.
  if (pre) {
    const { data: finishedRows } = await pre.finishedPreparations;
    const finishedIds = new Set((finishedRows ?? []).map((r) => r.fixture_id));
    if (finishedIds.size) {
      const mark = (row: CalendarRow) => (!row.manualKey && finishedIds.has(row.id) ? { ...row, preparationFinished: true } : row);
      calendarPast = calendarPast.map(mark);
      calendarFuture = calendarFuture.map(mark);
    }
  }

  // The club's ASM Live Mode fields (what the Live Mode stats list).
  const liveStatConfig = pre ? await pre.liveStatConfig : DEFAULT_LIVE_STAT_CONFIG;

  const generalContent = (
    <div className="space-y-10">
      <section>
        <FixtureCalendar
          title={t("fixtureCalendarTitle")}
          past={calendarPast}
          future={calendarFuture}
          locale={locale}
          logoUrl={teamInfo?.[0]?.team.logo ?? null}
          canAddGames={isCoach}
          competitions={allCompetitions.map((c) => ({
            id: c.league.id,
            name: c.league.name,
            logo: c.league.logo,
          }))}
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
            internalStatsByPlayerId={internalStatsById}
            profileByPlayerId={playerProfiles}
            flagUrlByPlayerId={flagUrlByPlayerId}
            isCoach={isCoach}
            manualPlayers={manualPlayerInfos}
            mergeSuggestions={mergeSuggestionViews}
            countries={countryOptions}
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

  const dossierFiles: DossierFile[] = pre ? await pre.dossierFiles : [];

  const dossierPlayers: DossierPlayer[] = orderSquadLikeGeneralTab(
    (squad?.[0]?.players ?? []).filter((p) => !availabilityByPlayerId.get(p.id)?.excluded),
    playerStatsById,
  ).map((p) => ({ id: p.id, name: shortenPlayerName(p.name), photo: p.photo }));

  const dossierContent = teamId ? (
    <TeamDossier
      teamId={teamId}
      files={dossierFiles}
      players={dossierPlayers}
      isCoach={isCoach}
    />
  ) : null;


  const generalStatsContent = teamId ? (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <TeamStatsComparison
          teamId={teamId}
          isCoach={isCoach}
          fields={HEADLINE_TEAM_STAT_FIELDS}
          externalValues={externalTeamStats}
          internalValues={internalTeamStats}
            liveValues={liveTeamStats}
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
            liveValues={liveTeamStats}
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
            liveValues={liveTeamStats}
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
            liveValues={liveTeamStats}
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
            liveValues={liveTeamStats}
            title={t("statPenaltiesTitle")}
          />
        </div>
      </div>
    </div>
  ) : null;

  const statsContent = teamId ? (
    <StatsSubTabs
      generalContent={generalStatsContent}
      liveContent={<LiveStatsExplorer games={liveGames} isCoach={isCoach} statConfig={liveStatConfig} />}
    />
  ) : null;

  const notesContent =
    isCoach && teamId ? (
      <NotesList
        kind="club"
        teamId={teamId}
        notes={clubNotes}
        mentionPlayers={dossierPlayers}
        title={t("clubNotesTitle")}
        emptyText={t("noClubNotesFound")}
        placeholder={t("clubNotesPlaceholder")}
        addLabel={t("addClubNoteButton")}
      />
    ) : null;

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
                eyebrow={[t("clubSectionTitle"), teamInfo[0].team.country].filter(Boolean).join(" · ")}
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
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{teamInfo[0].team.name}</h1>
              </ClubHeaderAccent>
            </div>
          )}

          <ClubDetailTabs
            generalContent={generalContent}
            physicalContent={physicalContent}
            statsContent={statsContent}
            notesContent={notesContent}
            dossierContent={dossierContent}
          />
        </>
      )}
    </div>
  );
}
