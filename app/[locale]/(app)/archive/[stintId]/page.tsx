import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { getFixtureById, getTeamInfo, getTeamSeasonFixtures } from "@/lib/api-football/cache";
import { loadLiveScores, withLiveScores } from "@/lib/liveScores";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import { leagueLabel, toCalendarRow } from "../../club/fixtureHelpers";
import { translatePosition, STATUS_DOT, STATUS_TEXT, statusLabelKey } from "../../club/playerShared";
import type { PlayerStatus } from "../../actions";
import BackLink from "../../BackLink";
import ClubHeaderAccent from "../../ClubHeaderAccent";
import { SectionHeading } from "../../OpponentScouting";
import DeleteStintButton from "../DeleteStintButton";
import StintGames, { type StintGameRow } from "./StintGames";
import ArchivedDossier from "./ArchivedDossier";
import { CLUB_DOSSIER_CATEGORIES, PLAYER_DOSSIER_CATEGORIES } from "../../club/dossierShared";
import { loadDossierFiles } from "@/lib/dossier";
import { loadPlayerProfiles } from "@/lib/playerProfiles";
import { FootIndicator, PositionChips } from "../../club/PlayerProfileBadges";
import PlayerAvatar from "@/components/PlayerAvatar";

const DAY_MS = 24 * 60 * 60 * 1000;
const POSITION_GROUPS = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;

