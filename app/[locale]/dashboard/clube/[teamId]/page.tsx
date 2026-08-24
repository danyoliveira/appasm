import { getTranslations, setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n/routing";
import {
  getTeamInfo,
  getTransfers,
  getTeamSeasonFixtures,
  getSquad,
  getPlayerProfile,
  getCountries,
} from "@/lib/api-football/cache";
import {
  getCurrentCompetitions,
  resolveSelectedCompetition,
  COMPETITION_FILTER_COOKIE,
} from "@/lib/api-football/teamStats";
import TransferList, { type TransferRow } from "./TransferList";
import { toCalendarRow } from "../fixtureHelpers";
import FixtureCalendar, { type CalendarRow } from "../FixtureCalendar";
import OpponentSquadTable from "./OpponentSquadTable";
import { buildFlagResolver } from "@/lib/api-football/flags";
import BackLink from "../../BackLink";

const NEW_SIGNING_WINDOW_DAYS = 180;

export default async function ClubDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; teamId: string }>;
}) {
  const { locale, teamId: teamIdParam } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const teamId = Number(teamIdParam);

  let teamInfo = null;
  let transfers: Awaited<ReturnType<typeof getTransfers>> = [];
  let pastCalendarRows: CalendarRow[] = [];
  let futureCalendarRows: CalendarRow[] = [];
  let squad: Awaited<ReturnType<typeof getSquad>> = [];
  let countries: Awaited<ReturnType<typeof getCountries>> = [];
  let error = false;

  try {
    const [current, store] = await Promise.all([getCurrentCompetitions(teamId), cookies()]);
    const selectedCompetitionId = resolveSelectedCompetition(
      store.get(COMPETITION_FILTER_COOKIE)?.value,
      current.allCompetitions,
    );

    let seasonFixtures: Awaited<ReturnType<typeof getTeamSeasonFixtures>> = [];
    [teamInfo, transfers, seasonFixtures, squad, countries] = await Promise.all([
      getTeamInfo(teamId),
      getTransfers(teamId),
      current.defaultSeason
        ? getTeamSeasonFixtures(teamId, current.defaultSeason).catch(() => [])
        : Promise.resolve([]),
      getSquad(teamId),
      getCountries().catch(() => []),
    ]);

    // "All competitions" (no specific selection) never includes friendlies.
    const friendlyIds = new Set(current.friendlyCompetitions.map((c) => c.league.id));
    const relevantFixtures = seasonFixtures.filter((fx) =>
      selectedCompetitionId ? fx.league.id === selectedCompetitionId : !friendlyIds.has(fx.league.id),
    );
    const pastFixtures = relevantFixtures
      .filter((fx) => fx.goals.home != null && fx.goals.away != null)
      .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime());
    const futureFixtures = relevantFixtures
      .filter((fx) => fx.goals.home == null || fx.goals.away == null)
      .sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime());
    pastCalendarRows = pastFixtures.map((fx) => toCalendarRow(fx, teamId));
    futureCalendarRows = futureFixtures.map((fx) => toCalendarRow(fx, teamId));
  } catch {
    error = true;
  }

  // Photos for players currently on the squad — free, since the squad is
  // already fetched/cached for this page. Players who left have no photo
  // available without an extra per-player API call, so they fall back to
  // an initials avatar.
  const squadPhotoByPlayerId = new Map(
    squad[0]?.players.map((p) => [p.id, p.photo]) ?? [],
  );

  // Same recency window used for the "new signing" badge below — only
  // transfers from that period are worth showing here, not the club's
  // entire multi-year transfer history.
  const now = new Date().getTime();
  const isWithinNewSigningWindow = (date: string) =>
    (now - new Date(date).getTime()) / (24 * 60 * 60 * 1000) <= NEW_SIGNING_WINDOW_DAYS;

  const seenTransferKeys = new Set<string>();
  const recentTransfers = transfers
    .flatMap((entry) =>
      entry.transfers.map((transfer) => ({
        ...transfer,
        playerId: entry.player.id,
        playerName: entry.player.name,
      })),
    )
    .filter((transfer) => {
      const key = `${transfer.playerId}|${transfer.playerName.trim().toLowerCase()}|${transfer.teams.in.id}|${transfer.teams.out.id}`;
      if (seenTransferKeys.has(key)) return false;
      seenTransferKeys.add(key);
      return isWithinNewSigningWindow(transfer.date);
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const transfersIn = recentTransfers.filter((tr) => tr.teams.in.id === teamId);
  const transfersOut = recentTransfers.filter((tr) => tr.teams.out.id === teamId);

  // Bio (photo, age, nationality) for every transferred player and every
  // current squad member (for the flag next to their name below), one
  // cached request each — free after the first visit (cached for 90 days).
  const uniquePlayerIds = Array.from(
    new Set([
      ...transfersIn.map((tr) => tr.playerId),
      ...transfersOut.map((tr) => tr.playerId),
      ...(squad[0]?.players.map((p) => p.id) ?? []),
    ]),
  );
  const profileEntries = await Promise.all(
    uniquePlayerIds.map((id) =>
      getPlayerProfile(id)
        .then((res) => [id, res[0]?.player] as const)
        .catch(() => [id, undefined] as const),
    ),
  );
  const profileByPlayerId = new Map(profileEntries);

  const resolveFlagUrl = buildFlagResolver(countries);
  const flagUrlByPlayerId = new Map(
    Array.from(profileByPlayerId.entries()).map(([id, profile]) => [
      id,
      resolveFlagUrl(profile?.nationality),
    ]),
  );

  // transfersIn is already limited to the new-signing window above, so
  // every player in it qualifies for the badge.
  const newSigningPlayerIds = new Set(transfersIn.map((tr) => tr.playerId));

  function toRow(
    transfer: (typeof transfersIn)[number],
    otherClub: { id: number; name: string; logo: string },
  ): TransferRow {
    const profile = profileByPlayerId.get(transfer.playerId);
    return {
      key: `${transfer.playerId}-${transfer.date}-${transfer.teams.in.id}-${transfer.teams.out.id}`,
      playerId: transfer.playerId,
      playerName: transfer.playerName,
      photo: squadPhotoByPlayerId.get(transfer.playerId) ?? profile?.photo,
      otherClubId: otherClub.id,
      otherClubName: otherClub.name,
      otherClubLogo: otherClub.logo,
      nationality: profile?.nationality,
      age: profile?.age,
      type: transfer.type,
      date: transfer.date,
    };
  }

  const transfersInRows = transfersIn.map((tr) => toRow(tr, tr.teams.out));
  const transfersOutRows = transfersOut.map((tr) => toRow(tr, tr.teams.in));

  // Goalkeepers first, then tactical order (defence → attack), then name —
  // same convention as the squad table on the coach's own club page.
  const SQUAD_POSITION_ORDER: Record<string, number> = {
    Goalkeeper: 0,
    Defender: 1,
    Midfielder: 2,
    Attacker: 3,
  };
  const squadPlayers = [...(squad[0]?.players ?? [])].sort((a, b) => {
    const posDiff = (SQUAD_POSITION_ORDER[a.position] ?? 99) - (SQUAD_POSITION_ORDER[b.position] ?? 99);
    if (posDiff !== 0) return posDiff;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <BackLink href="/dashboard/clube" label={t("backToClubButton")} />

      {teamInfo?.[0] && (
        <div className="mt-4 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teamInfo[0].team.logo} alt="" className="h-14 w-14 object-contain" />
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {teamInfo[0].team.name}
          </h1>
        </div>
      )}

      {error && (
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          Não foi possível carregar os dados deste clube agora. Tenta recarregar
          a página daqui a pouco.
        </p>
      )}

      {!error && (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-semibold">{t("fixtureCalendarTitle")}</h2>
            <FixtureCalendar
              past={pastCalendarRows}
              future={futureCalendarRows}
              locale={locale}
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
              }}
            />
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">
              {t("squadTitleWithCount", { count: squadPlayers.length })}
            </h2>
            <div className="mt-4">
              <OpponentSquadTable
                players={squadPlayers}
                flagUrlByPlayerId={flagUrlByPlayerId}
                newSigningPlayerIds={newSigningPlayerIds}
              />
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">{t("transfersTitle")}</h2>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-green-600">{t("transfersInTitle")}</h3>
                <TransferList
                  rows={transfersInRows}
                  emptyLabel={t("noTransfersFound")}
                  showMoreLabel={t("showMoreButton")}
                />
              </div>

              <div>
                <h3 className="text-sm font-semibold text-red-500">{t("transfersOutTitle")}</h3>
                <TransferList
                  rows={transfersOutRows}
                  emptyLabel={t("noTransfersFound")}
                  showMoreLabel={t("showMoreButton")}
                />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
