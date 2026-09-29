import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStintId } from "@/lib/coachingStints";
import {
  MANUAL_PLAYER_COLUMNS,
  ageFromBirthDate,
  withManualPlayers,
  type ManualSquadPlayerRow,
} from "@/lib/manualPlayers";
import ManualPlayerMergePanel from "./ManualPlayerMergePanel";
import TeamDossier from "../../TeamDossier";
import { PLAYER_DOSSIER_CATEGORIES } from "../../dossierShared";
import { loadDossierFiles } from "@/lib/dossier";
import { loadLiveGames, type LiveGameStats } from "@/lib/liveMatchHistory";
import { aggregateLivePlayerTotals } from "@/lib/livePlayerStats";
import { loadTeamStatConfig } from "@/lib/liveStatConfigServer";
import { nameSimilarity } from "@/lib/playerMatching";
import GkLiveExplorer from "./GkLiveExplorer";
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
import TeamCrest from "@/components/TeamCrest";

interface PlayerMatch {
  fixture: Fixture;
  // The team the player played for in it — ours, or their own club when
  // they aren't ours (opponent/result are relative to this team).
  teamId: number;
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
import type { PlayerStatus, PlayerManualStatsInput } from "../../../actions";
import { translatePosition, translateInjuryType, shortenPlayerName } from "../../playerShared";
import { matchResult } from "../../fixtureHelpers";
import { HeaderStatusChip, PendingInjuryBanner, InjuryReturnPrompt } from "./PlayerHeaderStatus";
import PlayerHero from "./PlayerHero";
import NotesList from "../../../notes/NotesList";
import {
  CLUB_NOTE_COLUMNS,
  PLAYER_NOTE_COLUMNS,
  clubNoteFromRow,
  playerNoteFromRow,
  type NoteItem,
} from "../../../notes/noteShared";
import PlayerBodyMetrics, { type WeightEntry } from "./PlayerBodyMetrics";
import PlayerStatsComparison from "./PlayerStatsComparison";
import PlayerDetailTabs from "./PlayerDetailTabs";
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
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="truncate text-muted">{label}</span>
      <span className="flex items-center gap-1 font-semibold tabular-nums">
        {value}
        {verified && <span className="text-[10px] text-green-600">✓</span>}
      </span>
    </div>
  );
}

// "x of y" stats (dribbles, duels): the count plus a thin success bar.
function RatioRow({ label, success, total }: { label: string; success: number; total: number }) {
  const pct = total > 0 ? Math.round((success / total) * 100) : null;
  return (
    <div className="py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-muted">{label}</span>
        <span className="font-semibold tabular-nums">
          {success}/{total}
          {pct != null && <span className="ml-1.5 text-[11px] font-normal text-muted">{pct}%</span>}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background">
      <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="divide-y divide-border px-4 pb-1.5">{children}</div>
    </div>
  );
}

