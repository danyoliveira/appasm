import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getSquad,
  getTeamInfo,
  getPlayerProfile,
  getPlayersStatistics,
  getPlayerSeasonStatsById,
  getInjuries,
  getSidelined,
  getPlayerTransfers,
  getTrophies,
  getTeamSeasonFixtures,
} from "@/lib/api-football/cache";
import {
  getCurrentCompetitions,
  resolveSelectedCompetition,
  COMPETITION_FILTER_COOKIE,
} from "@/lib/api-football/teamStats";
import { getFixtureAppearances } from "@/lib/api-football/verifyParticipation";
import { cookies } from "next/headers";
import type { Fixture, TeamTransfer, PlayerSeasonStats } from "@/lib/api-football/client";
import { getVideoEmbedUrl } from "@/lib/videoEmbed";
import PreparationVideoList, {
  type PreparationVideoRow,
} from "../../../preparations/PreparationVideoList";
import BackLink from "../../../BackLink";

interface PlayerMatch {
  fixture: Fixture;
  minutes: number;
  rating: string | null;
  goals: number;
  assists: number;
  saves: number;
  conceded: number;
  yellow: number;
  red: number;
  started: boolean;
}
import type { PlayerStatus } from "../../../actions";
import { translatePosition, translateInjuryType } from "../../playerShared";
import { matchResult, FixtureTeamsRow } from "../../fixtureHelpers";
import { HeaderStatusChip, PendingInjuryBanner } from "./PlayerHeaderStatus";
import PlayerNotesList from "./PlayerNotesList";
import MatchesScrollList from "./MatchesScrollList";

function StatRow({
  label,
  value,
  verified,
}: {
  label: string;
  value: string | number;
  verified?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted">
        {label}
        {verified && <span className="ml-1 text-green-600">✓</span>}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="mt-1 divide-y divide-border">{children}</div>
    </div>
  );
}

