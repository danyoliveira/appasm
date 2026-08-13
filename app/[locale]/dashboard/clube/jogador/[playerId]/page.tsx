import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getSquad,
  getPlayerProfile,
  getCurrentLeagueAndSeason,
  getPlayersStatistics,
  getInjuries,
  getSidelined,
  getPlayerTransfers,
  getTrophies,
  getTeamSeasonFixtures,
  getFixturePlayers,
} from "@/lib/api-football/cache";
import type { Fixture } from "@/lib/api-football/client";

interface PlayerMatch {
  fixture: Fixture;
  minutes: number;
  rating: string | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
}
import type { PlayerStatus } from "../../../actions";
import { translatePosition } from "../../playerShared";
import { matchResult, FixtureTeamsRow } from "../../fixtureHelpers";
import { HeaderStatusChip, PendingInjuryBanner } from "./PlayerHeaderStatus";
import PlayerNotesList from "./PlayerNotesList";

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-muted">{label}</span>
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

// The API only gives injury/absence types in English free text — translate
// the common ones, and fall back to the original string for anything not
// covered (better than nothing, not guaranteed complete).
const INJURY_TYPE_TRANSLATIONS: Record<string, { pt: string; es: string; fr: string }> = {
  "Missing Fixture": { pt: "Jogo em falta", es: "Partido no disputado", fr: "Match manqué" },
  Suspended: { pt: "Suspenso", es: "Sancionado", fr: "Suspendu" },
  Illness: { pt: "Doença", es: "Enfermedad", fr: "Maladie" },
  Injured: { pt: "Lesionado", es: "Lesionado", fr: "Blessé" },
  Knock: { pt: "Pancada", es: "Golpe", fr: "Coup" },
  "COVID-19": { pt: "Covid-19", es: "Covid-19", fr: "Covid-19" },
  "Personal Reasons": { pt: "Razões pessoais", es: "Razones personales", fr: "Raisons personnelles" },
  "Not With Squad": { pt: "Fora do plantel", es: "Fuera de la plantilla", fr: "Hors groupe" },
  "Coach's Decision": { pt: "Decisão técnica", es: "Decisión técnica", fr: "Décision technique" },
  "International Duty": { pt: "Seleção nacional", es: "Selección nacional", fr: "Sélection nacional" },
  "Cruciate Ligament": { pt: "Ligamento cruzado", es: "Ligamento cruzado", fr: "Ligament croisé" },
  "Ligament Damage": { pt: "Lesão ligamentar", es: "Lesión de ligamentos", fr: "Lésion ligamentaire" },
  Concussion: { pt: "Concussão", es: "Conmoción cerebral", fr: "Commotion cérébrale" },
  "Broken Foot": { pt: "Fratura no pé", es: "Fractura de pie", fr: "Fracture du pied" },
  "Broken Leg": { pt: "Fratura na perna", es: "Fractura de pierna", fr: "Fracture de la jambe" },
  "Broken Arm": { pt: "Fratura no braço", es: "Fractura de brazo", fr: "Fracture du bras" },
  Fracture: { pt: "Fratura", es: "Fractura", fr: "Fracture" },
  Surgery: { pt: "Cirurgia", es: "Cirugía", fr: "Chirurgie" },
  Operation: { pt: "Operação", es: "Operación", fr: "Opération" },
};

const BODY_PART_TRANSLATIONS: Record<string, { pt: string; es: string; fr: string }> = {
  Muscle: { pt: "muscular", es: "muscular", fr: "musculaire" },
  Knee: { pt: "no joelho", es: "de rodilla", fr: "au genou" },
  Ankle: { pt: "no tornozelo", es: "de tobillo", fr: "à la cheville" },
  Thigh: { pt: "na coxa", es: "de muslo", fr: "à la cuisse" },
  Calf: { pt: "no gémeo", es: "de gemelo", fr: "au mollet" },
  Groin: { pt: "na virilha", es: "de ingle", fr: "à l'aine" },
  Back: { pt: "nas costas", es: "de espalda", fr: "au dos" },
  Hamstring: { pt: "nos isquiotibiais", es: "isquiotibial", fr: "aux ischio-jambiers" },
  Shoulder: { pt: "no ombro", es: "de hombro", fr: "à l'épaule" },
  Foot: { pt: "no pé", es: "de pie", fr: "au pied" },
  Hand: { pt: "na mão", es: "de mano", fr: "à la main" },
  Wrist: { pt: "no pulso", es: "de muñeca", fr: "au poignet" },
  Head: { pt: "na cabeça", es: "de cabeza", fr: "à la tête" },
  Rib: { pt: "nas costelas", es: "de costillas", fr: "aux côtes" },
  Hip: { pt: "na anca", es: "de cadera", fr: "à la hanche" },
  Elbow: { pt: "no cotovelo", es: "de codo", fr: "au coude" },
  Achilles: { pt: "no tendão de Aquiles", es: "de tendón de Aquiles", fr: "au tendon d'Achille" },
};

