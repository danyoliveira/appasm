import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getFixtureById, getSquad, getTeamInfo } from "@/lib/api-football/cache";
import { loadLiveScores, withLiveScore } from "@/lib/liveScores";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import { getVideoEmbedUrl } from "@/lib/videoEmbed";
import type { TacticalMarker, TacticalArrow, TacticalPosition } from "../../../../actions";
import type { GameSubmoment, VideoCategory } from "../../../../preparations/videoCategories";
import { leagueLabel, translateRound } from "../../../../club/fixtureHelpers";
import BackLink from "../../../../BackLink";
import { SectionHeading } from "../../../../OpponentScouting";
import type { PreparationVideoRow } from "../../../../preparations/PreparationVideoList";
import type { TacticalSnapshotRow } from "../../../../preparations/TacticalSnapshotList";
import LiveMatchRecapSection from "../../../../preparations/LiveMatchRecapSection";
import PostGameNotes from "../../../../preparations/PostGameNotes";
import ArchivedAnalysis from "./ArchivedAnalysis";
import TeamCrest from "@/components/TeamCrest";

// Snapshots saved before the ball/markers/arrows toolbox stored a plain
// player array in `positions`; newer ones store the full shape — same
// backward-compat parsing as the live preparation page.
type LegacyPosition = Omit<TacticalPosition, "team"> & { team?: "us" | "opponent" };

interface ArchivedMatch {
  opponentId: number | null;
  opponentName: string;
  opponentLogo: string;
  date: string;
  isHome: boolean;
  // Home goals first, as on the scoreboard; null while there's no result.
  score: { home: number; away: number } | null;
  competition: { name: string; logo: string; round: string } | null;
  venue: string | null;
  finishedAt: string | null;
}

