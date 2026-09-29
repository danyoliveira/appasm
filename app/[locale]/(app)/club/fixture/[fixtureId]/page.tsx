import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getFixtureById,
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
} from "@/lib/api-football/cache";
import PitchDiagram from "./PitchDiagram";
import BackLink from "../../../BackLink";
import FixtureHeroAccent from "../../../FixtureHeroAccent";
import FixtureStatsBars from "./FixtureStatsBars";
import LineupSubsList from "./LineupSubsList";
import { buildFixtureStatSections } from "./fixtureStatsHelpers";
import { loadLiveScores, withLiveScore } from "@/lib/liveScores";
import ManualFixtureDetail from "./ManualFixtureDetail";
import EventsTimeline from "./EventsTimeline";
import { fixtureStatusLabel, translateRound } from "../../fixtureHelpers";
import FixtureStatsSourceTabs from "./FixtureStatsSourceTabs";
import LiveInternalStats from "./LiveInternalStats";
import { loadLiveFixture } from "@/lib/liveFixtureLoader";

export default async function FixtureDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; fixtureId: string }>;
}) {
  const { locale, fixtureId: fixtureIdParam } = await params;
  setRequestLocale(locale);
  // Games created from scratch have their own page, built from our data.
  if (fixtureIdParam.startsWith("manual-")) {
    return <ManualFixtureDetail locale={locale} preparationKey={fixtureIdParam} />;
  }
  const t = await getTranslations("dashboard");
  const fixtureId = Number(fixtureIdParam);

  let detail = null;
  let events: Awaited<ReturnType<typeof getFixtureEvents>> = [];
  let lineups: Awaited<ReturnType<typeof getFixtureLineups>> = [];
  let statistics: Awaited<ReturnType<typeof getFixtureStatistics>> = [];
  let error = false;

  try {
    const [detailResult, eventsResult, lineupsResult, statisticsResult] = await Promise.all([
      getFixtureById(fixtureId).catch(() => []),
      getFixtureEvents(fixtureId).catch(() => []),
      getFixtureLineups(fixtureId).catch(() => []),
      getFixtureStatistics(fixtureId).catch(() => []),
    ]);
    detail = detailResult[0] ?? null;
    events = eventsResult;
    lineups = lineupsResult;
    statistics = statisticsResult;
  } catch {
    error = true;
  }

  if (!detail) {
    return (
      <div>
        <BackLink href="/club" label={t("clubSectionTitle")} />
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {error
            ? "Não foi possível carregar os dados deste jogo agora. Tenta recarregar a página daqui a pouco."
            : t("noFixtureFound")}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: coachProfile } = await supabase
    .from("profiles")
    .select("api_football_team_id")
    .eq("role", "coach")
    .maybeSingle();
  const teamId = coachProfile?.api_football_team_id ?? null;

  // No API-Football score yet → the ASM Live Mode one.
  if (teamId) detail = withLiveScore(detail, await loadLiveScores(supabase, teamId));

  let hasPreparation = false;
  if (teamId) {
    const { data: preparationRow } = await supabase
      .from("fixture_preparations")
      .select("id")
      .eq("team_id", teamId)
      .eq("fixture_id", fixtureId)
      .maybeSingle();
    hasPreparation = preparationRow != null;
  }

  // Interna: the same game as logged in ASM Live Mode, if it was followed there.
  const ourSide: "home" | "away" = detail.teams.home.id === teamId ? "home" : "away";
  const live = teamId
    ? await loadLiveFixture(supabase, {
        preparationKey: String(fixtureId),
        home: detail.teams.home,
        away: detail.teams.away,
        ourSide,
      })
    : null;

  const homeLineup = lineups.find((l) => l.team.id === detail!.teams.home.id);
  const awayLineup = lineups.find((l) => l.team.id === detail!.teams.away.id);
  const homeStats = statistics.find((s) => s.team.id === detail!.teams.home.id);
  const awayStats = statistics.find((s) => s.team.id === detail!.teams.away.id);
  const statTypes = Array.from(
    new Set([
      ...(homeStats?.statistics.map((s) => s.type) ?? []),
      ...(awayStats?.statistics.map((s) => s.type) ?? []),
    ]),
  );

  return (
    <div>
      <BackLink href="/club" label={t("clubSectionTitle")} />

      <FixtureHeroAccent homeLogo={detail.teams.home.logo} awayLogo={detail.teams.away.logo}>
        <div className="flex items-center justify-center gap-2 text-xs text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={detail.league.logo} alt="" className="h-4 w-4 object-contain" />
          <span>
            {detail.league.name}
            {detail.league.round && ` · ${translateRound(detail.league.round, t)}`}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-center gap-6 sm:gap-10">
          <Link
            href={`/club/${detail.teams.home.id}`}
            className="flex flex-col items-center gap-2 hover:text-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={detail.teams.home.logo} alt="" className="h-12 w-12 object-contain" />
            <span className="max-w-[110px] truncate text-center text-sm font-medium">
              {detail.teams.home.name}
            </span>
          </Link>
          <div className="text-center">
            <div className="text-3xl font-bold tracking-tight">
              {detail.goals.home ?? "-"} - {detail.goals.away ?? "-"}
            </div>
            <div className="mt-1 text-xs text-muted">{fixtureStatusLabel(detail.fixture.status, t)}</div>
          </div>
          <Link
            href={`/club/${detail.teams.away.id}`}
            className="flex flex-col items-center gap-2 hover:text-accent"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={detail.teams.away.logo} alt="" className="h-12 w-12 object-contain" />
            <span className="max-w-[110px] truncate text-center text-sm font-medium">
              {detail.teams.away.name}
            </span>
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="first-letter:uppercase">
            {new Date(detail.fixture.date).toLocaleString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {detail.fixture.venue.name && (
            <span>
              🏟️ {detail.fixture.venue.name}
              {detail.fixture.venue.city && `, ${detail.fixture.venue.city}`}
            </span>
          )}
          {detail.fixture.referee && <span>🧑‍⚖️ {detail.fixture.referee}</span>}
        </div>

        {hasPreparation && (
          <div className="mt-4 flex justify-center">
            <Link
              href={`/preparations/${fixtureId}`}
              className="inline-block rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10"
            >
              {t("reviewPreparationButton")}
            </Link>
          </div>
        )}
      </FixtureHeroAccent>

      <EventsTimeline
        events={events}
        homeTeamId={detail.teams.home.id}
        homeName={detail.teams.home.name}
        awayName={detail.teams.away.name}
        locale={locale}
        labels={{
          title: t("matchTimelineTitle"),
          assist: t("assistLabel"),
          halfTime: t("liveStatsPhaseHalftime"),
          showAll: t("matchTimelineShowAll"),
          showLess: t("matchTimelineShowLess"),
        }}
      />

      {homeLineup && awayLineup && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t("lineupsTitle")}</h2>
          <div className="mt-4">
            <PitchDiagram
              home={homeLineup}
              away={awayLineup}
              events={events}
              locale={locale}
              assistLabel={t("assistLabel")}
            />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[homeLineup, awayLineup].map((lineup) => (
              <div key={lineup.team.id} className="rounded-xl border border-border bg-surface p-4">
                <Link
                  href={`/club/${lineup.team.id}`}
                  className="flex items-center gap-2 hover:text-accent"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lineup.team.logo} alt="" className="h-5 w-5 object-contain" />
                  <span className="text-sm font-semibold">{lineup.team.name}</span>
                </Link>
                {lineup.coach.name && (
                  <p className="mt-1 text-xs text-muted">
                    {t("coachLabel")}: {lineup.coach.name}
                  </p>
                )}
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("substitutesTitle")}
                </h4>
                <LineupSubsList
                  lineup={lineup}
                  events={events}
                  locale={locale}
                  assistLabel={t("assistLabel")}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <FixtureStatsSourceTabs
        external={
          homeStats && awayStats && statTypes.length > 0
            ? (() => {
                const { headline, sections } = buildFixtureStatSections(homeStats, awayStats, locale, t);
                return (
                  <FixtureStatsBars
                    homeLogo={detail.teams.home.logo}
                    awayLogo={detail.teams.away.logo}
                    headline={headline}
                    sections={sections}
                  />
                );
              })()
            : null
        }
        internal={
          live ? (
            <LiveInternalStats
              live={live}
              ourSide={ourSide}
              ourTeamName={ourSide === "home" ? detail.teams.home.name : detail.teams.away.name}
              homeLogo={detail.teams.home.logo}
              awayLogo={detail.teams.away.logo}
              locale={locale}
              sectionTitle={t}
            />
          ) : null
        }
      />
    </div>
  );
}
