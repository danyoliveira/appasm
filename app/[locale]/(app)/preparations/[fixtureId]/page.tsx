import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStintId } from "@/lib/coachingStints";
import { getManualPlayers, withManualPlayers } from "@/lib/manualPlayers";
import {
  getFixtureById,
  getTeamInfo,
  getLastFixtures,
  getNextFixtures,
  getInjuries,
  getHeadToHead,
  getSquad,
} from "@/lib/api-football/cache";
import {
  getCurrentCompetitions,
  getStatsPerCompetition,
  combineTeamStats,
} from "@/lib/api-football/teamStats";
import type { Fixture, TeamStatistics, Injury } from "@/lib/api-football/client";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import { getCompetitionOptions } from "@/lib/competitionOptions";
import type { ManualMatchDetails } from "../../actions";
import EditManualPreparation from "../EditManualPreparation";
import PreparationTabs from "../PreparationTabs";
import BackLink from "../../BackLink";
import Countdown from "../../Countdown";
import { translateRound } from "../../club/fixtureHelpers";
import { isNonInjuryReason, shortenPlayerName } from "../../club/playerShared";
import { getVideoEmbedUrl } from "@/lib/videoEmbed";
import { type PreparationVideoRow } from "../PreparationVideoList";
import PreGameAnalysis from "../PreGameAnalysis";
import type { TacticalSnapshotRow } from "../TacticalSnapshotList";
import type { PlayerStatus, TacticalArrow, TacticalMarker, TacticalPosition } from "../../actions";
import type { GameSubmoment, VideoCategory } from "../videoCategories";
import LiveStatsPanel from "../LiveStatsPanel";
import LiveMatchRecapSection from "../LiveMatchRecapSection";
import FinishPreparationBar from "../FinishPreparationBar";
import PostGameNotes from "../PostGameNotes";
import { getLiveSession, type LiveSessionInfo } from "../liveStatsActions";
import TeamCrest from "@/components/TeamCrest";
import OpponentScouting from "../../OpponentScouting";
import { loadLiveScores, withLiveScore } from "@/lib/liveScores";

interface PreparationMatch {
  // null for a custom opponent typed by hand — one that isn't in
  // API-Football's own database, so there's nothing to fetch scouting data,
  // a squad, or stats for.
  opponentId: number | null;
  opponentName: string;
  opponentLogo: string;
  date: string;
  realFixtureId: number | null;
  finished: boolean;
  ourTeamName: string;
  ourTeamLogo: string;
  isHome: boolean;
  score: { home: number | null; away: number | null } | null;
  competition: { name: string; logo: string; round: string } | null;
  venue: string | null;
}

