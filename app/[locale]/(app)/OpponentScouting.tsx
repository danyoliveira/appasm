import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import type { Fixture, Injury, TeamStatistics } from "@/lib/api-football/client";
import Icon, { type IconName } from "@/components/Icon";
import TeamCrest from "@/components/TeamCrest";
import SeasonStatsGrid from "./SeasonStatsGrid";
import { leagueLabel, matchResult } from "./club/fixtureHelpers";
import { translateInjuryType, shortenPlayerName } from "./club/playerShared";

// Same heading on every scouting/dashboard card: a small tinted icon tile,
// the title, and an optional count.
export function SectionHeading({ icon, title, count }: { icon: IconName; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted ring-1 ring-border">
          {count}
        </span>
      )}
    </div>
  );
}

export const RESULT_TONE: Record<"W" | "D" | "L", string> = {
  W: "bg-green-600 text-white",
  D: "bg-border text-foreground",
  L: "bg-red-500 text-white",
};

// The opponent's scouting profile — absences, recent form either side of
// the match, season numbers and head-to-head — shared by the dashboard's
// next-fixture block and a preparation's "Informações Gerais" tab.
export default function OpponentScouting({
  t,
  locale,
  teamId,
  opponentId,
  injuries,
  unavailable,
  headToHead,
  lastFixture,
  nextFixture,
  stats,
  showEmptyAbsences = false,
}: {
  t: (key: string, values?: Record<string, string | number>) => string;
  locale: Locale;
  teamId: number | null;
  opponentId: number;
  injuries: Injury[];
  unavailable: Injury[];
  headToHead: Fixture[];
  lastFixture: Fixture | null;
  nextFixture: Fixture | null;
  stats: TeamStatistics | null;
  // The preparation tab says "no information" instead of dropping the card.
  showEmptyAbsences?: boolean;
}) {
  const otherSide = (fx: Fixture) => (fx.teams.home.id === opponentId ? fx.teams.away : fx.teams.home);
  const lastResult = lastFixture ? matchResult(lastFixture, opponentId) : null;
  const lastOpponent = lastFixture ? otherSide(lastFixture) : null;
  const nextOpponent = nextFixture ? otherSide(nextFixture) : null;
  // The opponent's own score first ("1-0" next to their W), with where
  // they played — a bare "Chaves 0 - 1" didn't say who scored what.
  const lastIsHome = lastFixture?.teams.home.id === opponentId;
  const lastScore = lastFixture
    ? lastIsHome
      ? `${lastFixture.goals.home ?? "-"} - ${lastFixture.goals.away ?? "-"}`
      : `${lastFixture.goals.away ?? "-"} - ${lastFixture.goals.home ?? "-"}`
    : "";
  const venueOf = (fx: Fixture) => (fx.teams.home.id === opponentId ? t("homeLabel") : t("awayLabel"));
  const hasForm = Boolean(lastFixture || nextFixture || stats);
  const absences = injuries.length + unavailable.length;

  return (
    <>
      {(absences > 0 || showEmptyAbsences) && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <SectionHeading icon="users" title={t("opponentAbsencesTitle")} count={absences} />
          {absences === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("noInjuriesFound")}</p>
          ) : (
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              {[
                { key: "injuries", title: t("injuriesTitle"), list: injuries, dot: "bg-red-500" },
                { key: "unavailable", title: t("unavailableTitle"), list: unavailable, dot: "bg-amber-500" },
              ]
                .filter((group) => group.list.length > 0 || group.key === "injuries")
                .map((group) => (
                  <div key={group.key}>
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      <span className={`h-1.5 w-1.5 rounded-full ${group.dot}`} />
                      {group.title}
                      <span className="tabular-nums">· {group.list.length}</span>
                    </h3>
                    {group.list.length === 0 ? (
                      <p className="mt-2 text-sm text-muted">{t("noInjuriesFound")}</p>
                    ) : (
                      <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
                        {group.list.map((injury) => (
                          <Link
                            key={injury.player.id}
                            href={`/club/player/${injury.player.id}`}
                            className="flex items-center gap-3 px-3 py-2 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-surface"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={injury.player.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                              {shortenPlayerName(injury.player.name)}
                            </span>
                            <span className="max-w-[45%] truncate text-xs text-muted">
                              {translateInjuryType(injury.player.reason, locale)}
                            </span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {(headToHead.length > 0 || hasForm) && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div
            className={`grid gap-6 ${
              headToHead.length > 0 && hasForm
                ? "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-0 lg:divide-x lg:divide-border lg:[&>*:first-child]:pr-6 lg:[&>*:last-child]:pl-6"
                : ""
            }`}
          >
            {hasForm && (
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("opponentFormTitle")}</h3>
                {(lastFixture || nextFixture) && (
                  <div className="mt-2 divide-y divide-border rounded-xl border border-border bg-background">
                    {lastFixture && lastOpponent && (
                      <Link
                        href={`/club/fixture/${lastFixture.fixture.id}`}
                        className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-sm transition-colors last:rounded-b-xl hover:bg-surface"
                      >
                        <span className="w-16 shrink-0 text-[11px] text-muted">{t("opponentLastMatchLabel")}</span>
                        <TeamCrest logo={lastOpponent.logo} className="h-4 w-4" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{lastOpponent.name}</span>
                          <span className="block truncate text-[10px] text-muted">
                            {venueOf(lastFixture)} · {leagueLabel(lastFixture.league.name, t)}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                            lastResult ? RESULT_TONE[lastResult] : "bg-border text-foreground"
                          }`}
                        >
                          {lastScore}
                        </span>
                      </Link>
                    )}
                    {nextFixture && nextOpponent && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="w-16 shrink-0 text-[11px] text-muted">{t("opponentNextMatchLabel")}</span>
                        <TeamCrest logo={nextOpponent.logo} className="h-4 w-4" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{nextOpponent.name}</span>
                          <span className="block truncate text-[10px] text-muted">
                            {venueOf(nextFixture)} · {leagueLabel(nextFixture.league.name, t)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {new Date(nextFixture.fixture.date).toLocaleDateString(locale, {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {stats && (
                  <div className="mt-4">
                    <SeasonStatsGrid t={t} stats={stats} />
                  </div>
                )}
              </div>
            )}

            {headToHead.length > 0 && (
              <div className="min-w-0">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t("headToHeadTitle")}</h3>
                <div className="mt-2 space-y-0.5">
                  {headToHead.map((fx) => {
                    const result = teamId ? matchResult(fx, teamId) : null;
                    return (
                      <Link
                        key={fx.fixture.id}
                        href={`/club/fixture/${fx.fixture.id}`}
                        className="block rounded-xl px-2.5 py-2 transition-colors hover:bg-background"
                      >
                        <div className="flex items-center gap-1 text-[10px] text-muted">
                          <span>{new Date(fx.fixture.date).toLocaleDateString(locale)}</span>
                          <span>·</span>
                          <TeamCrest logo={fx.league.logo} className="h-3 w-3" />
                          <span className="truncate">{leagueLabel(fx.league.name, t)}</span>
                        </div>
                        <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                          <span className="flex min-w-0 items-center justify-end gap-1.5">
                            <span className={`truncate ${fx.teams.home.id === teamId ? "font-semibold" : ""}`}>
                              {fx.teams.home.name}
                            </span>
                            <TeamCrest logo={fx.teams.home.logo} className="h-4 w-4" />
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                              result ? RESULT_TONE[result] : "bg-border text-foreground"
                            }`}
                          >
                            {fx.goals.home ?? "-"} - {fx.goals.away ?? "-"}
                          </span>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <TeamCrest logo={fx.teams.away.logo} className="h-4 w-4" />
                            <span className={`truncate ${fx.teams.away.id === teamId ? "font-semibold" : ""}`}>
                              {fx.teams.away.name}
                            </span>
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