export default async function ArchivedPreparationPage({
  params,
}: {
  params: Promise<{ locale: Locale; stintId: string; prepKey: string }>;
}) {
  const { locale, stintId, prepKey } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: stint } = await supabase
    .from("coaching_stints")
    .select("id, team_id, started_at, ended_at")
    .eq("id", stintId)
    .not("ended_at", "is", null)
    .maybeSingle();

  if (!stint) {
    return (
      <div>
        <BackLink href="/archive" label={t("archiveTitle")} />
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {t("archiveStintNotFound")}
        </p>
      </div>
    );
  }

  const isManual = prepKey.startsWith("manual-");
  const [teamInfo, liveScores] = await Promise.all([
    getTeamInfo(stint.team_id).catch(() => []),
    loadLiveScores(supabase, stint.team_id),
  ]);
  const ourTeam = teamInfo[0]?.team ?? null;
  const liveScore = liveScores.get(prepKey) ?? null;

  let match: ArchivedMatch | null = null;

  if (isManual) {
    const { data: manual } = await supabase
      .from("manual_preparations")
      .select(
        "opponent_team_id, opponent_name, opponent_logo, match_date, competition_name, competition_logo, is_home, goals_for, goals_against, finished_at",
      )
      .eq("id", prepKey.slice("manual-".length))
      .eq("team_id", stint.team_id)
      .maybeSingle();
    if (manual) {
      const opponent = await resolveManualOpponent(manual);
      const isHome = manual.is_home !== false;
      // A hand-entered final score wins; otherwise the Live Mode one.
      const score =
        manual.goals_for != null && manual.goals_against != null
          ? isHome
            ? { home: manual.goals_for, away: manual.goals_against }
            : { home: manual.goals_against, away: manual.goals_for }
          : liveScore;
      match = {
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentLogo: opponent.logo,
        date: manual.match_date,
        isHome,
        score,
        competition: manual.competition_name
          ? { name: manual.competition_name, logo: manual.competition_logo ?? "", round: "" }
          : null,
        venue: null,
        finishedAt: manual.finished_at ?? null,
      };
    }
  } else {
    const fixtureId = Number(prepKey);
    const [fixtureResult, { data: preparationRow }] = await Promise.all([
      Number.isFinite(fixtureId) ? getFixtureById(fixtureId).catch(() => []) : Promise.resolve([]),
      supabase
        .from("fixture_preparations")
        .select("finished_at")
        .eq("team_id", stint.team_id)
        .eq("fixture_id", Number.isFinite(fixtureId) ? fixtureId : -1)
        .maybeSingle(),
    ]);
    // No score from the external source → the ASM Live Mode one.
    const detail = fixtureResult[0] ? withLiveScore(fixtureResult[0], liveScores) : null;
    if (detail && (detail.teams.home.id === stint.team_id || detail.teams.away.id === stint.team_id)) {
      const isHome = detail.teams.home.id === stint.team_id;
      const opponent = isHome ? detail.teams.away : detail.teams.home;
      match = {
        opponentId: opponent.id,
        opponentName: opponent.name,
        opponentLogo: opponent.logo,
        date: detail.fixture.date,
        isHome,
        score:
          detail.goals.home != null && detail.goals.away != null
            ? { home: detail.goals.home, away: detail.goals.away }
            : null,
        competition: { name: detail.league.name, logo: detail.league.logo, round: detail.league.round },
        venue: detail.fixture.venue.name,
        finishedAt: preparationRow?.finished_at ?? null,
      };
    }
  }

  if (!match) {
    return (
      <div>
        <BackLink href={`/archive/${stint.id}`} label={ourTeam?.name ?? t("archiveTitle")} />
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {t("archivePreparationNotFound")}
        </p>
      </div>
    );
  }

  // The coach's post-match analysis, read on its own so the page still
  // opens if the column isn't there yet.
  const notesQuery = isManual
    ? supabase
        .from("manual_preparations")
        .select("post_game_notes")
        .eq("id", prepKey.slice("manual-".length))
        .maybeSingle()
    : supabase
        .from("fixture_preparations")
        .select("post_game_notes")
        .eq("team_id", stint.team_id)
        .eq("fixture_id", Number(prepKey))
        .maybeSingle();

  const [
    { data: tacticsRows },
    { data: videoRows },
    ourSquadResult,
    opponentSquadResult,
    notesResult,
    { data: liveSession },
  ] = await Promise.all([
    supabase
      .from("preparation_tactics")
      .select("id, positions, notes, video_url")
      .eq("team_id", stint.team_id)
      .eq("preparation_key", prepKey)
      .order("created_at", { ascending: false }),
    supabase
      .from("preparation_videos")
      .select("id, url, notes, category, submoment, player_id, team")
      .eq("team_id", stint.team_id)
      .eq("preparation_key", prepKey)
      .order("created_at", { ascending: false }),
    supabase.from("archived_squad_players").select("player_id, name, photo").eq("stint_id", stint.id),
    match.opponentId ? getSquad(match.opponentId).catch(() => []) : Promise.resolve([]),
    notesQuery,
    // The finished Live Mode game, if one was recorded for this match.
    supabase
      .from("live_match_sessions")
      .select("id")
      .eq("team_id", stint.team_id)
      .eq("preparation_key", prepKey)
      .not("ended_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const postGameNotes = (notesResult.data as { post_game_notes?: string | null } | null)?.post_game_notes ?? null;

  const playerById = new Map<number, { id: number; name: string; photo: string }>();
  for (const p of opponentSquadResult[0]?.players ?? []) {
    playerById.set(p.id, { id: p.id, name: p.name, photo: p.photo });
  }
  for (const p of ourSquadResult.data ?? []) {
    playerById.set(p.player_id, { id: p.player_id, name: p.name, photo: p.photo ?? "" });
  }

  const totalSnapshots = tacticsRows?.length ?? 0;
  const tacticalSnapshots: TacticalSnapshotRow[] = (tacticsRows ?? []).map((row, i) => {
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
      title: t("videoSnapshotOption", { index: totalSnapshots - i }),
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

  // A player added by hand on the tactical board only exists inside the
  // snapshots that use them — without this a video tagged with one of them
  // loses its player.
  for (const snapshot of tacticalSnapshots) {
    for (const pos of snapshot.positions) {
      if (!playerById.has(pos.playerId)) {
        playerById.set(pos.playerId, { id: pos.playerId, name: pos.name, photo: pos.photo });
      }
    }
  }

  const videos: PreparationVideoRow[] = (videoRows ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    notes: row.notes,
    embedUrl: getVideoEmbedUrl(row.url),
    category: row.category,
    submoment: row.submoment,
    player: row.player_id ? (playerById.get(row.player_id) ?? null) : null,
    team: (row.team as "us" | "opponent") ?? "opponent",
  }));

  const ourSide = { name: ourTeam?.name ?? "", logo: ourTeam?.logo ?? "" };
  const opponentSide = { name: match.opponentName, logo: match.opponentLogo };
  const home = match.isHome ? ourSide : opponentSide;
  const away = match.isHome ? opponentSide : ourSide;
  const competitionLine = match.competition
    ? [leagueLabel(match.competition.name, t), translateRound(match.competition.round, t)].filter(Boolean).join(" · ")
    : null;
  const hasPostGame = Boolean(postGameNotes?.trim()) || liveSession != null;

  function renderSide(side: { name: string; logo: string }) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
        {side.logo ? (
          <TeamCrest logo={side.logo} className="h-12 w-12" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20 text-lg font-semibold text-accent">
            {side.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="max-w-full truncate text-center text-sm font-medium">{side.name}</span>
      </div>
    );
  }

  return (
    <div>
      <BackLink href={`/archive/${stint.id}`} label={ourTeam?.name ?? t("archiveTitle")} />

      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("preparationTitleForOpponent", { opponent: match.opponentName })}
      </h1>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        {competitionLine && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted">
            {match.competition?.logo && <TeamCrest logo={match.competition.logo} className="h-4 w-4" />}
            <span>{competitionLine}</span>
          </div>
        )}

        <div className="mx-auto mt-4 flex max-w-md items-center justify-center gap-4 sm:gap-8">
          {renderSide(home)}
          <div className="shrink-0 text-center">
            {match.score ? (
              <div className="text-3xl font-bold tracking-tight tabular-nums">
                {match.score.home} - {match.score.away}
              </div>
            ) : (
              <div className="text-lg font-semibold uppercase text-muted">{t("preparationVsLabel")}</div>
            )}
          </div>
          {renderSide(away)}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            {new Date(match.date).toLocaleDateString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {match.venue && <span>🏟️ {match.venue}</span>}
          {match.finishedAt && (
            <span className="flex items-center gap-1 rounded-full bg-green-600/10 px-2 py-0.5 font-medium text-green-700 dark:text-green-400">
              ✓ {t("preparationFinishedBadge")}
            </span>
          )}
          <span className="rounded-full bg-background px-2 py-0.5 font-medium ring-1 ring-border">
            {t("archiveReadOnlyBadge")}
          </span>
        </div>
      </div>

      <section className="mt-8">
        <SectionHeading icon="clipboard" title={t("preparationTabPreGame")} />
        <div className="mt-3">
          {tacticalSnapshots.length + videos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
              {t("archivePreparationEmpty")}
            </p>
          ) : (
            <ArchivedAnalysis
              tacticalRows={tacticalSnapshots}
              videoRows={videos}
              ourLogo={ourSide.logo || undefined}
              opponentLogo={opponentSide.logo || undefined}
            />
          )}
        </div>
      </section>

      {hasPostGame && (
        <section className="mt-10">
          <SectionHeading icon="note" title={t("liveStatsRecapTabLabel")} />
          <div className="mt-3">
            <PostGameNotes preparationKey={prepKey} initialNotes={postGameNotes} canEdit={false} />
            {liveSession && <LiveMatchRecapSection sessionId={liveSession.id} preparationKey={prepKey} />}
          </div>
        </section>
      )}
    </div>
  );
}