function HeadlineStat({
  label,
  value,
  verified,
}: {
  label: string;
  value: string | number;
  verified?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-3.5 text-center">
      <div className="flex items-center justify-center gap-1 text-2xl font-bold tabular-nums">
        {value}
        {verified && <span className="text-xs text-green-600">✓</span>}
      </div>
      <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted">{label}</div>
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

  // Hand-added players: negative ids never exist in API-Football, so skip
  // every by-id API call for them; a merged one now lives under its API id.
  const isManualId = playerId < 0;
  const { data: manualRowData } = await supabase
    .from("manual_squad_players")
    .select(MANUAL_PLAYER_COLUMNS)
    .eq("id", playerId)
    .maybeSingle();
  const manualRow = manualRowData as ManualSquadPlayerRow | null;
  if (manualRow?.merged_into_player_id) {
    redirect({ href: `/club/player/${manualRow.merged_into_player_id}`, locale });
  }
  const apiSquadPlayers: { id: number; name: string; photo: string }[] = [];

  try {
    const [squad, teamInfo, profiles, current] = await Promise.all([
      getSquad(teamId),
      getTeamInfo(teamId),
      isManualId ? Promise.resolve([]) : getPlayerProfile(playerId),
      getCurrentCompetitions(teamId),
    ]);
    apiSquadPlayers.push(...(squad[0]?.players ?? []));
    squadPlayer =
      withManualPlayers(squad, manualRow && manualRow.team_id === teamId ? [manualRow] : [])[0]?.players.find(
        (p) => p.id === playerId,
      ) ?? null;
    ourTeam = teamInfo[0]?.team ?? null;
    bio =
      profiles[0]?.player ??
      (manualRow
        ? {
            id: manualRow.id,
            name: manualRow.name,
            age: ageFromBirthDate(manualRow.birth_date),
            nationality: manualRow.nationality,
            photo: manualRow.photo_url ?? "",
            birth: { date: manualRow.birth_date, place: null, country: null },
            height: null,
            weight: null,
          }
        : null);
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
          playerMatches.push({ fixture: fx, teamId: matchTeamId, ...appearance });
        }
      });
      playerMatches.sort(
        (a, b) => new Date(b.fixture.fixture.date).getTime() - new Date(a.fixture.fixture.date).getTime(),
      );
    }

    const [sidelinedResult, transfersResult, trophiesResult, playersStats, injuries] = await Promise.all([
      isManualId ? [] : getSidelined(playerId).catch(() => []),
      isManualId ? [] : getPlayerTransfers(playerId).catch(() => []),
      isManualId ? [] : getTrophies(playerId).catch(() => []),
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

  const currentStintId = await getCurrentStintId(supabase, teamId);
  const { data: availabilityRow } = await supabase
    .from("player_availability")
    .select("status, last_seen_injury_key")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .eq("stint_id", currentStintId)
    .maybeSingle();

  const status: PlayerStatus = (availabilityRow?.status as PlayerStatus) ?? "available";

  interface PlayerInjuryRow {
    id: string;
    description: string;
    started_at: string;
    expected_return_at: string | null;
    actual_return_at: string | null;
  }

  // Height/weight/manual stats/injuries only make sense for our own
  // players — an opponent's page has no coach-entered data of ours to show.
  let heightCm: number | null = null;
  let weightEntries: WeightEntry[] = [];
  let injuryRows: PlayerInjuryRow[] = [];
  let manualStats: PlayerManualStatsInput = {
    appearances: null,
    minutes: null,
    goals: null,
    assists: null,
    saves: null,
    conceded: null,
    lineups: null,
    rating: null,
    shotsTotal: null,
    shotsOn: null,
    dribbleAttempts: null,
    dribbleSuccess: null,
    tackles: null,
    interceptions: null,
    duelsTotal: null,
    duelsWon: null,
    passesTotal: null,
    passesKey: null,
    foulsDrawn: null,
    foulsCommitted: null,
    yellowCards: null,
    redCards: null,
  };

  if (squadPlayer) {
    const [{ data: bodyMetricsRow }, { data: weightRows }, { data: manualStatsRow }, { data: injuryData }] =
      await Promise.all([
        supabase
          .from("player_body_metrics")
          .select("height_cm")
          .eq("team_id", teamId)
          .eq("player_id", playerId)
          .eq("stint_id", currentStintId)
          .maybeSingle(),
        supabase
          .from("player_weight_log")
          .select("id, weight_kg, recorded_at")
          .eq("team_id", teamId)
          .eq("player_id", playerId)
          .order("recorded_at", { ascending: false }),
        supabase
          .from("player_manual_stats")
          .select(
            "appearances, minutes, goals, assists, saves, conceded, lineups, rating, shots_total, shots_on, dribble_attempts, dribble_success, tackles, interceptions, duels_total, duels_won, passes_total, passes_key, fouls_drawn, fouls_committed, yellow_cards, red_cards",
          )
          .eq("team_id", teamId)
          .eq("player_id", playerId)
          .eq("stint_id", currentStintId)
          .maybeSingle(),
        supabase
          .from("player_injuries")
          .select("id, description, started_at, expected_return_at, actual_return_at")
          .eq("team_id", teamId)
          .eq("player_id", playerId)
          .eq("stint_id", currentStintId)
          .order("started_at", { ascending: false }),
      ]);
    injuryRows = injuryData ?? [];

    heightCm = bodyMetricsRow?.height_cm ?? null;
    weightEntries = (weightRows ?? []).map((row) => ({
      id: row.id,
      weightKg: Number(row.weight_kg),
      recordedAt: row.recorded_at,
    }));
    if (manualStatsRow) {
      manualStats = {
        appearances: manualStatsRow.appearances,
        minutes: manualStatsRow.minutes,
        goals: manualStatsRow.goals,
        assists: manualStatsRow.assists,
        saves: manualStatsRow.saves,
        conceded: manualStatsRow.conceded,
        lineups: manualStatsRow.lineups,
        rating: manualStatsRow.rating,
        shotsTotal: manualStatsRow.shots_total,
        shotsOn: manualStatsRow.shots_on,
        dribbleAttempts: manualStatsRow.dribble_attempts,
        dribbleSuccess: manualStatsRow.dribble_success,
        tackles: manualStatsRow.tackles,
        interceptions: manualStatsRow.interceptions,
        duelsTotal: manualStatsRow.duels_total,
        duelsWon: manualStatsRow.duels_won,
        passesTotal: manualStatsRow.passes_total,
        passesKey: manualStatsRow.passes_key,
        foulsDrawn: manualStatsRow.fouls_drawn,
        foulsCommitted: manualStatsRow.fouls_committed,
        yellowCards: manualStatsRow.yellow_cards,
        redCards: manualStatsRow.red_cards,
      };
    }
  }

  // Hand-entered height/weight win over the API's whenever they're filled
  // in — same "internal beats external" rule as the season stats — falling
  // back to the API's own reading (e.g. "181 cm") when nothing's been
  // entered yet, instead of showing nothing at all.
  function parseMetricNumber(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const match = raw.match(/[\d.]+/);
    return match ? Number(match[0]) : null;
  }
  const resolvedHeightCm = heightCm ?? parseMetricNumber(bio?.height);
  const apiWeightKg = parseMetricNumber(bio?.weight);
  const resolvedWeightKg = weightEntries[0]?.weightKg ?? apiWeightKg;

  const today = new Date().toISOString().slice(0, 10);
  const dueReturnInjury = injuryRows.find(
    (inj) => inj.actual_return_at == null && inj.expected_return_at != null && inj.expected_return_at <= today,
  );

  // Notes are about the player, not about the club — they follow the
  // player across every club the coach moves to, instead of being left
  // behind at whichever club they were written at.
  const dossierFiles =
    squadPlayer && currentStintId
      ? await loadDossierFiles(supabase, {
          teamId,
          stintId: currentStintId,
          categories: PLAYER_DOSSIER_CATEGORIES,
          playerId,
        })
      : [];

  let notes: NoteItem[] = [];
  // Club notes that @mention this player — shown read-only under their own.
  let mentionedInNotes: NoteItem[] = [];
  if (isCoach) {
    const [{ data: notesData }, { data: mentionData }] = await Promise.all([
      supabase.from("player_notes").select(PLAYER_NOTE_COLUMNS).eq("player_id", playerId),
      supabase
        .from("club_notes")
        .select(CLUB_NOTE_COLUMNS)
        .contains("mentioned_player_ids", [playerId]),
    ]);
    notes = (notesData ?? []).map(playerNoteFromRow);
    mentionedInNotes = (mentionData ?? []).map(clubNoteFromRow);
  }

  const { data: videoData } = await supabase
    .from("preparation_videos")
    .select("id, url, notes, category, submoment, team, created_at")
    .eq("team_id", teamId)
    .eq("player_id", playerId)
    .order("created_at", { ascending: false });

  const playerVideoRows: PreparationVideoRow[] = (videoData ?? []).map((row) => ({
    id: row.id,
    url: row.url,
    notes: row.notes,
    embedUrl: getVideoEmbedUrl(row.url),
    category: row.category,
    submoment: row.submoment,
    player: null,
    team: (row.team as "us" | "opponent") ?? "opponent",
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

  // Same field set as PlayerManualStatsInput, so the internal (hand-entered)
  // numbers can be compared row by row against these external (API) ones.
  // A hand-added player has no API record at all — "-" rather than zeros.
  const apiExternalValues: PlayerManualStatsInput = {
    appearances: totals.appearances,
    minutes: totals.minutes,
    goals: totals.goals,
    assists: totals.assists,
    saves: totals.saves,
    conceded: totals.conceded,
    lineups: totals.lineups,
    rating: rating ? Number(rating) : null,
    shotsTotal: totals.shotsTotal,
    shotsOn: totals.shotsOn,
    dribbleAttempts: totals.dribbleAttempts,
    dribbleSuccess: totals.dribbleSuccess,
    tackles: totals.tackles,
    interceptions: totals.interceptions,
    duelsTotal: totals.duelsTotal,
    duelsWon: totals.duelsWon,
    passesTotal: totals.passesTotal,
    passesKey: totals.passesKey,
    foulsDrawn: totals.foulsDrawn,
    foulsCommitted: totals.foulsCommitted,
    yellowCards: totals.yellow,
    redCards: totals.red,
  };
  const externalValues: PlayerManualStatsInput = isManualId
    ? (Object.fromEntries(
        Object.keys(apiExternalValues).map((key) => [key, null]),
      ) as unknown as PlayerManualStatsInput)
    : apiExternalValues;

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

  const generalInfoStats: ({ label: string; value: string | number } | null)[] = [
    position ? { label: t("squadColumnPosition"), value: translatePosition(position, t) } : null,
    bio?.age != null ? { label: t("statAge"), value: bio.age } : null,
    bio?.nationality ? { label: t("statNationality"), value: bio.nationality } : null,
    resolvedHeightCm != null ? { label: t("statHeight"), value: `${resolvedHeightCm} cm` } : null,
    resolvedWeightKg != null ? { label: t("statWeight"), value: `${resolvedWeightKg} kg` } : null,
  ];
  const filteredGeneralInfoStats = generalInfoStats.filter(
    (s): s is { label: string; value: string | number } => s != null,
  );

  const realSidelined = sidelined.filter(
    (s) => s.type !== "Yellow Cards" && s.type !== "Red Card",
  );

  // The team-scoped /injuries endpoint (pendingInjuryReason, above) can miss
  // a real injury when a player's squad listing doesn't match the club its
  // injury record is actually tracked under — a real API-Football data
  // quirk. /sidelined is scoped to the player directly, so an ongoing
  // period there (end: null) is checked too, as a second, more reliable
  // signal — but only when there isn't already an open internal record for
  // it (already being tracked, nothing to confirm again).
  const ongoingSidelined = realSidelined.find((s) => !s.end);
  const hasOpenInternalInjury = injuryRows.some((inj) => inj.actual_return_at == null);
  // Only for our own players — availability/injury tracking has no meaning
  // for an opponent we're just scouting.
  const sidelinedPendingReason =
    squadPlayer && ongoingSidelined && !hasOpenInternalInjury ? ongoingSidelined.type : null;

  const pendingInjury =
    pendingInjuryReason && pendingInjuryReason !== availabilityRow?.last_seen_injury_key
      ? { key: pendingInjuryReason, reason: translateInjuryType(pendingInjuryReason, locale) }
      : sidelinedPendingReason && sidelinedPendingReason !== availabilityRow?.last_seen_injury_key
        ? { key: sidelinedPendingReason, reason: translateInjuryType(sidelinedPendingReason, locale) }
        : null;

  interface InjuryHistoryItem {
    key: string;
    description: string;
    start: string;
    end: string | null;
    expectedReturnAt: string | null;
    source: "internal" | "api";
  }

  // For our own players, the internal log is the source of truth, but the
  // API's sidelined history still has value — periods it reports that
  // aren't already covered by an internal record (before this feature
  // existed, or simply not logged) get folded in too, marked as coming from
  // the API instead of silently dropped.
  const injuryHistory: InjuryHistoryItem[] = squadPlayer
    ? [
        ...injuryRows.map((inj) => ({
          key: `internal-${inj.id}`,
          description: inj.description,
          start: inj.started_at,
          end: inj.actual_return_at,
          expectedReturnAt: inj.expected_return_at,
          source: "internal" as const,
        })),
        ...realSidelined
          .filter(
            (s) =>
              !injuryRows.some(
                (inj) =>
                  inj.started_at <= (s.end ?? "9999-12-31") &&
                  (inj.actual_return_at ?? "9999-12-31") >= s.start,
              ),
          )
          .map((s) => ({
            key: `api-${s.start}-${s.end}-${s.type}`,
            description: translateInjuryType(s.type, locale),
            start: s.start,
            end: s.end,
            expectedReturnAt: null,
            source: "api" as const,
          })),
      ].sort((a, b) => b.start.localeCompare(a.start))
    : [];

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

  // Extracted so it can be shown either directly (opponent players — no
  // manual-stats tab makes sense for them) or inside PlayerStatsTabs
  // alongside PlayerManualStatsForm (our own squad).
  const externalStatsContent = (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HeadlineStat
          label={t("playerStatAppearances")}
          value={totals.appearances}
          verified={hasVerifiedTotals}
        />
        <HeadlineStat
          label={t("playerStatMinutes")}
          value={totals.minutes}
          verified={hasVerifiedTotals}
        />
        <HeadlineStat
          label={isGoalkeeper ? t("playerStatSaves") : t("playerStatGoals")}
          value={isGoalkeeper ? totals.saves : totals.goals}
          verified={hasVerifiedTotals}
        />
        <HeadlineStat
          label={isGoalkeeper ? t("playerStatConceded") : t("playerStatAssists")}
          value={isGoalkeeper ? totals.conceded : totals.assists}
          verified={hasVerifiedTotals}
        />
      </div>

      <div className="mt-4 space-y-3">
      <StatGroup title={t("statGroupGeneral")}>
        <StatRow label={t("statLineups")} value={totals.lineups} verified={hasVerifiedTotals} />
        <StatRow
          label={t("statRating")}
          value={rating ? Number(rating).toFixed(1) : "-"}
          verified={ratingIsVerified}
        />
      </StatGroup>

      {isGoalkeeper ? null : (
        <>
          <StatGroup title={t("statGroupAttack")}>
            <StatRow label={t("statShots")} value={totals.shotsTotal} />
            <StatRow label={t("statShotsOn")} value={totals.shotsOn} />
            <RatioRow label={t("statDribbles")} success={totals.dribbleSuccess} total={totals.dribbleAttempts} />
          </StatGroup>
          <StatGroup title={t("statGroupDefense")}>
            <StatRow label={t("statTackles")} value={totals.tackles} />
            <StatRow label={t("statInterceptions")} value={totals.interceptions} />
            <RatioRow label={t("statDuelsWon")} success={totals.duelsWon} total={totals.duelsTotal} />
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
        <StatRow label={t("statYellowCards")} value={totals.yellow} verified={hasVerifiedTotals} />
        <StatRow label={t("statRedCards")} value={totals.red} verified={hasVerifiedTotals} />
      </StatGroup>
      </div>

      <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
        <span className="text-green-600">✓</span> {t("verifiedStatsLegend")}
      </p>
    </>
  );

  // ASM Live Mode games of the current stint — they fill the internal stats
  // the coach hasn't typed in, and feed the goalkeeper's Live Mode tab.
  let allLiveGames: LiveGameStats[] = [];
  if (squadPlayer) {
    const { data: stintRow } = currentStintId
      ? await supabase.from("coaching_stints").select("started_at").eq("id", currentStintId).maybeSingle()
      : { data: null };
    allLiveGames = await loadLiveGames(supabase, teamId, stintRow?.started_at ?? null);
  }
  const liveTotals = aggregateLivePlayerTotals(allLiveGames).get(playerId);
  const liveValues = liveTotals
    ? {
        appearances: liveTotals.appearances,
        lineups: liveTotals.lineups,
        minutes: liveTotals.minutes,
        goals: liveTotals.goals,
        assists: liveTotals.assists,
        yellowCards: liveTotals.yellowCards,
        redCards: liveTotals.redCards,
        ...(isGoalkeeper ? { conceded: liveTotals.conceded } : {}),
      }
    : undefined;

  const overviewContent = (
    <div className="space-y-8">
      {/* Our own players always get the stats card, even with no API data
          at all (hand-added players, youth call-ups) — it's where the
          coach enters the internal numbers. */}
      {squadPlayer || seasonStats.length > 0 || playerMatches.length > 0 ? (
        <section className="grid items-start gap-6 lg:grid-cols-2">
          {(squadPlayer || seasonStats.length > 0 || hasVerifiedTotals) && (
            <div
              id="player-season-stats-card"
              className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              {squadPlayer ? (
                <PlayerStatsComparison
                  teamId={teamId}
                  playerId={playerId}
                  isCoach={isCoach}
                  isGoalkeeper={isGoalkeeper}
                  externalValues={externalValues}
                  initialInternalValues={manualStats}
                  liveValues={liveValues}
                  title={t("seasonStatsTitle")}
                />
              ) : (
                <>
                  <h2 className="text-lg font-semibold">{t("seasonStatsTitle")}</h2>
                  <div className="mt-4">{externalStatsContent}</div>
                </>
              )}
            </div>
          )}

        <div className="js-matches-card flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {t("playerMatchesTitle")}
            {displayedMatches.length > 0 && (
              <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted ring-1 ring-border">
                {displayedMatches.length}
              </span>
            )}
          </h2>
          {displayedMatches.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noRecentResults")}</p>
          ) : (
            <MatchesScrollList statsCardId="player-season-stats-card">
              {displayedMatches.map((pm) => {
                const fx = pm.fixture;
                const result = matchResult(fx, pm.teamId);
                const weAreHome = fx.teams.home.id === pm.teamId;
                const opp = weAreHome ? fx.teams.away : fx.teams.home;
                const ours = weAreHome ? fx.goals.home : fx.goals.away;
                const theirs = weAreHome ? fx.goals.away : fx.goals.home;
                const date = new Date(fx.fixture.date);
                const rating = pm.rating ? Number(pm.rating) : null;
                const ratingTone =
                  rating == null
                    ? ""
                    : rating >= 7.5
                      ? "bg-green-600/10 text-green-700 dark:text-green-400"
                      : rating >= 6.5
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : "bg-red-500/10 text-red-600 dark:text-red-400";
                return (
                  <Link
                    key={fx.fixture.id}
                    href={`/club/fixture/${fx.fixture.id}`}
                    className="group relative flex items-center gap-3 rounded-xl border border-border bg-background py-2.5 pl-4 pr-3 transition-colors hover:border-accent/50"
                  >
                    {result && (
                      <span
                        aria-hidden
                        className={`absolute inset-y-2 left-0 w-1 rounded-full ${
                          result === "W" ? "bg-green-600" : result === "L" ? "bg-red-500" : "bg-muted"
                        }`}
                      />
                    )}
                    <div className="w-10 shrink-0 text-center" title={fx.league.name}>
                      <div className="text-base font-bold leading-none tabular-nums">{date.getDate()}</div>
                      <div className="mt-0.5 text-[10px] uppercase text-muted">
                        {date.toLocaleDateString(locale, { month: "short" }).replace(".", "")}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <TeamCrest logo={opp.logo} className="h-5 w-5" />
                        <span className="truncate text-sm font-medium group-hover:text-accent">{opp.name}</span>
                        <span className="shrink-0 text-[10px] text-muted">
                          {weAreHome ? t("homeLabel") : t("awayLabel")}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
                        {fx.league.logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fx.league.logo} alt="" title={fx.league.name} className="mr-0.5 h-3.5 w-3.5 object-contain" />
                        )}
                        {/* 0 minutes = on the bench the whole game, whatever the
                            source says about starting. */}
                        {pm.minutes > 0 ? (
                          <>
                            <span className="rounded-md bg-surface px-1.5 py-0.5 font-medium tabular-nums ring-1 ring-border">
                              {pm.minutes}&apos;
                            </span>
                            <span className="rounded-md bg-surface px-1.5 py-0.5 text-muted ring-1 ring-border">
                              {pm.started ? t("statLineups") : t("liveStatsAddSubButton")}
                            </span>
                          </>
                        ) : (
                          <span className="rounded-md bg-surface px-1.5 py-0.5 text-muted ring-1 ring-border">
                            {t("playerMatchUnusedSub")}
                          </span>
                        )}
                        {rating != null && (
                          <span className={`rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${ratingTone}`}>
                            ★ {rating.toFixed(1)}
                          </span>
                        )}
                        {pm.goals > 0 && <span className="rounded-md bg-surface px-1.5 py-0.5 ring-1 ring-border">⚽ {pm.goals}</span>}
                        {pm.assists > 0 && <span className="rounded-md bg-surface px-1.5 py-0.5 ring-1 ring-border">🅰️ {pm.assists}</span>}
                        {pm.yellow > 0 && <span className="rounded-md bg-surface px-1.5 py-0.5 ring-1 ring-border">🟨 {pm.yellow}</span>}
                        {pm.red > 0 && <span className="rounded-md bg-surface px-1.5 py-0.5 ring-1 ring-border">🟥 {pm.red}</span>}
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-lg px-2 py-1 text-sm font-bold tabular-nums ${
                        result === "W"
                          ? "bg-green-600 text-white"
                          : result === "L"
                            ? "bg-red-500 text-white"
                            : "bg-border text-foreground"
                      }`}
                    >
                      {ours ?? "-"}-{theirs ?? "-"}
                    </span>
                  </Link>
                );
              })}
            </MatchesScrollList>
          )}
        </div>
      </section>
      ) : (
        <p className="text-sm text-muted">{t("noRecentResults")}</p>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-muted">🩹 {t("injuryHistoryTitle")}</h3>
            {squadPlayer ? (
              // Our own players: the internal log is the source of truth
              // (it's what actually drove the "injured" status), topped up
              // with any API-reported period not already covered by an
              // internal record — still useful data, just not coach-confirmed.
              injuryHistory.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("noInjuryHistory")}</p>
              ) : (
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                  {injuryHistory.map((inj) => {
                    const start = new Date(inj.start);
                    const end = inj.end ? new Date(inj.end) : null;
                    const durationDays = end
                      ? Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
                      : null;
                    return (
                      <div key={inj.key} className="rounded-lg border border-border bg-background p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 font-medium">
                            {inj.description}
                            {inj.source === "api" && (
                              <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">
                                {t("injurySourceApiBadge")}
                              </span>
                            )}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                              end ? "bg-surface text-muted" : "bg-red-500/10 text-red-500"
                            }`}
                          >
                            {end ? t("injuryDurationDays", { count: durationDays ?? 0 }) : t("injuryOngoingBadge")}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {start.toLocaleDateString(locale)}
                          {end && ` – ${end.toLocaleDateString(locale)}`}
                          {!end &&
                            inj.expectedReturnAt &&
                            ` · ${t("injuryExpectedReturnPrefix")} ${new Date(
                              inj.expectedReturnAt,
                            ).toLocaleDateString(locale)}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : realSidelined.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("noInjuryHistory")}</p>
            ) : (
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {realSidelined.map((s, i) => {
                  const start = new Date(s.start);
                  const end = s.end ? new Date(s.end) : null;
                  const durationDays = end
                    ? Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
                    : null;
                  return (
                    <div key={i} className="rounded-lg border border-border bg-background p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{translateInjuryType(s.type, locale)}</div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            end ? "bg-surface text-muted" : "bg-red-500/10 text-red-500"
                          }`}
                        >
                          {end ? t("injuryDurationDays", { count: durationDays ?? 0 }) : t("injuryOngoingBadge")}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        {start.toLocaleDateString(locale)}
                        {end && ` – ${end.toLocaleDateString(locale)}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted">🔄 {t("careerTransfersTitle")}</h3>
            {realTransfers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("noTransfersFound")}</p>
            ) : (
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {realTransfers.map((transfer, i) => {
                  const isLoan = transfer.type != null && /loan/i.test(transfer.type);
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border-y border-r border-border bg-background p-3 text-sm ${
                        isLoan ? "border-l-4 border-l-accent" : "border-l border-l-border"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link
                          href={`/club/${transfer.teams.out.id}`}
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
                          href={`/club/${transfer.teams.in.id}`}
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
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted">
                        {isLoan ? (
                          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                            {t("careerTransferLoanBadge")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                            {transfer.type ?? "—"}
                          </span>
                        )}
                        <span>{new Date(transfer.date).toLocaleDateString(locale)}</span>
                      </div>
                    </div>
                  );
                })}
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
                      <span key={year} className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted">
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
    </div>
  );

  const physicalContent = squadPlayer ? (
    <div className="space-y-6">
      <PlayerBodyMetrics
        teamId={teamId}
        playerId={playerId}
        isCoach={isCoach}
        heightCm={resolvedHeightCm}
        weightEntries={weightEntries}
        apiWeightKg={apiWeightKg}
      />
      <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">{t("playerGpsDataComingSoon")}</p>
      </div>
    </div>
  ) : null;

  const notesContent = (
    <div className="space-y-8">
      {isCoach && (
        <NotesList
          kind="player"
          teamId={teamId}
          playerId={playerId}
          notes={notes}
          mentionedIn={mentionedInNotes}
          title={t("playerNotesTitle")}
          emptyText={t("noNotesFound")}
          placeholder={t("playerNotesPlaceholder")}
          addLabel={t("addNoteButton")}
        />
      )}
      <div>
        <h3 className="text-sm font-semibold text-muted">{t("playerVideosTitle")}</h3>
        <PreparationVideoList rows={playerVideoRows} isCoach={isCoach} />
      </div>
    </div>
  );

  // Goalkeepers: their own ASM Live Mode history — the games (and, with a
  // keeper change, the part) they played. Matched by the linked squad id;
  // entries from before lineups were linked fall back to a close name match.
  let gkLiveGames: LiveGameStats[] = [];
  if (squadPlayer && isGoalkeeper) {
    gkLiveGames = allLiveGames.flatMap((game) => {
      const mine = game.gk.filter(
        (keeper) =>
          keeper.playerId === playerId ||
          (keeper.playerId == null && nameSimilarity(keeper.name, displayName) >= 0.85),
      );
      return mine.length ? [{ ...game, gk: mine }] : [];
    });
  }
  const gkStatConfig = squadPlayer && isGoalkeeper ? await loadTeamStatConfig(supabase, teamId) : null;
  const liveContent = squadPlayer && isGoalkeeper ? <GkLiveExplorer games={gkLiveGames} statConfig={gkStatConfig!} /> : null;

  const dossierContent =
    squadPlayer && currentStintId ? (
      <TeamDossier
        teamId={teamId}
        files={dossierFiles}
        players={[]}
        isCoach={isCoach}
        categories={PLAYER_DOSSIER_CATEGORIES}
        fixedPlayer={{ id: playerId, name: shortenPlayerName(displayName) }}
        title={t("playerDossierTitle")}
        subtitle={t("playerDossierSubtitle")}
      />
    ) : null;

  return (
    <div>
      <BackLink href="/club" label={t("clubSectionTitle")} />

      {error && (
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          Não foi possível carregar os dados deste jogador agora. Tenta recarregar a
          página daqui a pouco.
        </p>
      )}

      {!error && (
        <>
          <PlayerHero
            clubLogoUrl={currentClub?.logo ?? null}
            photoUrl={squadPlayer?.photo || bio?.photo}
            number={squadPlayer?.number}
            stats={filteredGeneralInfoStats.length > 0 ? filteredGeneralInfoStats : undefined}
          >
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {displayName}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {currentClub && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentClub.logo} alt="" className="h-4 w-4 object-contain" />
                  {currentClub.name}
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
          </PlayerHero>

          {isCoach && isManualId && manualRow && (
            <ManualPlayerMergePanel
              manualPlayerId={manualRow.id}
              apiPlayers={apiSquadPlayers.map((p) => ({ id: p.id, name: p.name, photo: p.photo }))}
            />
          )}

          {isCoach && pendingInjury && (
            <PendingInjuryBanner
              teamId={teamId}
              playerId={playerId}
              playerName={displayName}
              pendingInjury={pendingInjury}
            />
          )}

          {isCoach && dueReturnInjury && (
            <InjuryReturnPrompt
              teamId={teamId}
              playerId={playerId}
              playerName={displayName}
              injuryId={dueReturnInjury.id}
              expectedReturnAt={dueReturnInjury.expected_return_at!}
            />
          )}

          <PlayerDetailTabs
            overviewContent={overviewContent}
            physicalContent={physicalContent}
            notesContent={notesContent}
            dossierContent={dossierContent}
            liveContent={liveContent}
          />
        </>
      )}
    </div>
  );
}
