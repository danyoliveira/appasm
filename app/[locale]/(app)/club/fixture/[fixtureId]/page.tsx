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
import FixtureStatsBars, { type StatBarRow } from "./FixtureStatsBars";
import LineupSubsList from "./LineupSubsList";

const STAT_LABELS: Record<string, { pt: string; es: string; fr: string; en: string }> = {
  "Shots on Goal": { pt: "Remates à baliza", es: "Tiros a puerta", fr: "Tirs cadrés", en: "Shots on target" },
  "Shots off Goal": { pt: "Remates ao lado", es: "Tiros fuera", fr: "Tirs non cadrés", en: "Shots off target" },
  "Total Shots": { pt: "Remates totais", es: "Tiros totales", fr: "Tirs totaux", en: "Total shots" },
  "Blocked Shots": { pt: "Remates bloqueados", es: "Tiros bloqueados", fr: "Tirs bloqués", en: "Blocked shots" },
  "Shots insidebox": { pt: "Remates dentro da área", es: "Tiros dentro del área", fr: "Tirs dans la surface", en: "Shots inside box" },
  "Shots outsidebox": { pt: "Remates fora da área", es: "Tiros fuera del área", fr: "Tirs hors surface", en: "Shots outside box" },
  Fouls: { pt: "Faltas", es: "Faltas", fr: "Fautes", en: "Fouls" },
  "Corner Kicks": { pt: "Cantos", es: "Córners", fr: "Corners", en: "Corners" },
  Offsides: { pt: "Fora de jogo", es: "Fueras de juego", fr: "Hors-jeu", en: "Offsides" },
  "Ball Possession": { pt: "Posse de bola", es: "Posesión", fr: "Possession", en: "Possession" },
  "Yellow Cards": { pt: "Cartões amarelos", es: "Tarjetas amarillas", fr: "Cartons jaunes", en: "Yellow cards" },
  "Red Cards": { pt: "Cartões vermelhos", es: "Tarjetas rojas", fr: "Cartons rouges", en: "Red cards" },
  "Goalkeeper Saves": { pt: "Defesas do guarda-redes", es: "Paradas del portero", fr: "Arrêts du gardien", en: "Goalkeeper saves" },
  "Total passes": { pt: "Passes totais", es: "Pases totales", fr: "Passes totales", en: "Total passes" },
  "Passes accurate": { pt: "Passes certos", es: "Pases precisos", fr: "Passes réussies", en: "Accurate passes" },
  "Passes %": { pt: "Precisão de passe", es: "Precisión de pase", fr: "Précision de passe", en: "Pass accuracy" },
  expected_goals: { pt: "Golos esperados (xG)", es: "Goles esperados (xG)", fr: "Buts attendus (xG)", en: "Expected goals (xG)" },
};

function translateStatLabel(type: string, locale: Locale): string {
  const entry = STAT_LABELS[type];
  if (!entry) return type;
  return entry[locale] ?? type;
}

// The two or three numbers a coach actually glances at first — everything
// else (fouls, offsides, cards, blocked shots...) is real but secondary,
// grouped below by category instead of one flat list.
const HEADLINE_STAT_TYPES = new Set(["Ball Possession", "Total Shots", "Shots on Goal"]);

// Rate stats that are two independent 0-100 values, not a split of one
// shared total (unlike Ball Possession, which genuinely sums to ~100) — a
// shared proportional bar between them would misleadingly imply otherwise.
const INDEPENDENT_PERCENT_STAT_TYPES = new Set(["Passes %"]);

type StatSectionId = "attack" | "passing" | "discipline" | "goalkeeping";

const STAT_SECTION: Record<string, StatSectionId> = {
  "Shots off Goal": "attack",
  "Blocked Shots": "attack",
  "Shots insidebox": "attack",
  "Shots outsidebox": "attack",
  "Corner Kicks": "attack",
  expected_goals: "attack",
  "Total passes": "passing",
  "Passes accurate": "passing",
  "Passes %": "passing",
  Fouls: "discipline",
  Offsides: "discipline",
  "Yellow Cards": "discipline",
  "Red Cards": "discipline",
  "Goalkeeper Saves": "goalkeeping",
};

const STAT_SECTION_ORDER: { id: StatSectionId; titleKey: string }[] = [
  { id: "attack", titleKey: "statGroupAttack" },
  { id: "passing", titleKey: "statGroupPasses" },
  { id: "discipline", titleKey: "statGroupDiscipline" },
  { id: "goalkeeping", titleKey: "statGroupGoalkeeping" },
];

export default async function FixtureDetailPage({
  params,
}: {
  params: Promise<{ locale: Locale; fixtureId: string }>;
}) {
  const { locale, fixtureId: fixtureIdParam } = await params;
  setRequestLocale(locale);
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
            {detail.league.name} · {detail.league.round}
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
            <div className="mt-1 text-xs text-muted">{detail.fixture.status.long}</div>
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
          <span>{new Date(detail.fixture.date).toLocaleString(locale)}</span>
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

      {homeStats && awayStats && statTypes.length > 0 && (
        <section className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{t("fixtureStatsTitle")}</h2>
          {(() => {
            const toRow = (type: string): StatBarRow => {
              const homeRaw = homeStats.statistics.find((s) => s.type === type)?.value;
              const awayRaw = awayStats.statistics.find((s) => s.type === type)?.value;
              return {
                type,
                label: translateStatLabel(type, locale),
                homeDisplay: String(homeRaw ?? "-"),
                awayDisplay: String(awayRaw ?? "-"),
                homeNum: Number(String(homeRaw ?? "0").replace("%", "")) || 0,
                awayNum: Number(String(awayRaw ?? "0").replace("%", "")) || 0,
                independentPercent: INDEPENDENT_PERCENT_STAT_TYPES.has(type),
              };
            };
            const headline = statTypes.filter((type) => HEADLINE_STAT_TYPES.has(type)).map(toRow);
            const sections = STAT_SECTION_ORDER.map(({ id, titleKey }) => ({
              title: t(titleKey),
              rows: statTypes.filter((type) => STAT_SECTION[type] === id).map(toRow),
            }));
            return (
              <FixtureStatsBars
                homeLogo={detail.teams.home.logo}
                awayLogo={detail.teams.away.logo}
                headline={headline}
                sections={sections}
              />
            );
          })()}
        </section>
      )}
    </div>
  );
}
