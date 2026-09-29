import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamInfo } from "@/lib/api-football/cache";
import { resolveManualOpponent } from "@/lib/manualOpponent";
import { loadLiveFixture } from "@/lib/liveFixtureLoader";
import TeamCrest from "@/components/TeamCrest";
import BackLink from "../../../BackLink";
import FixtureHeroAccent from "../../../FixtureHeroAccent";
import PitchDiagram from "./PitchDiagram";
import LineupSubsList from "./LineupSubsList";
import FixtureStatsSourceTabs from "./FixtureStatsSourceTabs";
import LiveInternalStats from "./LiveInternalStats";

// The match page for a game created from scratch (not in API-Football).
// Same layout as the API match page — hero, lineups on the pitch with
// substitutes, match stats — built from our own data: the manual game
// itself and, when it was followed in ASM Live Mode, what was logged there
// (converted to API-Football's shapes so the very same components render it).
export default async function ManualFixtureDetail({
  locale,
  preparationKey,
}: {
  locale: Locale;
  preparationKey: string;
}) {
  const t = await getTranslations("dashboard");
  const supabase = await createClient();
  const manualId = preparationKey.slice("manual-".length);

  const [{ data: row }, { data: coachProfile }] = await Promise.all([
    supabase
      .from("manual_preparations")
      .select(
        "id, team_id, opponent_team_id, opponent_name, opponent_logo, match_date, competition_name, competition_logo, is_home, goals_for, goals_against",
      )
      .eq("id", manualId)
      .maybeSingle(),
    supabase.from("profiles").select("api_football_team_id").eq("role", "coach").maybeSingle(),
  ]);

  if (!row) {
    return (
      <div>
        <BackLink href="/club" label={t("clubSectionTitle")} />
        <p className="mt-8 rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted">
          {t("noFixtureFound")}
        </p>
      </div>
    );
  }

  const teamId: number = coachProfile?.api_football_team_id ?? row.team_id;
  const [opponent, ourInfo] = await Promise.all([
    resolveManualOpponent(row),
    getTeamInfo(teamId).catch(() => []),
  ]);
  const us = { id: teamId, name: ourInfo[0]?.team.name ?? "—", logo: ourInfo[0]?.team.logo ?? "" };
  const them = { id: opponent.id ?? -1, name: opponent.name, logo: opponent.logo };
  const home = row.is_home ? us : them;
  const away = row.is_home ? them : us;
  const ourSide = row.is_home ? "home" : "away";

  const live = await loadLiveFixture(supabase, { preparationKey, home, away, ourSide });
  const view = live?.view ?? null;

  // Hand-entered score first; otherwise the goals logged in Live Mode.
  const hasManualScore = row.goals_for != null && row.goals_against != null;
  const liveGoals = (side: "home" | "away") =>
    (live?.entries ?? []).filter((e) => e.kind === "event" && e.event_type === "goal" && e.team_side === side).length;
  const score = hasManualScore
    ? row.is_home
      ? { home: row.goals_for!, away: row.goals_against! }
      : { home: row.goals_against!, away: row.goals_for! }
    : live
      ? { home: liveGoals("home"), away: liveGoals("away") }
      : null;
  const isPast = new Date(row.match_date).getTime() < new Date().getTime();
  const hasLineups = view && (view.lineups.home.startXI.length > 0 || view.lineups.away.startXI.length > 0);

  function renderTeam(team: { id: number; name: string; logo: string }) {
    const inner = (
      <>
        <TeamCrest logo={team.logo} className="h-12 w-12" />
        <span className="max-w-[110px] truncate text-center text-sm font-medium">{team.name}</span>
      </>
    );
    return team.id > 0 ? (
      <Link href={`/club/${team.id}`} className="flex flex-col items-center gap-2 hover:text-accent">
        {inner}
      </Link>
    ) : (
      <div className="flex flex-col items-center gap-2">{inner}</div>
    );
  }

  return (
    <div>
      <BackLink href="/club" label={t("clubSectionTitle")} />

      <FixtureHeroAccent homeLogo={home.logo || null} awayLogo={away.logo || null}>
        <div className="flex items-center justify-center gap-2 text-xs text-muted">
          {row.competition_logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.competition_logo} alt="" className="h-4 w-4 object-contain" />
          )}
          <span>{row.competition_name ?? t("calendarManualGameHint")}</span>
        </div>

        <div className="mt-4 flex items-center justify-center gap-6 sm:gap-10">
          {renderTeam(home)}
          <div className="text-center">
            <div className="text-3xl font-bold tracking-tight">
              {score ? `${score.home} - ${score.away}` : "- - -"}
            </div>
            <div className="mt-1 text-xs text-muted">
              {score || isPast ? t("liveStatsPhaseEnded") : ""}
              {!hasManualScore && live && " · ASM Live Mode"}
            </div>
          </div>
          {renderTeam(away)}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>{new Date(row.match_date).toLocaleString(locale)}</span>
          <span>🏟️ {row.is_home ? t("homeLabel") : t("awayLabel")}</span>
        </div>

        <div className="mt-4 flex justify-center">
          <Link
            href={`/preparations/${preparationKey}`}
            className="inline-block rounded-full border border-accent px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10"
          >
            {t("reviewPreparationButton")}
          </Link>
        </div>
      </FixtureHeroAccent>

      {view && hasLineups && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">{t("lineupsTitle")}</h2>
          <div className="mt-4">
            <PitchDiagram
              home={view.lineups.home}
              away={view.lineups.away}
              events={view.events}
              locale={locale}
              assistLabel={t("assistLabel")}
              linkablePlayerIds={view.linkablePlayerIds}
            />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[view.lineups.home, view.lineups.away].map((lineup) => (
              <div key={lineup.team.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <TeamCrest logo={lineup.team.logo} className="h-5 w-5" />
                  <span className="text-sm font-semibold">{lineup.team.name}</span>
                </div>
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("substitutesTitle")}
                </h4>
                <LineupSubsList
                  lineup={lineup}
                  events={view.events}
                  locale={locale}
                  assistLabel={t("assistLabel")}
                  linkablePlayerIds={view.linkablePlayerIds}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* A manual game has no API-Football data — Externa just says so. */}
      <FixtureStatsSourceTabs
        external={null}
        internal={
          live ? (
            <LiveInternalStats
              live={live}
              ourSide={ourSide}
              ourTeamName={us.name}
              homeLogo={home.logo}
              awayLogo={away.logo}
              locale={locale}
              sectionTitle={t}
            />
          ) : null
        }
      />
    </div>
  );
}