// For a player not on our squad, the by-id fetch can return one entry per
// competition/team they featured for this season — the one with the most
// appearances stands in for "their club this season".
function bestSeasonEntry(stats: PlayerSeasonStats[]): PlayerSeasonStats["statistics"][number] | null {
  return (stats[0]?.statistics ?? []).reduce<PlayerSeasonStats["statistics"][number] | null>(
    (best, s) => ((s.games.appearences ?? 0) > (best?.games.appearences ?? -1) ? s : best),
    null,
  );
}

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; playerId: string }>;
}) {
  const { locale, playerId: playerIdParam } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const playerId = Number(playerIdParam);
  let selectedCompetitionId: number | null = null;

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
  if (!teamId) return null;

  let squadPlayer = null;
  let bio = null;
  let ourTeam: { id: number; name: string; logo: string } | null = null;
  let opponentStats: Awaited<ReturnType<typeof getPlayerSeasonStatsById>> = [];
  let seasonStats: Awaited<ReturnType<typeof getPlayersStatistics>>[number]["statistics"] = [];
  let sidelined: Awaited<ReturnType<typeof getSidelined>> = [];
  let transfers: Awaited<ReturnType<typeof getPlayerTransfers>> = [];
  let trophies: Awaited<ReturnType<typeof getTrophies>> = [];
  const playerMatches: PlayerMatch[] = [];
  let pendingInjuryReason: string | null = null;
  let error = false;
  let competitions: Awaited<ReturnType<typeof getCurrentCompetitions>>["allCompetitions"] = [];
  let friendlyCompetitionIds = new Set<number>();

  try {
    const [squad, teamInfo, profiles, current] = await Promise.all([
      getSquad(teamId),
      getTeamInfo(teamId),
      getPlayerProfile(playerId),
      getCurrentCompetitions(teamId),
    ]);
    squadPlayer = squad[0]?.players.find((p) => p.id === playerId) ?? null;
    ourTeam = teamInfo[0]?.team ?? null;
    bio = profiles[0]?.player ?? null;
    competitions = current.allCompetitions;
    friendlyCompetitionIds = new Set(current.friendlyCompetitions.map((c) => c.league.id));
    const defaultSeason = current.defaultSeason;

    const store = await cookies();
    selectedCompetitionId = resolveSelectedCompetition(
      store.get(COMPETITION_FILTER_COOKIE)?.value,
      competitions,
    );

    // Not our player — no team-scoped bulk fetch has them, so look them up
    // directly. Needed before the fixtures block below: their own matches
    // live under their own club's season fixtures, not ours.
    if (!squadPlayer && defaultSeason) {
      opponentStats = await getPlayerSeasonStatsById(playerId, defaultSeason).catch(() => []);
    }
    const opponentEntry = bestSeasonEntry(opponentStats);
    const matchTeamId = squadPlayer ? teamId : (opponentEntry?.team.id ?? null);

    if (defaultSeason && matchTeamId) {
      // Every finished fixture of the season, not just the last few — one
      // cached, long-TTL request per past fixture (shared across every
      // player's page, so only the first-ever view per fixture pays for it).
      const seasonFixtures = await getTeamSeasonFixtures(matchTeamId, defaultSeason).catch(() => []);
      const playedFixtures = seasonFixtures.filter(
        (fx) => fx.goals.home != null && fx.goals.away != null,
      );

      const appearancesPerFixture = await Promise.all(
        playedFixtures.map((fx) => getFixtureAppearances(fx.fixture.id)),
      );
      playedFixtures.forEach((fx, i) => {
        const appearance = appearancesPerFixture[i].get(playerId);
        if (appearance) {
          playerMatches.push({ fixture: fx, ...appearance });
        }
      });
      playerMatches.sort(
        (a, b) => new Date(b.fixture.fixture.date).getTime() - new Date(a.fixture.fixture.date).getTime(),
      );
    }

    const [sidelinedResult, transfersResult, trophiesResult, playersStats, injuries] = await Promise.all([
      getSidelined(playerId).catch(() => []),
      getPlayerTransfers(playerId).catch(() => []),
      getTrophies(playerId).catch(() => []),
      defaultSeason ? getPlayersStatistics(teamId, defaultSeason).catch(() => []) : [],
      defaultSeason ? getInjuries(teamId, defaultSeason).catch(() => []) : [],
    ]);
    sidelined = sidelinedResult;
    transfers = transfersResult;
    trophies = trophiesResult;
    // Our player: the team-scoped bulk fetch has them. Someone else's
    // player: fall back to the by-id fetch above — same shape, just sourced
    // differently, so the stats card below doesn't need to know which case.
    seasonStats =
      playersStats.find((p) => p.player.id === playerId)?.statistics ?? opponentStats[0]?.statistics ?? [];
    pendingInjuryReason = injuries.find((i) => i.player.id === playerId)?.player.reason ?? null;
  } catch {
    error = true;
  }

  const { data: availabilityRow } = await supabase
    .from("player_availability")
    .select("status, last_seen_injury_key")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .maybeSingle();

  const status: PlayerStatus = (availabilityRow?.status as PlayerStatus) ?? "available";
  const pendingInjury =
    pendingInjuryReason && pendingInjuryReason !== availabilityRow?.last_seen_injury_key
      ? { key: pendingInjuryReason, reason: pendingInjuryReason }
      : null;

  let notes: import("./PlayerNotesList").PlayerNote[] = [];
  if (isCoach) {
    const { data: notesData } = await supabase
      .from("player_notes")
      .select("id, content, created_at, updated_at")
      .eq("team_id", teamId)
      .eq("player_id", playerId)
      .order("created_at", { ascending: true });
    notes = notesData ?? [];
  }

  const { data: videoData } = await supabase
    .from("preparation_videos")
    .select("id, url, notes, category, tactical_snapshot_id, preparation_tactics(notes)")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  const playerVideoRows: PreparationVideoRow[] = (videoData ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    notes: row.notes,
    embedUrl: getVideoEmbedUrl(row.url),
    category: row.category,
    player: null,
    tacticalSnapshotId: row.tactical_snapshot_id,
    snapshotLabel: row.tactical_snapshot_id
      ? (row.preparation_tactics?.[0]?.notes ?? t("videoSnapshotGeneric"))
      : null,
  }));

  const relevantSeasonStats = selectedCompetitionId
    ? seasonStats.filter((s) => s.league.id === selectedCompetitionId)
    : seasonStats.filter((s) => !friendlyCompetitionIds.has(s.league.id));

  const displayedMatches = selectedCompetitionId
    ? playerMatches.filter((pm) => pm.fixture.league.id === selectedCompetitionId)
    : playerMatches.filter((pm) => !friendlyCompetitionIds.has(pm.fixture.league.id));

  const totals = relevantSeasonStats.reduce(
    (acc, s) => ({
      appearances: acc.appearances + (s.games.appearences ?? 0),
      lineups: acc.lineups + (s.games.lineups ?? 0),
      minutes: acc.minutes + (s.games.minutes ?? 0),
      goals: acc.goals + (s.goals.total ?? 0),
      assists: acc.assists + (s.goals.assists ?? 0),
      saves: acc.saves + (s.goals.saves ?? 0),
      conceded: acc.conceded + (s.goals.conceded ?? 0),
      shotsTotal: acc.shotsTotal + (s.shots.total ?? 0),
      shotsOn: acc.shotsOn + (s.shots.on ?? 0),
      passesTotal: acc.passesTotal + (s.passes.total ?? 0),
      passesKey: acc.passesKey + (s.passes.key ?? 0),
      tackles: acc.tackles + (s.tackles.total ?? 0),
      interceptions: acc.interceptions + (s.tackles.interceptions ?? 0),
      duelsTotal: acc.duelsTotal + (s.duels.total ?? 0),
      duelsWon: acc.duelsWon + (s.duels.won ?? 0),
      dribbleAttempts: acc.dribbleAttempts + (s.dribbles.attempts ?? 0),
      dribbleSuccess: acc.dribbleSuccess + (s.dribbles.success ?? 0),
      foulsDrawn: acc.foulsDrawn + (s.fouls.drawn ?? 0),
      foulsCommitted: acc.foulsCommitted + (s.fouls.committed ?? 0),
      yellow: acc.yellow + (s.cards.yellow ?? 0),
      red: acc.red + (s.cards.red ?? 0) + (s.cards.yellowred ?? 0),
    }),
    {
      appearances: 0,
      lineups: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      conceded: 0,
      shotsTotal: 0,
      shotsOn: 0,
      passesTotal: 0,
      passesKey: 0,
      tackles: 0,
      interceptions: 0,
      duelsTotal: 0,
      duelsWon: 0,
      dribbleAttempts: 0,
      dribbleSuccess: 0,
      foulsDrawn: 0,
      foulsCommitted: 0,
      yellow: 0,
      red: 0,
    },
  );

  // The bulk /players endpoint is sometimes stale or incomplete per
  // competition (see fetchAllPlayersStatistics — minutes/appearances can be
  // wrong even after the by-id refetch). We already check every team
  // fixture individually to build "Jogos que fez", so that per-match data
  // is more trustworthy — use it to override the fields it actually
  // covers instead of trusting the aggregate endpoint for them.
  const hasVerifiedTotals = displayedMatches.length > 0;
  if (hasVerifiedTotals) {
    totals.appearances = displayedMatches.length;
    totals.lineups = displayedMatches.filter((pm) => pm.started).length;
    totals.minutes = displayedMatches.reduce((sum, pm) => sum + pm.minutes, 0);
    totals.goals = displayedMatches.reduce((sum, pm) => sum + pm.goals, 0);
    totals.assists = displayedMatches.reduce((sum, pm) => sum + pm.assists, 0);
    totals.saves = displayedMatches.reduce((sum, pm) => sum + pm.saves, 0);
    totals.conceded = displayedMatches.reduce((sum, pm) => sum + pm.conceded, 0);
    totals.yellow = displayedMatches.reduce((sum, pm) => sum + pm.yellow, 0);
    totals.red = displayedMatches.reduce((sum, pm) => sum + pm.red, 0);
  }

  const ratedMatches = displayedMatches.filter((pm) => pm.rating != null);
  const ratingIsVerified = ratedMatches.length > 0;
  const rating = ratingIsVerified
    ? (
        ratedMatches.reduce((sum, pm) => sum + Number(pm.rating), 0) / ratedMatches.length
      ).toFixed(1)
    : relevantSeasonStats.find((s) => s.games.rating)?.games.rating;
  const isGoalkeeper = (squadPlayer?.position ?? seasonStats[0]?.games.position) === "Goalkeeper";
  const displayName = squadPlayer?.name ?? bio?.name ?? "";

  // "N/A" and "Return from loan" entries are loan returns, not a real
  // move — noise we don't need to show.
  const isLoanReturn = (type: string | null) => {
    if (!type) return false;
    const normalized = type.trim().toLowerCase();
    return normalized === "n/a" || /(return from loan|end of loan|loan return)/.test(normalized);
  };

  // The API sometimes logs the same move twice (e.g. announced, then
  // confirmed) — drop repeats of the same club pair within 3 months.
  const withoutDuplicateMoves = (transfers[0]?.transfers ?? [])
    .filter((tr) => !isLoanReturn(tr.type))
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .reduce<TeamTransfer["transfers"]>((kept, tr) => {
      const isNearDuplicate = kept.some((k) => {
        if (k.teams.out.id !== tr.teams.out.id || k.teams.in.id !== tr.teams.in.id) return false;
        const diffDays =
          Math.abs(new Date(tr.date).getTime() - new Date(k.date).getTime()) / (24 * 60 * 60 * 1000);
        return diffDays < 90;
      });
      if (!isNearDuplicate) kept.push(tr);
      return kept;
    }, []);

  const realTransfers = withoutDuplicateMoves
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const opponentEntry = bestSeasonEntry(opponentStats);

  const position = squadPlayer?.position ?? opponentEntry?.games.position ?? null;
  const currentClub = squadPlayer
    ? ourTeam
    : opponentEntry
      ? { id: opponentEntry.team.id, name: opponentEntry.team.name, logo: opponentEntry.team.logo }
      : realTransfers[0]
        ? { id: realTransfers[0].teams.in.id, name: realTransfers[0].teams.in.name, logo: realTransfers[0].teams.in.logo }
        : null;

  const realSidelined = sidelined.filter(
    (s) => s.type !== "Yellow Cards" && s.type !== "Red Card",
  );

  const trophyGroups = new Map<string, { league: string; country: string; years: string[] }>();
  trophies
    .filter((tr) => tr.place === "Winner" && tr.season?.trim())
    .forEach((tr) => {
      const key = `${tr.league.trim().toLowerCase()}|${tr.country.trim().toLowerCase()}`;
      const year = tr.season.trim();
      const existing = trophyGroups.get(key);
      if (existing) {
        if (!existing.years.includes(year)) existing.years.push(year);
      } else {
        trophyGroups.set(key, { league: tr.league.trim(), country: tr.country.trim(), years: [year] });
      }
    });
  const groupedTrophies = Array.from(trophyGroups.values()).map((group) => ({
    ...group,
    years: group.years.sort((a, b) => b.localeCompare(a)),
  }));

  return (
    <div>
      <BackLink href="/dashboard/club" label={t("clubSectionTitle")} />

      {error && (
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          Não foi possível carregar os dados deste jogador agora. Tenta recarregar a
          página daqui a pouco.
        </p>
      )}

      {!error && (
        <>
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-surface to-surface p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-5">
              {(squadPlayer?.photo || bio?.photo) && (
                <div className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={squadPlayer?.photo || bio?.photo}
                    alt=""
                    className="h-24 w-24 rounded-full object-cover ring-4 ring-background shadow-md"
                  />
                  {squadPlayer?.number != null && (
                    <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground ring-4 ring-surface">
                      {squadPlayer.number}
                    </span>
                  )}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {displayName}
                </h1>
                <div className="mt-2 flex flex-wrap gap-2">
                  {currentClub && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={currentClub.logo} alt="" className="h-3.5 w-3.5 object-contain" />
                      {currentClub.name}
                    </span>
                  )}
                  {position && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                      🎽 {translatePosition(position, t)}
                    </span>
                  )}
                  {bio?.age != null && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                      🎂 {bio.age} {t("yearsOld")}
                    </span>
                  )}
                  {bio?.nationality && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                      🌍 {bio.nationality}
                    </span>
                  )}
                  {bio?.height && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                      📏 {bio.height}
                    </span>
                  )}
                  {bio?.weight && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                      ⚖️ {bio.weight}
                    </span>
                  )}
                  {squadPlayer && (
                    <HeaderStatusChip
                      teamId={teamId}
                      playerId={playerId}
                      playerName={displayName}
                      status={status}
                      isCoach={isCoach}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {isCoach && pendingInjury && (
            <PendingInjuryBanner
              teamId={teamId}
              playerId={playerId}
              playerName={displayName}
              pendingInjury={pendingInjury}
            />
          )}

          {isCoach && (
            <div className="mt-8">
              <PlayerNotesList teamId={teamId} playerId={playerId} notes={notes} />
            </div>
          )}

          {playerVideoRows.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-muted">{t("playerVideosTitle")}</h3>
              <PreparationVideoList rows={playerVideoRows} isCoach={isCoach} />
            </div>
          )}

          {(seasonStats.length > 0 || playerMatches.length > 0) && (
            <section className="mt-10 grid items-start gap-6 lg:grid-cols-2">
              {(seasonStats.length > 0 || hasVerifiedTotals) && (
                <div
                  id="player-season-stats-card"
                  className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
                >
                  <h2 className="text-lg font-semibold">📊 {t("seasonStatsTitle")}</h2>

                  <StatGroup title={t("statGroupGeneral")}>
                    <StatRow
                      label={t("playerStatAppearances")}
                      value={totals.appearances}
                      verified={hasVerifiedTotals}
                    />
                    <StatRow label={t("statLineups")} value={totals.lineups} verified={hasVerifiedTotals} />
                    <StatRow
                      label={t("playerStatMinutes")}
                      value={totals.minutes}
                      verified={hasVerifiedTotals}
                    />
                    <StatRow
                      label={t("statRating")}
                      value={rating ? Number(rating).toFixed(1) : "-"}
                      verified={ratingIsVerified}
                    />
                  </StatGroup>

                  {isGoalkeeper ? (
                    <StatGroup title={t("statGroupGoalkeeping")}>
                      <StatRow
                        label={t("playerStatSaves")}
                        value={totals.saves}
                        verified={hasVerifiedTotals}
                      />
                      <StatRow
                        label={t("playerStatConceded")}
                        value={totals.conceded}
                        verified={hasVerifiedTotals}
                      />
                    </StatGroup>
                  ) : (
                    <>
                      <StatGroup title={t("statGroupAttack")}>
                        <StatRow
                          label={t("playerStatGoals")}
                          value={totals.goals}
                          verified={hasVerifiedTotals}
                        />
                        <StatRow
                          label={t("playerStatAssists")}
                          value={totals.assists}
                          verified={hasVerifiedTotals}
                        />
                        <StatRow label={t("statShots")} value={totals.shotsTotal} />
                        <StatRow label={t("statShotsOn")} value={totals.shotsOn} />
                        <StatRow
                          label={t("statDribbles")}
                          value={`${totals.dribbleSuccess}/${totals.dribbleAttempts}`}
                        />
                      </StatGroup>
                      <StatGroup title={t("statGroupDefense")}>
                        <StatRow label={t("statTackles")} value={totals.tackles} />
                        <StatRow label={t("statInterceptions")} value={totals.interceptions} />
                        <StatRow
                          label={t("statDuelsWon")}
                          value={`${totals.duelsWon}/${totals.duelsTotal}`}
                        />
                      </StatGroup>
                    </>
                  )}

                  <StatGroup title={t("statGroupPasses")}>
                    <StatRow label={t("statPasses")} value={totals.passesTotal} />
                    <StatRow label={t("statKeyPasses")} value={totals.passesKey} />
                  </StatGroup>

                  <StatGroup title={t("statGroupDiscipline")}>
                    <StatRow label={t("statFoulsDrawn")} value={totals.foulsDrawn} />
                    <StatRow label={t("statFoulsCommitted")} value={totals.foulsCommitted} />
                    <StatRow
                      label={t("statYellowCards")}
                      value={totals.yellow}
                      verified={hasVerifiedTotals}
                    />
                    <StatRow label={t("statRedCards")} value={totals.red} verified={hasVerifiedTotals} />
                  </StatGroup>

                  <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
                    <span className="text-green-600">✓</span> {t("verifiedStatsLegend")}
                  </p>
                </div>
              )}

              <div className="js-matches-card flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h2 className="text-lg font-semibold">⚽ {t("playerMatchesTitle")}</h2>
                {displayedMatches.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">{t("noRecentResults")}</p>
                ) : (
                  <MatchesScrollList statsCardId="player-season-stats-card">
                    {displayedMatches.map((pm) => {
                      const fx = pm.fixture;
                      const result = matchResult(fx, teamId);
                      return (
                        <div
                          key={fx.fixture.id}
                          className="rounded-lg border border-border bg-background p-3 text-sm"
                        >
                          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                            <Link
                              href={`/dashboard/club/fixture/${fx.fixture.id}`}
                              className="hover:text-accent"
                            >
                              {new Date(fx.fixture.date).toLocaleDateString(locale)}
                            </Link>
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
                              <Link
                                href={`/dashboard/club/fixture/${fx.fixture.id}`}
                                className="font-semibold hover:text-accent"
                              >
                                {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                              </Link>
                            }
                          />
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <span>{pm.minutes}&apos;</span>
                            {pm.rating && <span>⭐ {Number(pm.rating).toFixed(1)}</span>}
                            {pm.goals > 0 && <span>⚽ {pm.goals}</span>}
                            {pm.assists > 0 && <span>🅰️ {pm.assists}</span>}
                            {pm.yellow > 0 && <span>🟨 {pm.yellow}</span>}
                            {pm.red > 0 && <span>🟥 {pm.red}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </MatchesScrollList>
                )}
              </div>
            </section>
          )}

          <section className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-lg font-semibold">ℹ️ {t("playerInfoTitle")}</h2>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-muted">
                  🩹 {t("injuryHistoryTitle")}
                </h3>
                {realSidelined.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t("noInjuryHistory")}</p>
                ) : (
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {realSidelined.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-border bg-background p-3 text-sm"
                      >
                        <div className="font-medium">{translateInjuryType(s.type, locale)}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          {new Date(s.start).toLocaleDateString(locale)} –{" "}
                          {new Date(s.end).toLocaleDateString(locale)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-muted">
                  🔄 {t("careerTransfersTitle")}
                </h3>
                {realTransfers.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t("noTransfersFound")}</p>
                ) : (
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {realTransfers.map((transfer, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-background p-3 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            <Link
                              href={`/dashboard/club/${transfer.teams.out.id}`}
                              className="flex min-w-0 items-center gap-1.5 hover:text-accent"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={transfer.teams.out.logo}
                                alt=""
                                className="h-4 w-4 shrink-0 object-contain"
                              />
                              <span className="truncate">{transfer.teams.out.name}</span>
                            </Link>
                            <span className="shrink-0 text-muted">→</span>
                            <Link
                              href={`/dashboard/club/${transfer.teams.in.id}`}
                              className="flex min-w-0 items-center gap-1.5 hover:text-accent"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={transfer.teams.in.logo}
                                alt=""
                                className="h-4 w-4 shrink-0 object-contain"
                              />
                              <span className="truncate">{transfer.teams.in.name}</span>
                            </Link>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-muted">
                            <span>{transfer.type ?? "—"}</span>
                            <span>{new Date(transfer.date).toLocaleDateString(locale)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-6">
              <h3 className="text-sm font-semibold text-muted">🏆 {t("trophiesTitle")}</h3>
              {groupedTrophies.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("noTrophiesFound")}</p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedTrophies.map((trophy, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background p-3 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{trophy.league}</div>
                        <div className="truncate text-xs text-muted">{trophy.country}</div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {trophy.years.map((year) => (
                          <span
                            key={year}
                            className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted"
                          >
                            {year}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
