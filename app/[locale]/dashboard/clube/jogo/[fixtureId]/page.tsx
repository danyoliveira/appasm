import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import {
  getFixtureById,
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
} from "@/lib/api-football/cache";
import PitchDiagram from "./PitchDiagram";
import { eventIcon, eventTooltipLine, playerEvents } from "./eventUtils";

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
        <Link href="/dashboard/clube" className="text-sm text-muted hover:text-foreground">
          ← {t("clubSectionTitle")}
        </Link>
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {error
            ? "Não foi possível carregar os dados deste jogo agora. Tenta recarregar a página daqui a pouco."
            : t("noFixtureFound")}
        </p>
      </div>
    );
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
      <Link href="/dashboard/clube" className="text-sm text-muted hover:text-foreground">
        ← {t("clubSectionTitle")}
      </Link>

      <div className="mt-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-center gap-2 text-xs text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={detail.league.logo} alt="" className="h-4 w-4 object-contain" />
          <span>
            {detail.league.name} · {detail.league.round}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-center gap-6 sm:gap-10">
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={detail.teams.home.logo} alt="" className="h-12 w-12 object-contain" />
            <span className="max-w-[110px] truncate text-center text-sm font-medium">
              {detail.teams.home.name}
            </span>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold tracking-tight">
              {detail.goals.home ?? "-"} - {detail.goals.away ?? "-"}
            </div>
            <div className="mt-1 text-xs text-muted">{detail.fixture.status.long}</div>
          </div>
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={detail.teams.away.logo} alt="" className="h-12 w-12 object-contain" />
            <span className="max-w-[110px] truncate text-center text-sm font-medium">
              {detail.teams.away.name}
            </span>
          </div>
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
      </div>

      {homeLineup && awayLineup && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">🧩 {t("lineupsTitle")}</h2>
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
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lineup.team.logo} alt="" className="h-5 w-5 object-contain" />
                  <span className="text-sm font-semibold">{lineup.team.name}</span>
                </div>
                {lineup.coach.name && (
                  <p className="mt-1 text-xs text-muted">
                    {t("coachLabel")}: {lineup.coach.name}
                  </p>
                )}
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("substitutesTitle")}
                </h4>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {lineup.substitutes.map((p) => {
                    const evts = playerEvents(p.player.id, events);
                    return (
                      <div
                        key={p.player.id}
                        className="group relative flex items-center gap-1.5 rounded-full bg-background px-2 py-1 text-xs"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-[10px] font-bold">
                          {p.player.number}
                        </span>
                        <span className="truncate">{p.player.name}</span>
                        {evts.length > 0 && (
                          <span className="ml-auto flex shrink-0 -space-x-1">
                            {evts.slice(0, 3).map((ev, idx) => (
                              <span
                                key={idx}
                                className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface text-[8px] leading-none ring-1 ring-border"
                              >
                                {eventIcon(ev.type, ev.detail)}
                              </span>
                            ))}
                          </span>
                        )}
                        {evts.length > 0 && (
                          <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 flex-col gap-0.5 whitespace-nowrap rounded-md bg-black/90 px-2 py-1.5 text-[10px] text-white shadow-lg group-hover:flex">
                            {evts.map((ev, idx) => (
                              <span key={idx}>{eventTooltipLine(ev, locale, t("assistLabel"), p.player.id)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {homeStats && awayStats && statTypes.length > 0 && (
        <section className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold">📊 {t("fixtureStatsTitle")}</h2>
          <div className="mt-4 space-y-3">
            {statTypes.map((type) => {
              const homeRaw = homeStats.statistics.find((s) => s.type === type)?.value;
              const awayRaw = awayStats.statistics.find((s) => s.type === type)?.value;
              const homeNum = Number(String(homeRaw ?? "0").replace("%", "")) || 0;
              const awayNum = Number(String(awayRaw ?? "0").replace("%", "")) || 0;
              const total = homeNum + awayNum || 1;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{homeRaw ?? "-"}</span>
                    <span className="text-muted">{translateStatLabel(type, locale)}</span>
                    <span className="font-semibold">{awayRaw ?? "-"}</span>
                  </div>
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-background">
                    <div
                      className="bg-accent"
                      style={{ width: `${(homeNum / total) * 100}%` }}
                    />
                    <div
                      className="bg-muted"
                      style={{ width: `${(awayNum / total) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
