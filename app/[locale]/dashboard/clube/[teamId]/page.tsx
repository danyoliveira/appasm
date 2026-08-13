import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import {
  getTeamInfo,
  getTransfers,
  getLastFixtures,
  getNextFixtures,
  getSquad,
  getPlayerProfile,
} from "@/lib/api-football/cache";
import type { Fixture } from "@/lib/api-football/client";
import TransferList, { type TransferRow } from "./TransferList";
import { matchResult, FixtureTeamsRow } from "../fixtureHelpers";

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
  let lastFixtures: Fixture[] = [];
  let nextFixtures: Fixture[] = [];
  let squad: Awaited<ReturnType<typeof getSquad>> = [];
  let error = false;

  try {
    [teamInfo, transfers, lastFixtures, nextFixtures, squad] = await Promise.all([
      getTeamInfo(teamId),
      getTransfers(teamId),
      getLastFixtures(teamId),
      getNextFixtures(teamId),
      getSquad(teamId),
    ]);
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
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // No cap here — the full list is handed to a client-side "show more"
  // pager instead, so nothing from the transfer window gets cut off.
  const transfersIn = recentTransfers.filter((tr) => tr.teams.in.id === teamId);
  const transfersOut = recentTransfers.filter((tr) => tr.teams.out.id === teamId);

  // Bio (photo, age, nationality) for every transferred player, one cached
  // request each — free after the first visit (cached for 90 days).
  const uniquePlayerIds = Array.from(
    new Set([...transfersIn, ...transfersOut].map((tr) => tr.playerId)),
  );
  const profileEntries = await Promise.all(
    uniquePlayerIds.map((id) =>
      getPlayerProfile(id)
        .then((res) => [id, res[0]?.player] as const)
        .catch(() => [id, undefined] as const),
    ),
  );
  const profileByPlayerId = new Map(profileEntries);

  function toRow(transfer: (typeof transfersIn)[number], otherClub: { name: string; logo: string }): TransferRow {
    const profile = profileByPlayerId.get(transfer.playerId);
    return {
      key: `${transfer.playerId}-${transfer.date}-${transfer.teams.in.id}-${transfer.teams.out.id}`,
      playerName: transfer.playerName,
      photo: squadPhotoByPlayerId.get(transfer.playerId) ?? profile?.photo,
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

  return (
    <div>
      <Link href="/dashboard/clube" className="text-sm text-muted hover:text-foreground">
        ← {t("backToClubButton")}
      </Link>

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
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{t("recentFormTitle")}</h2>
              {lastFixtures.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("noRecentResults")}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {lastFixtures.map((fx) => {
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
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{t("fixturesTitle")}</h2>
              {nextFixtures.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("noUpcomingFixtures")}</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {nextFixtures.map((fx) => (
                    <div
                      key={fx.fixture.id}
                      className="rounded-lg border border-border bg-background p-3 text-sm"
                    >
                      <div className="mb-1.5 text-xs text-muted">
                        {new Date(fx.fixture.date).toLocaleDateString(locale)}
                      </div>
                      <FixtureTeamsRow
                        home={fx.teams.home}
                        away={fx.teams.away}
                        center={<span className="text-xs text-muted">vs</span>}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

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