const INJURY_WORD: Record<"pt" | "es" | "fr", string> = {
  pt: "Lesão",
  es: "Lesión",
  fr: "Blessure",
};

function translateInjuryType(type: string, locale: string): string {
  if (locale !== "pt" && locale !== "es" && locale !== "fr") return type;

  const exact = INJURY_TYPE_TRANSLATIONS[type];
  if (exact) return exact[locale];

  const match = type.match(/^(\w+)\s+Injury$/i);
  if (match) {
    const part = BODY_PART_TRANSLATIONS[match[1]];
    if (part) return `${INJURY_WORD[locale]} ${part[locale]}`;
  }

  return type;
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
  let seasonStats: Awaited<ReturnType<typeof getPlayersStatistics>>[number]["statistics"] = [];
  let sidelined: Awaited<ReturnType<typeof getSidelined>> = [];
  let transfers: Awaited<ReturnType<typeof getPlayerTransfers>> = [];
  let trophies: Awaited<ReturnType<typeof getTrophies>> = [];
  let playerMatches: PlayerMatch[] = [];
  let pendingInjuryReason: string | null = null;
  let error = false;

  try {
    const [squad, profiles, current] = await Promise.all([
      getSquad(teamId),
      getPlayerProfile(playerId),
      getCurrentLeagueAndSeason(teamId),
    ]);
    squadPlayer = squad[0]?.players.find((p) => p.id === playerId) ?? null;
    bio = profiles[0]?.player ?? null;

    if (current) {
      // Every finished fixture of the season, not just the last few — one
      // cached, long-TTL request per past fixture (shared across every
      // player's page, so only the first-ever view per fixture pays for it).
      const seasonFixtures = await getTeamSeasonFixtures(teamId, current.season).catch(() => []);
      const playedFixtures = seasonFixtures.filter(
        (fx) => fx.goals.home != null && fx.goals.away != null,
      );

      const fixturePlayerResults = await Promise.all(
        playedFixtures.map((fx) => getFixturePlayers(fx.fixture.id).catch(() => [])),
      );
      playedFixtures.forEach((fx, i) => {
        for (const team of fixturePlayerResults[i]) {
          const entry = team.players.find((p) => p.player.id === playerId);
          if (entry) {
            const stats = entry.statistics[0];
            const minutes = stats?.games.minutes ?? 0;
            if (minutes > 0) {
              playerMatches.push({
                fixture: fx,
                minutes,
                rating: stats.games.rating,
                goals: stats.goals.total ?? 0,
                assists: stats.goals.assists ?? 0,
                yellow: stats.cards.yellow ?? 0,
                red: stats.cards.red ?? 0,
              });
            }
            break;
          }
        }
      });
      playerMatches.sort(
        (a, b) => new Date(b.fixture.fixture.date).getTime() - new Date(a.fixture.fixture.date).getTime(),
      );
    }

    const [sidelinedResult, transfersResult, trophiesResult, playersStats, injuries] =
      await Promise.all([
        getSidelined(playerId).catch(() => []),
        getPlayerTransfers(playerId).catch(() => []),
        getTrophies(playerId).catch(() => []),
        current ? getPlayersStatistics(teamId, current.season).catch(() => []) : [],
        current ? getInjuries(teamId, current.season).catch(() => []) : [],
      ]);
    sidelined = sidelinedResult;
    transfers = transfersResult;
    trophies = trophiesResult;
    seasonStats = playersStats.find((p) => p.player.id === playerId)?.statistics ?? [];
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

  const totals = seasonStats.reduce(
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

  const rating = seasonStats.find((s) => s.games.rating)?.games.rating;
  const isGoalkeeper = (squadPlayer?.position ?? seasonStats[0]?.games.position) === "Goalkeeper";
  const displayName = squadPlayer?.name ?? bio?.name ?? "";

  const uniqueTrophies = Array.from(
    new Map(
      trophies
        .filter((tr) => tr.place === "Winner" && tr.season?.trim())
        .map((tr) => [
          `${tr.league.trim().toLowerCase()}|${tr.country.trim().toLowerCase()}|${tr.season.trim().toLowerCase()}`,
          tr,
        ]),
    ).values(),
  );

  return (
    <div>
      <Link href="/dashboard/clube" className="text-sm text-muted hover:text-foreground">
        ← {t("clubSectionTitle")}
      </Link>

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
                  {squadPlayer && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">
                      🎽 {translatePosition(squadPlayer.position, t)}
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
                  <HeaderStatusChip
                    teamId={teamId}
                    playerId={playerId}
                    playerName={displayName}
                    status={status}
                    isCoach={isCoach}
                  />
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

          {(seasonStats.length > 0 || playerMatches.length > 0) && (
            <section className="mt-10 grid gap-6 lg:grid-cols-2">
              {seasonStats.length > 0 && (
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <h2 className="text-lg font-semibold">📊 {t("seasonStatsTitle")}</h2>

                  <StatGroup title={t("statGroupGeneral")}>
                    <StatRow label={t("playerStatAppearances")} value={totals.appearances} />
                    <StatRow label={t("statLineups")} value={totals.lineups} />
                    <StatRow label={t("playerStatMinutes")} value={totals.minutes} />
                    <StatRow
                      label={t("statRating")}
                      value={rating ? Number(rating).toFixed(1) : "-"}
                    />
                  </StatGroup>

                  {isGoalkeeper ? (
                    <StatGroup title={t("statGroupGoalkeeping")}>
                      <StatRow label={t("playerStatSaves")} value={totals.saves} />
                      <StatRow label={t("playerStatConceded")} value={totals.conceded} />
                    </StatGroup>
                  ) : (
                    <>
                      <StatGroup title={t("statGroupAttack")}>
                        <StatRow label={t("playerStatGoals")} value={totals.goals} />
                        <StatRow label={t("playerStatAssists")} value={totals.assists} />
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
                    <StatRow label={t("statYellowCards")} value={totals.yellow} />
                    <StatRow label={t("statRedCards")} value={totals.red} />
                  </StatGroup>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <h2 className="text-lg font-semibold">⚽ {t("playerMatchesTitle")}</h2>
                {playerMatches.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">{t("noRecentResults")}</p>
                ) : (
                  <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                    {playerMatches.map((pm) => {
                      const fx = pm.fixture;
                      const result = matchResult(fx, teamId);
                      return (
                        <Link
                          key={fx.fixture.id}
                          href={`/dashboard/clube/jogo/${fx.fixture.id}`}
                          className="block rounded-lg border border-border bg-background p-3 text-sm transition-colors hover:border-accent"
                        >
                          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                            <span>{new Date(fx.fixture.date).toLocaleDateString(locale)}</span>
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
                              <span className="font-semibold">
                                {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                              </span>
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
                        </Link>
                      );
                    })}
                  </div>
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
                {sidelined.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t("noInjuryHistory")}</p>
                ) : (
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {sidelined.map((s, i) => (
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
                {transfers.length === 0 || !transfers[0]?.transfers.length ? (
                  <p className="mt-2 text-sm text-muted">{t("noTransfersFound")}</p>
                ) : (
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {transfers[0].transfers
                      .slice()
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((transfer, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-background p-3 text-sm"
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={transfer.teams.out.logo}
                              alt=""
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                            <span className="truncate">{transfer.teams.out.name}</span>
                            <span className="shrink-0 text-muted">→</span>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={transfer.teams.in.logo}
                              alt=""
                              className="h-4 w-4 shrink-0 object-contain"
                            />
                            <span className="truncate">{transfer.teams.in.name}</span>
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
              {uniqueTrophies.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("noTrophiesFound")}</p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {uniqueTrophies.map((trophy, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{trophy.league}</div>
                        <div className="truncate text-xs text-muted">{trophy.country}</div>
                      </div>
                      <span className="shrink-0 text-xs text-muted">{trophy.season}</span>
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