// European season convention: a season starting in July/August 2026 is
// "season 2026" in API-Football, regardless of the calendar year it ends
// in — used to know which season(s) of getTeamSeasonFixtures to pull for
// an arbitrary stint date range.
function seasonYearForDate(date: Date): number {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

// One row of the "Preparações" list — a calendar fixture or a game the
// coach added by hand.
interface PreparationItem {
  key: string;
  opponentName: string;
  opponentLogo: string;
  date: string;
  competition: string | null;
  isHome: boolean | null;
  // Our goals first; null while the game has no result.
  score: { goalsFor: number; goalsAgainst: number } | null;
  finished: boolean;
}

export default async function ArchivedStintPage({
  params,
}: {
  params: Promise<{ locale: Locale; stintId: string }>;
}) {
  const { locale, stintId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isCoach = profile?.role === "coach";

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

  const startedAt = new Date(stint.started_at);
  const endedAt = new Date(stint.ended_at!);

  const startSeason = seasonYearForDate(startedAt);
  const endSeason = seasonYearForDate(endedAt);
  const seasons = Array.from(
    { length: endSeason - startSeason + 1 },
    (_, i) => startSeason + i,
  );

  const [
    teamInfo,
    { data: squadRows },
    { data: availabilityRows },
    { data: manualPrepRows },
    { data: fixturePrepRows },
    liveScores,
    dossierFiles,
    playerProfiles,
    ...fixturesPerSeason
  ] = await Promise.all([
    getTeamInfo(stint.team_id).catch(() => []),
    supabase
      .from("archived_squad_players")
      .select("player_id, name, photo, number, position")
      .eq("stint_id", stint.id),
    supabase.from("player_availability").select("player_id, status, excluded").eq("stint_id", stint.id),
    supabase
      .from("manual_preparations")
      .select(
        "id, opponent_team_id, opponent_name, opponent_logo, match_date, competition_name, is_home, goals_for, goals_against, finished_at, created_at",
      )
      .eq("team_id", stint.team_id)
      .gte("created_at", stint.started_at)
      .lte("created_at", stint.ended_at!),
    // Every preparation started during the spell — including games that
    // hadn't been played yet when the coach left, which the old list (played
    // matches only) had no way to reach.
    supabase
      .from("fixture_preparations")
      .select("fixture_id, finished_at, created_at")
      .eq("team_id", stint.team_id)
      .gte("created_at", stint.started_at)
      .lte("created_at", stint.ended_at!),
    loadLiveScores(supabase, stint.team_id),
    // The spell's whole dossier — the team's documents and every player's.
    loadDossierFiles(supabase, {
      teamId: stint.team_id,
      stintId: stint.id,
      categories: Array.from(new Set([...CLUB_DOSSIER_CATEGORIES, ...PLAYER_DOSSIER_CATEGORIES])),
    }).catch(() => []),
    // Positions as the coach had them in this spell, and preferred feet.
    loadPlayerProfiles(supabase, { teamId: stint.team_id, stintId: stint.id }),
    ...seasons.map((season) => getTeamSeasonFixtures(stint.team_id, season).catch(() => [])),
  ]);

  const team = teamInfo[0]?.team ?? null;
  const availabilityByPlayerId = new Map((availabilityRows ?? []).map((row) => [row.player_id, row]));

  const squad = [...(squadRows ?? [])].sort(
    (a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name),
  );
  const knownPosition = (position: string | null) =>
    POSITION_GROUPS.includes(position as (typeof POSITION_GROUPS)[number]) ? position : "Midfielder";
  const squadGroups = POSITION_GROUPS.map((group) => ({
    group,
    players: squad.filter((p) => knownPosition(p.position) === group),
  })).filter((g) => g.players.length > 0);

  // A game recorded in ASM Live Mode counts as played even when the
  // external source has no score for it.
  const seasonFixtures = withLiveScores(fixturesPerSeason.flat(), liveScores);
  const fixtureById = new Map(seasonFixtures.map((fx) => [fx.fixture.id, fx]));
  const playedFixtures = seasonFixtures
    .filter((fx) => {
      const time = new Date(fx.fixture.date).getTime();
      return (
        time >= startedAt.getTime() &&
        time <= endedAt.getTime() &&
        fx.goals.home != null &&
        fx.goals.away != null
      );
    })
    .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime());

  // A prepared fixture outside the stint's own seasons (rare) is looked up
  // on its own.
  const fixturePreps = fixturePrepRows ?? [];
  const missingFixtures = await Promise.all(
    fixturePreps
      .filter((p) => !fixtureById.has(p.fixture_id))
      .map((p) => getFixtureById(p.fixture_id).catch(() => [])),
  );
  for (const fx of withLiveScores(missingFixtures.flat(), liveScores)) fixtureById.set(fx.fixture.id, fx);

  const manualRows = manualPrepRows ?? [];
  const manualOpponents = await Promise.all(manualRows.map(resolveManualOpponent));

  const preparations: PreparationItem[] = [
    ...fixturePreps.flatMap((prep): PreparationItem[] => {
      const fx = fixtureById.get(prep.fixture_id);
      // Rows filed against a game the club wasn't even in (see the
      // preparation page) are not preparations of this spell.
      if (!fx || (fx.teams.home.id !== stint.team_id && fx.teams.away.id !== stint.team_id)) return [];
      const row = toCalendarRow(fx, stint.team_id);
      return [
        {
          key: String(prep.fixture_id),
          opponentName: row.opponent.name,
          opponentLogo: row.opponent.logo,
          date: row.date,
          competition: row.competition ? leagueLabel(row.competition.name, t) : null,
          isHome: row.isHome,
          score:
            row.goalsFor != null && row.goalsAgainst != null
              ? { goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst }
              : null,
          finished: prep.finished_at != null,
        },
      ];
    }),
    ...manualRows.map((row, i): PreparationItem => {
      const key = `manual-${row.id}`;
      // A hand-entered final score wins; otherwise the Live Mode one.
      const live = liveScores.get(key);
      const score =
        row.goals_for != null && row.goals_against != null
          ? { goalsFor: row.goals_for, goalsAgainst: row.goals_against }
          : live
            ? row.is_home === false
              ? { goalsFor: live.away, goalsAgainst: live.home }
              : { goalsFor: live.home, goalsAgainst: live.away }
            : null;
      return {
        key,
        opponentName: manualOpponents[i].name,
        opponentLogo: manualOpponents[i].logo,
        date: row.match_date,
        competition: row.competition_name ? leagueLabel(row.competition_name, t) : null,
        isHome: row.is_home ?? null,
        score,
        finished: row.finished_at != null,
      };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Games played during the spell: the calendar's, plus the ones added by
  // hand that have a result (a friendly, a competition the external source
  // doesn't cover) — those used to be left out of the list and the totals.
  const matchRows: PreparationItem[] = [
    ...playedFixtures.map((fx): PreparationItem => {
      const row = toCalendarRow(fx, stint.team_id);
      return {
        key: String(row.id),
        opponentName: row.opponent.name,
        opponentLogo: row.opponent.logo,
        date: row.date,
        competition: row.competition ? leagueLabel(row.competition.name, t) : null,
        isHome: row.isHome,
        score: { goalsFor: row.goalsFor ?? 0, goalsAgainst: row.goalsAgainst ?? 0 },
        finished: false,
      };
    }),
    ...preparations.filter((p) => {
      const time = new Date(p.date).getTime();
      return p.key.startsWith("manual-") && p.score != null && time >= startedAt.getTime() && time <= endedAt.getTime();
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const record = { W: 0, D: 0, L: 0 };
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const row of matchRows) {
    if (!row.score) continue;
    const { goalsFor: scored, goalsAgainst: conceded } = row.score;
    record[scored > conceded ? "W" : scored < conceded ? "L" : "D"] += 1;
    goalsFor += scored;
    goalsAgainst += conceded;
  }

  // What each preparation actually holds, so an empty one (the page was
  // only opened) is told apart from one with work in it.
  const preparationKeys = preparations.map((p) => p.key);
  const [{ data: tacticRows }, { data: videoRows }] =
    preparationKeys.length > 0
      ? await Promise.all([
          supabase
            .from("preparation_tactics")
            .select("preparation_key")
            .eq("team_id", stint.team_id)
            .in("preparation_key", preparationKeys),
          supabase
            .from("preparation_videos")
            .select("preparation_key")
            .eq("team_id", stint.team_id)
            .in("preparation_key", preparationKeys),
        ])
      : [{ data: [] as { preparation_key: string }[] }, { data: [] as { preparation_key: string }[] }];
  const countByKey = (rows: { preparation_key: string }[] | null) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) counts.set(row.preparation_key, (counts.get(row.preparation_key) ?? 0) + 1);
    return counts;
  };
  const analysesByKey = countByKey(tacticRows);
  const videosByKey = countByKey(videoRows);

  const formatDate = (value: string | Date) =>
    new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const days = Math.floor((endedAt.getTime() - startedAt.getTime()) / DAY_MS);
  // A spell that started and ended the same day shows that day once.
  const period =
    formatDate(startedAt) === formatDate(endedAt)
      ? formatDate(startedAt)
      : `${formatDate(startedAt)} – ${formatDate(endedAt)}`;

  function matchMeta(isHome: boolean | null, date: string, competition: string | null) {
    return [
      isHome == null ? null : isHome ? t("homeLabel") : t("awayLabel"),
      formatDate(date),
      competition,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  // One list for the whole spell: every game played plus every game
  // prepared (played or not), newest first.
  const preparationByKey = new Map(preparations.map((p) => [p.key, p]));
  const games: StintGameRow[] = [
    ...matchRows,
    ...preparations.filter((p) => !matchRows.some((m) => m.key === p.key)),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((row) => {
      const preparation = preparationByKey.get(row.key);
      const analyses = analysesByKey.get(row.key) ?? 0;
      const videos = videosByKey.get(row.key) ?? 0;
      return {
        key: row.key,
        opponentName: row.opponentName,
        opponentLogo: row.opponentLogo,
        meta: matchMeta(row.isHome, row.date, row.competition),
        score: row.score,
        preparation: preparation
          ? {
              finished: preparation.finished,
              content:
                analyses + videos === 0
                  ? t("archivePreparationEmpty")
                  : [
                      analyses > 0 ? t("archiveAnalysesCount", { count: analyses }) : null,
                      videos > 0 ? t("archiveVideosCount", { count: videos }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
            }
          : null,
      };
    });

  function renderPlayerCard(p: (typeof squad)[number]) {
    const availability = availabilityByPlayerId.get(p.player_id);
    const status = (availability?.status as PlayerStatus) ?? "available";
    const flagged = availability?.excluded || status !== "available";
    const profile = playerProfiles[p.player_id];
    return (
      <div
        key={p.player_id}
        className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-2.5 py-2 shadow-sm"
      >
        <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-muted">
          {p.number ?? "–"}
        </span>
        <PlayerAvatar photo={playerProfiles[p.player_id]?.photoUrl ?? p.photo} size="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{p.name}</div>
          {(profile?.primaryPosition || profile?.preferredFoot) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <PositionChips profile={profile} t={t} />
              <FootIndicator foot={profile?.preferredFoot} t={t} />
            </div>
          )}
          {flagged && (
            <div className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
              <span className={`text-[11px] ${STATUS_TEXT[status]}`}>
                {availability?.excluded ? t("excludedStatusLabel") : t(statusLabelKey(status))}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <BackLink href="/archive" label={t("archiveTitle")} />
        {isCoach && (
          <DeleteStintButton
            stintId={stint.id}
            clubName={team?.name ?? ""}
            period={period}
            preparations={preparations.length}
            variant="button"
          />
        )}
      </div>

      {team && (
        <div className="mt-4">
          <ClubHeaderAccent
            logoUrl={team.logo}
            eyebrow={t("archiveTitle")}
            stats={[
              { label: t("statPlayed"), value: matchRows.length },
              { label: t("statRecord"), value: `${record.W}-${record.D}-${record.L}` },
              { label: t("statGoals"), value: `${goalsFor}:${goalsAgainst}` },
              { label: t("archivePreparationsTitle"), value: preparations.length },
            ]}
          >
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{team.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {period} · {t("archiveStintDays", { count: days })}
            </p>
          </ClubHeaderAccent>
        </div>
      )}

      <section className="mt-8">
        <SectionHeading icon="list" title={t("archiveGamesTitle")} count={games.length} />
        {games.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
            {t("archiveNoGamesFound")}
          </p>
        ) : (
          <StintGames stintId={stint.id} rows={games} />
        )}
      </section>

      <section className="mt-10">
        <SectionHeading icon="file" title={t("archiveDossierTitle")} count={dossierFiles.length} />
        <ArchivedDossier
          files={dossierFiles}
          photos={Object.fromEntries(squad.map((p) => [p.player_id, p.photo]))}
        />
      </section>

      <section className="mt-10">
        <SectionHeading icon="users" title={t("archiveSquadTitle")} count={squad.length} />
        {squad.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
            {t("archiveNoSquadFound")}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {squadGroups.map((g) => (
              <div key={g.group}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {translatePosition(g.group, t)} · {g.players.length}
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {g.players.map(renderPlayerCard)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