export default async function PreparationDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; fixtureId: string }>;
}) {
  const { locale, fixtureId: fixtureIdParam } = await params;
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

  const ourTeamInfo = teamId ? await getTeamInfo(teamId).catch(() => []) : [];
  const ourTeam = ourTeamInfo[0]?.team ?? null;

  let match: PreparationMatch | null = null;
  // Set once the preparation is finished (Concluída) — read-only from then.
  let finishedAt: string | null = null;
  // A game the coach hasn't started preparing: nobody else gets in (they
  // only ever enter preparations that are already open).
  let notOpenedYet = false;
  // Manual games only — what the edit form prefills.
  let manualDetails: ManualMatchDetails | undefined;

  const manualCompetitionOptions =
    isCoach && teamId && fixtureIdParam.startsWith("manual-") ? await getCompetitionOptions(teamId) : [];

  if (fixtureIdParam.startsWith("manual-")) {
    const manualId = fixtureIdParam.slice("manual-".length);
    const { data: manualRow } = await supabase
      .from("manual_preparations")
      .select(
        "opponent_team_id, opponent_name, opponent_logo, match_date, competition_league_id, competition_name, competition_logo, is_home, goals_for, goals_against, finished_at",
      )
      .eq("id", manualId)
      .maybeSingle();

    if (manualRow) {
      finishedAt = manualRow.finished_at ?? null;
      const opponent = await resolveManualOpponent(manualRow);

      // A manual game has no external result — the only place a final
      // score can come from is a finished Modo Jogo session for it.
      let finished = false;
      let score: { home: number | null; away: number | null } | null = null;
      const { data: manualSession } = await supabase
        .from("live_match_sessions")
        .select("id")
        .eq("preparation_key", fixtureIdParam)
        .not("ended_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      manualDetails = {
        competition: manualRow.competition_name
          ? {
              leagueId: manualRow.competition_league_id,
              name: manualRow.competition_name,
              logo: manualRow.competition_logo,
            }
          : null,
        isHome: manualRow.is_home,
        goalsFor: manualRow.goals_for,
        goalsAgainst: manualRow.goals_against,
      };

      // A hand-entered final score wins; otherwise a finished Modo Jogo
      // session's goal tally is the only source.
      if (manualRow.goals_for != null && manualRow.goals_against != null) {
        finished = true;
        score = manualRow.is_home
          ? { home: manualRow.goals_for, away: manualRow.goals_against }
          : { home: manualRow.goals_against, away: manualRow.goals_for };
      } else if (manualSession) {
        const { data: goalEntries } = await supabase
          .from("live_match_entries")
          .select("team_side")
          .eq("session_id", manualSession.id)
          .eq("kind", "event")
          .eq("event_type", "goal");
        finished = true;
        score = {
          home: (goalEntries ?? []).filter((e) => e.team_side === "home").length,
          away: (goalEntries ?? []).filter((e) => e.team_side === "away").length,
        };
      }

      match = {
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentLogo: opponent.logo,
        date: manualRow.match_date,
        realFixtureId: null,
        finished,
        ourTeamName: ourTeam?.name ?? "",
        ourTeamLogo: ourTeam?.logo ?? "",
        isHome: manualRow.is_home,
        score,
        competition: manualRow.competition_name
          ? { name: manualRow.competition_name, logo: manualRow.competition_logo ?? "", round: "" }
          : null,
        venue: null,
      };
    }
  } else {
    const fixtureId = Number(fixtureIdParam);
    const [fixtureResult, liveScores] = await Promise.all([
      getFixtureById(fixtureId).catch(() => []),
      teamId ? loadLiveScores(supabase, teamId) : Promise.resolve(new Map()),
    ]);
    // No API-Football score yet → the ASM Live Mode one.
    const fixture = fixtureResult[0] ? withLiveScore(fixtureResult[0], liveScores) : null;
    // A fixture our club isn't part of (an old link opened after changing
    // club) is not ours to prepare — it used to be filed as a preparation
    // against the home side.
    const opponent =
      fixture && teamId
        ? fixture.teams.home.id === teamId
          ? fixture.teams.away
          : fixture.teams.away.id === teamId
            ? fixture.teams.home
            : null
        : null;

    if (fixture && opponent) {
      match = {
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentLogo: opponent.logo,
        date: fixture.fixture.date,
        realFixtureId: fixtureId,
        finished: fixture.goals.home != null && fixture.goals.away != null,
        ourTeamName: ourTeam?.name ?? (fixture.teams.home.id === teamId ? fixture.teams.home.name : fixture.teams.away.name),
        ourTeamLogo: ourTeam?.logo ?? (fixture.teams.home.id === teamId ? fixture.teams.home.logo : fixture.teams.away.logo),
        isHome: fixture.teams.home.id === teamId,
        score: fixture.goals,
        competition: {
          name: fixture.league.name,
          logo: fixture.league.logo,
          round: fixture.league.round,
        },
        venue: fixture.fixture.venue.name,
      };

      // Opening this page is what "preparing" a fixture means — record it
      // (idempotent) so the past-games list below only shows fixtures that
      // were actually prepared, not the team's entire history.
      if (isCoach && teamId) {
        await supabase
          .from("fixture_preparations")
          .upsert(
            { team_id: teamId, fixture_id: fixtureId, created_by: user.id },
            { onConflict: "team_id,fixture_id", ignoreDuplicates: true },
          );
      }
      if (teamId) {
        const { data: preparationRow } = await supabase
          .from("fixture_preparations")
          .select("finished_at")
          .eq("team_id", teamId)
          .eq("fixture_id", fixtureId)
          .maybeSingle();
        finishedAt = preparationRow?.finished_at ?? null;
        if (!isCoach && !preparationRow) {
          notOpenedYet = true;
          match = null;
        }
      }
    }
  }

  let liveSession: LiveSessionInfo | null = null;
  // The coach's post-match analysis. Read on its own (not added to the
  // queries above) so the page still opens if the column isn't there yet.
  let postGameNotes: string | null = null;
  if (match) {
    const notesQuery = fixtureIdParam.startsWith("manual-")
      ? supabase
          .from("manual_preparations")
          .select("post_game_notes")
          .eq("id", fixtureIdParam.slice("manual-".length))
          .maybeSingle()
      : teamId
        ? supabase
            .from("fixture_preparations")
            .select("post_game_notes")
            .eq("team_id", teamId)
            .eq("fixture_id", Number(fixtureIdParam))
            .maybeSingle()
        : null;
    const [session, notesResult] = await Promise.all([getLiveSession(fixtureIdParam), notesQuery]);
    liveSession = session;
    postGameNotes = (notesResult?.data as { post_game_notes?: string | null } | null)?.post_game_notes ?? null;
  }

  // Finished preparations are read-only for everyone until reopened.
  const canEdit = isCoach && !finishedAt;
  const isLiveStatsManager = canEdit;
  // "Finalizar" is only offered after the game: a result, a finished Live
  // Mode session, or two hours past kick-off.
  const gameOver =
    match != null &&
    (match.finished ||
      liveSession?.endedAt != null ||
      new Date(match.date).getTime() + 2 * 60 * 60 * 1000 < new Date().getTime());

  // Opponent scouting profile for the Pré-Jogo tab — the same data and
  // layout already proven on the dashboard's "next fixture" opponent panel
  // (injuries, unavailable players, head-to-head, last/next match either
  // side of this one, season stats as a compact list), reused here
  // per-match instead of duplicating a new design.
  let opponentStats: TeamStatistics | null = null;
  let opponentLastFixture: Fixture | null = null;
  let opponentNextFixture: Fixture | null = null;
  let opponentInjuries: Injury[] = [];
  let opponentUnavailable: Injury[] = [];
  let headToHead: Fixture[] = [];
  // Hoisted out of `match.opponentId` — a plain const narrows cleanly across
  // the awaits and closures below, where the nested property wouldn't.
  const opponentId = match?.opponentId ?? null;

  if (match && opponentId != null) {
    try {
      const opponentCompetitions = await getCurrentCompetitions(opponentId);
      if (opponentCompetitions.defaultSeason) {
        const [statsByCompetitionId, lastFixtures, nextFixtures, injuriesResult, headToHeadResult] =
          await Promise.all([
            getStatsPerCompetition(
              opponentId,
              opponentCompetitions.competitions,
              opponentCompetitions.defaultSeason,
            ),
            getLastFixtures(opponentId).catch(() => []),
            getNextFixtures(opponentId).catch(() => []),
            getInjuries(opponentId, opponentCompetitions.defaultSeason).catch(() => []),
            teamId ? getHeadToHead(teamId, opponentId).catch(() => []) : Promise.resolve([]),
          ]);
        opponentStats = combineTeamStats(Array.from(statsByCompetitionId.values()));
        opponentLastFixture = lastFixtures[0] ?? null;
        opponentNextFixture =
          nextFixtures.find(
            (fx) =>
              fx.fixture.id !== match!.realFixtureId &&
              new Date(fx.fixture.date).getTime() > new Date(match!.date).getTime(),
          ) ?? null;
        headToHead = headToHeadResult;

        // /injuries returns one row per fixture a player missed, so the
        // same player shows up once per matchweek — keep only their most
        // recent entry so each injured player appears a single time.
        const latestInjuryByPlayer = new Map<number, Injury>();
        injuriesResult.forEach((injury) => {
          const existing = latestInjuryByPlayer.get(injury.player.id);
          if (!existing || new Date(injury.fixture.date) > new Date(existing.fixture.date)) {
            latestInjuryByPlayer.set(injury.player.id, injury);
          }
        });
        const dedupedInjuries = Array.from(latestInjuryByPlayer.values());
        // Suspensions, national duty, coach's decision, etc. aren't a
        // medical injury — split them into their own "unavailable" list.
        opponentInjuries = dedupedInjuries.filter((i) => !isNonInjuryReason(i.player.reason));
        opponentUnavailable = dedupedInjuries.filter((i) => isNonInjuryReason(i.player.reason));
      }
    } catch {
      // Bonus data — silently skip if unavailable.
    }
  }

  let opponentSquad: {
    id: number;
    name: string;
    number: number | null;
    photo: string;
    position: string;
  }[] = [];
  let ourSquad: {
    id: number;
    name: string;
    number: number | null;
    photo: string;
    position: string;
    status: PlayerStatus;
  }[] = [];
  let tacticalSnapshots: TacticalSnapshotRow[] = [];
  if (match) {
    const currentStintId = teamId ? await getCurrentStintId(supabase, teamId) : null;
    const [squadResult, ourApiSquad, ourManualRows, { data: availabilityRows }, { data: tacticsRows }] =
      await Promise.all([
        opponentId != null ? getSquad(opponentId).catch(() => []) : Promise.resolve([]),
        teamId ? getSquad(teamId).catch(() => []) : Promise.resolve([]),
        teamId ? getManualPlayers(supabase, teamId, currentStintId) : Promise.resolve([]),
        teamId
          ? supabase
              .from("player_availability")
              .select("player_id, status, excluded")
              .eq("team_id", teamId)
              .eq("stint_id", currentStintId)
          : Promise.resolve({ data: null }),
        supabase
          .from("preparation_tactics")
          .select("id, positions, notes, video_url")
          .eq("preparation_key", fixtureIdParam)
          .order("created_at", { ascending: false }),
      ]);
    opponentSquad = (squadResult[0]?.players ?? []).map((p) => ({
      id: p.id,
      name: shortenPlayerName(p.name),
      number: p.number,
      photo: p.photo,
      position: p.position,
    }));
    const availabilityByPlayerId = new Map(
      (availabilityRows ?? []).map((row) => [row.player_id, row]),
    );
    const ourSquadResult = withManualPlayers(ourApiSquad, ourManualRows);
    ourSquad = (ourSquadResult[0]?.players ?? [])
      .filter((p) => !availabilityByPlayerId.get(p.id)?.excluded)
      .map((p) => ({
        id: p.id,
        name: shortenPlayerName(p.name),
        number: p.number,
        photo: p.photo,
        position: p.position,
        status: (availabilityByPlayerId.get(p.id)?.status as PlayerStatus) ?? "available",
      }));
    type LegacyPosition = Omit<TacticalPosition, "team"> & { team?: "us" | "opponent" };
    const totalSnapshots = tacticsRows?.length ?? 0;
    tacticalSnapshots = (tacticsRows ?? []).map((row, i) => {
      // Snapshots saved before the ball/markers/arrows toolbox stored a
      // plain player array in `positions`; newer ones store the full shape.
      const raw = row.positions as
        | LegacyPosition[]
        | {
            players?: LegacyPosition[];
            ball?: { x: number; y: number } | null;
            markers?: TacticalMarker[];
            arrows?: TacticalArrow[];
            team?: "us" | "opponent";
            moment?: VideoCategory | null;
            submoment?: GameSubmoment | null;
            player?: { id: number; name: string } | null;
          }
        | null;
      const isLegacyArray = Array.isArray(raw);
      const rawPlayers = isLegacyArray ? raw : (raw?.players ?? []);
      return {
        id: row.id,
        // Rows come back newest-first — number them oldest-first (#1 is the
        // first analysis ever saved for this preparation) so the label
        // stays meaningful as new ones are added.
        title: t("videoSnapshotOption", { index: totalSnapshots - i }),
        // Snapshots saved before both squads could be placed only ever held
        // opponent players, so a missing team defaults to "opponent".
        positions: rawPlayers.map((p) => ({ ...p, team: p.team ?? "opponent" })),
        team: (isLegacyArray ? undefined : raw?.team) ?? "opponent",
        ball: isLegacyArray ? null : (raw?.ball ?? null),
        markers: isLegacyArray ? [] : (raw?.markers ?? []),
        arrows: isLegacyArray ? [] : (raw?.arrows ?? []),
        moment: isLegacyArray ? null : (raw?.moment ?? null),
        submoment: isLegacyArray ? null : (raw?.submoment ?? null),
        player: isLegacyArray ? null : (raw?.player ?? null),
        notes: row.notes,
        videoUrl: row.video_url,
        videoEmbedUrl: row.video_url ? getVideoEmbedUrl(row.video_url) : null,
      };
    });
  }

  const opponentSquadById = new Map(opponentSquad.map((p) => [p.id, p]));
  const ourSquadById = new Map(ourSquad.map((p) => [p.id, p]));
  // A player added ad hoc on the tactical board (not from either real
  // squad) only ever gets their name/photo recorded inside a saved
  // snapshot's positions — there's no other table for them. Rebuilding this
  // from every snapshot (not just one) is what lets a video tagged with one
  // of them still resolve to a name after a reload, instead of silently
  // losing the tag.
  const customPlayerById = new Map<number, { id: number; name: string; photo: string }>();
  for (const snapshot of tacticalSnapshots) {
    for (const pos of snapshot.positions) {
      if (!opponentSquadById.has(pos.playerId) && !ourSquadById.has(pos.playerId)) {
        customPlayerById.set(pos.playerId, { id: pos.playerId, name: pos.name, photo: pos.photo });
      }
    }
  }

  let videoRows: PreparationVideoRow[] = [];
  if (match) {
    const { data } = await supabase
      .from("preparation_videos")
      .select("id, url, notes, category, submoment, player_id, team")
      .eq("preparation_key", fixtureIdParam)
      .order("created_at", { ascending: false });

    videoRows = (data ?? []).map((row) => {
      const player = row.player_id
        ? (opponentSquadById.get(row.player_id) ??
          ourSquadById.get(row.player_id) ??
          customPlayerById.get(row.player_id) ??
          null)
        : null;

      return {
        id: row.id,
        url: row.url,
        notes: row.notes,
        embedUrl: getVideoEmbedUrl(row.url),
        category: row.category,
        submoment: row.submoment,
        player: player ? { id: player.id, name: player.name, photo: player.photo } : null,
        team: (row.team as "us" | "opponent") ?? "opponent",
      };
    });
  }

  const generalInfoContent = match && (
    opponentId == null ? (
      // A custom opponent (not in API-Football's own database) has nothing
      // to scout automatically — say so once instead of leaving every
      // section below either empty or silently absent.
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
        {t("preparationCustomOpponentScoutingHint")}
      </div>
    ) : (
    <OpponentScouting
      t={t}
      locale={locale}
      teamId={teamId}
      opponentId={opponentId}
      injuries={opponentInjuries}
      unavailable={opponentUnavailable}
      headToHead={headToHead}
      lastFixture={opponentLastFixture}
      nextFixture={opponentNextFixture}
      stats={opponentStats}
      showEmptyAbsences
    />
    )
  );

  // Rendered twice (normal width, then focus mode's wider layout) instead
  // of passed down as a function — Server Components can't hand a function
  // to a Client Component like PreparationTabs, only already-resolved JSX.
  function renderPreGameContent(sideBySide: boolean) {
    return (
      <PreGameAnalysis
        preparationKey={fixtureIdParam}
        opponentSquad={opponentSquad}
        ourSquad={ourSquad}
        ourLogo={match?.ourTeamLogo}
        opponentLogo={match?.opponentLogo}
        isCoach={canEdit}
        // Anyone but the coach only gets what was saved — no board to
        // draw on, same as a finished preparation.
        readOnly={finishedAt != null || !isCoach}
        sideBySide={sideBySide}
        tacticalRows={tacticalSnapshots}
        videoRows={videoRows}
      />
    );
  }

  function renderInGameContent() {
    if (!match) return null;
    // Without the coach's controls there is nothing here until the Live
    // Mode game exists — then it's the links to it.
    if (!isCoach && !liveSession) return null;
    return (
      <LiveStatsPanel
        preparationKey={fixtureIdParam}
        isManager={isLiveStatsManager}
        initialSession={liveSession}
      />
    );
  }

  function renderPostGameContent() {
    if (!match) return null;
    const finishBar = (
      <FinishPreparationBar
        preparationKey={fixtureIdParam}
        finishedAt={finishedAt}
        gameOver={gameOver}
        isCoach={isCoach}
      />
    );
    return (
      <>
        {finishBar}
        {/* Only once there is a game to write about. */}
        {gameOver && (
          <PostGameNotes preparationKey={fixtureIdParam} initialNotes={postGameNotes} canEdit={canEdit} />
        )}
        {renderPostGameBody()}
      </>
    );
  }

  function renderPostGameBody() {
    if (!match) return null;
    if (!liveSession) {
      // Explains how this tab actually fills in, instead of the generic
      // "coming soon" placeholder — there's no session yet to hand
      // LiveMatchRecapSection, so it can't render its own more specific
      // "match not finished yet" message.
      return (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
          {isCoach ? t("preparationPostGameNoSessionHint") : t("preparationPostGameNoSessionViewerHint")}
        </div>
      );
    }
    return <LiveMatchRecapSection sessionId={liveSession.id} preparationKey={fixtureIdParam} />;
  }

  const preGameContent = match ? renderPreGameContent(false) : null;
  const preGameContentFocus = match ? renderPreGameContent(true) : null;
  const inGameContent = renderInGameContent();
  const postGameContent = renderPostGameContent();

  return (
    <div>
      <BackLink href="/preparations" label={t("navPreparation")} />

      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {match
          ? t("preparationTitleForOpponent", { opponent: match.opponentName })
          : t("navPreparation")}
      </h1>

      {!match ? (
        <p className="mt-6 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {notOpenedYet ? t("preparationNotOpenedYet") : t("preparationNoUpcomingFixture")}
        </p>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
            {match.competition && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted">
                <TeamCrest logo={match.competition.logo} className="h-4 w-4" />
                <span>
                  {match.competition.name}
                  {match.competition.round ? ` · ${translateRound(match.competition.round, t)}` : ""}
                </span>
              </div>
            )}

            <div className="mt-4 flex items-center justify-center gap-6 sm:gap-10">
              <div className="flex flex-col items-center gap-2">
                {(match.isHome ? match.ourTeamLogo : match.opponentLogo) ? (
                  <TeamCrest logo={match.isHome ? match.ourTeamLogo : match.opponentLogo} className="h-12 w-12" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-lg font-semibold text-accent">
                    {(match.isHome ? match.ourTeamName : match.opponentName).charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[110px] truncate text-center text-sm font-medium">
                  {match.isHome ? match.ourTeamName : match.opponentName}
                </span>
              </div>

              <div className="text-center">
                {match.finished && match.score ? (
                  <div className="text-3xl font-bold tracking-tight">
                    {match.score.home ?? "-"} - {match.score.away ?? "-"}
                  </div>
                ) : (
                  <div className="text-lg font-semibold uppercase text-muted">
                    {t("preparationVsLabel")}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-2">
                {(match.isHome ? match.opponentLogo : match.ourTeamLogo) ? (
                  <TeamCrest logo={match.isHome ? match.opponentLogo : match.ourTeamLogo} className="h-12 w-12" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-lg font-semibold text-accent">
                    {(match.isHome ? match.opponentName : match.ourTeamName).charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[110px] truncate text-center text-sm font-medium">
                  {match.isHome ? match.opponentName : match.ourTeamName}
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
              <span>
                {new Date(match.date).toLocaleDateString(locale)} ·{" "}
                {new Date(match.date).toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {match.venue && <span>🏟️ {match.venue}</span>}
              {finishedAt && (
                <span className="flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 font-medium text-green-700 dark:text-green-400">
                  ✓ {t("preparationFinishedBadge")}
                </span>
              )}
            </div>

            {!match.realFixtureId && canEdit && (
              <div className="mt-2 flex justify-center">
                <EditManualPreparation
                  id={fixtureIdParam.replace(/^manual-/, "")}
                  opponentName={match.opponentName}
                  matchDate={match.date}
                  competitions={manualCompetitionOptions}
                  details={manualDetails}
                />
              </div>
            )}

            {!match.finished && (
              <div className="mt-3 flex justify-center">
                <Countdown
                  target={match.date}
                  finished={match.finished}
                  labels={{
                    days: t("countdownDays"),
                    hours: t("countdownHours"),
                    minutes: t("countdownMinutes"),
                    seconds: t("countdownSeconds"),
                    live: t("countdownLive"),
                  }}
                />
              </div>
            )}
          </div>

          <div className="mt-6">
            <PreparationTabs
              generalInfoContent={generalInfoContent}
              preGameContent={preGameContent}
              preGameContentFocus={preGameContentFocus}
              inGameContent={inGameContent}
              inGameContentFocus={inGameContent}
              postGameContent={postGameContent}
              postGameContentFocus={postGameContent}
              matchDate={match.date}
              opponentName={match.opponentName}
              liveSession={liveSession}
              finished={match.finished}
              locked={finishedAt != null}
              hideInGame={!isCoach && !liveSession}
              canFocus={isCoach}
              ourLogo={match.ourTeamLogo}
              opponentLogo={match.opponentLogo}
              ourTeamName={match.ourTeamName}
              tacticalRows={tacticalSnapshots}
              videoRows={videoRows}
              postGamePdf={
                liveSession?.endedAt
                  ? {
                      sessionId: liveSession.id,
                      competition: match.competition
                        ? [match.competition.name, translateRound(match.competition.round, t)]
                            .filter(Boolean)
                            .join(" · ")
                        : null,
                      notes: postGameNotes,
                    }
                  : null
              }
            />
          </div>
        </>
      )}
    </div>
  );
}
