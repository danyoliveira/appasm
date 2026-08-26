import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamInfo, getTeamSeasonFixtures } from "@/lib/api-football/cache";
import { toCalendarRow } from "../../club/fixtureHelpers";
import type { CalendarRow } from "../../club/FixtureCalendar";
import { translatePosition, STATUS_DOT, STATUS_TEXT, statusLabelKey } from "../../club/playerShared";
import type { PlayerStatus } from "../../actions";
import BackLink from "../../BackLink";
import ClubHeaderAccent from "../../ClubHeaderAccent";

// European season convention: a season starting in July/August 2026 is
// "season 2026" in API-Football, regardless of the calendar year it ends
// in — used to know which season(s) of getTeamSeasonFixtures to pull for
// an arbitrary stint date range.
function seasonYearForDate(date: Date): number {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
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

  const [teamInfo, { data: squadRows }, { data: manualPrepRows }, ...fixturesPerSeason] =
    await Promise.all([
      getTeamInfo(stint.team_id).catch(() => []),
      supabase
        .from("archived_squad_players")
        .select("player_id, name, photo, number, position")
        .eq("stint_id", stint.id),
      supabase
        .from("manual_preparations")
        .select("id, opponent_team_id, match_date")
        .eq("team_id", stint.team_id)
        .gte("created_at", stint.started_at)
        .lte("created_at", stint.ended_at!),
      ...seasons.map((season) => getTeamSeasonFixtures(stint.team_id, season).catch(() => [])),
    ]);

  const team = teamInfo[0]?.team ?? null;

  const { data: availabilityRows } = await supabase
    .from("player_availability")
    .select("player_id, status, excluded")
    .eq("stint_id", stint.id);
  const availabilityByPlayerId = new Map(
    (availabilityRows ?? []).map((row) => [row.player_id, row]),
  );

  const squad = squadRows ?? [];
  const goalkeepers = squad.filter((p) => p.position === "Goalkeeper");
  const outfield = squad.filter((p) => p.position !== "Goalkeeper");

  const playedFixtures = fixturesPerSeason
    .flat()
    .filter((fx) => {
      const t = new Date(fx.fixture.date).getTime();
      return (
        t >= startedAt.getTime() &&
        t <= endedAt.getTime() &&
        fx.goals.home != null &&
        fx.goals.away != null
      );
    })
    .sort((a, b) => new Date(b.fixture.date).getTime() - new Date(a.fixture.date).getTime());

  const fixtureIds = playedFixtures.map((fx) => fx.fixture.id);
  const { data: preparedFixtureRows } =
    fixtureIds.length > 0
      ? await supabase
          .from("fixture_preparations")
          .select("fixture_id")
          .eq("team_id", stint.team_id)
          .in("fixture_id", fixtureIds)
      : { data: [] as { fixture_id: number }[] };
  const preparedFixtureIds = new Set((preparedFixtureRows ?? []).map((r) => r.fixture_id));

  const matchRows: (CalendarRow & { hasPreparation: boolean })[] = playedFixtures.map((fx) => ({
    ...toCalendarRow(fx, stint.team_id),
    hasPreparation: preparedFixtureIds.has(fx.fixture.id),
  }));

  const manualRows = manualPrepRows ?? [];
  const opponentInfos = await Promise.all(
    manualRows.map((r) => getTeamInfo(r.opponent_team_id).catch(() => [])),
  );

  function renderPlayerCard(p: (typeof squad)[number]) {
    const availability = availabilityByPlayerId.get(p.player_id);
    const status = (availability?.status as PlayerStatus) ?? "available";
    return (
      <div
        key={p.player_id}
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm"
      >
        <div className="relative shrink-0">
          {p.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-background" />
          )}
          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground ring-2 ring-surface">
            {p.number ?? "-"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
              {translatePosition(p.position ?? "", t)}
            </span>
            {(availability?.excluded || status !== "available") && (
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
                <span className={`text-[10px] ${STATUS_TEXT[status]}`}>
                  {availability?.excluded ? t("excludedStatusLabel") : t(statusLabelKey(status))}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink href="/archive" label={t("archiveTitle")} />

      {team && (
        <div className="mt-4">
          <ClubHeaderAccent logoUrl={team.logo}>
            <div className="text-xl font-semibold">{team.name}</div>
            <div className="mt-1 text-sm opacity-80">
              {startedAt.toLocaleDateString(locale)} – {endedAt.toLocaleDateString(locale)}
            </div>
          </ClubHeaderAccent>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("archiveSquadTitle")}</h2>
        {squad.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("archiveNoSquadFound")}</p>
        ) : (
          <div className="mt-4 flex flex-col gap-6">
            {goalkeepers.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {goalkeepers.map(renderPlayerCard)}
              </div>
            )}
            {outfield.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {outfield.map(renderPlayerCard)}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("archiveMatchesTitle")}</h2>
        {matchRows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("archiveNoMatchesFound")}</p>
        ) : (
          <div className="mt-4 space-y-2">
            {matchRows.map((row) => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.opponent.logo} alt="" className="h-8 w-8 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{row.opponent.name}</div>
                  <div className="truncate text-xs text-muted">
                    {new Date(row.date).toLocaleDateString(locale)} · {row.competition.name}
                  </div>
                </div>
                {row.result && (
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                      row.result === "W" ? "bg-green-600" : row.result === "L" ? "bg-red-500" : "bg-muted"
                    }`}
                  >
                    {row.result}
                  </span>
                )}
                <span className="shrink-0 text-sm font-semibold">
                  {row.goalsFor} - {row.goalsAgainst}
                </span>
                {row.hasPreparation && (
                  <Link
                    href={`/archive/${stint.id}/preparation/${row.id}`}
                    className="shrink-0 text-xs font-medium text-accent hover:underline"
                  >
                    {t("archiveViewPreparationLink")}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {manualRows.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t("archivePreparationsTitle")}</h2>
          <div className="mt-4 space-y-2">
            {manualRows.map((r, i) => {
              const opponent = opponentInfos[i][0]?.team;
              if (!opponent) return null;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={opponent.logo} alt="" className="h-8 w-8 shrink-0 object-contain" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{opponent.name}</div>
                    <div className="truncate text-xs text-muted">
                      {new Date(r.match_date).toLocaleDateString(locale)}
                    </div>
                  </div>
                  <Link
                    href={`/archive/${stint.id}/preparation/manual-${r.id}`}
                    className="shrink-0 text-xs font-medium text-accent hover:underline"
                  >
                    {t("archiveViewPreparationLink")}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
