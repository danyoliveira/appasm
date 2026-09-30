import { Link } from "@/i18n/navigation";
import type { Fixture } from "@/lib/api-football/client";
import { hasNoRealDate } from "@/lib/api-football/fixtureStatus";
import type { CalendarRow } from "./FixtureCalendar";

export function matchResult(fixture: Fixture, teamId: number): "W" | "D" | "L" | null {
  const { home, away } = fixture.goals;
  if (home == null || away == null) return null;
  const isHome = fixture.teams.home.id === teamId;
  const ours = isHome ? home : away;
  const theirs = isHome ? away : home;
  if (ours > theirs) return "W";
  if (ours < theirs) return "L";
  return "D";
}

// `t`, when given, puts the competition name in the app's language
// ("Friendlies Clubs" → "Amigável").
export function toCalendarRow(fx: Fixture, teamId: number, t?: (key: string) => string): CalendarRow {
  const isHome = fx.teams.home.id === teamId;
  const opponent = isHome ? fx.teams.away : fx.teams.home;
  return {
    id: fx.fixture.id,
    date: fx.fixture.date,
    opponent: { id: opponent.id, name: opponent.name, logo: opponent.logo },
    competition: { name: t ? leagueLabel(fx.league.name, t) : fx.league.name, logo: fx.league.logo },
    isHome,
    result: matchResult(fx, teamId),
    goalsFor: isHome ? fx.goals.home : fx.goals.away,
    goalsAgainst: isHome ? fx.goals.away : fx.goals.home,
    finished: fx.goals.home != null && fx.goals.away != null,
    postponed: hasNoRealDate(fx),
  };
}

export function FixtureTeamsRow({
  home,
  away,
  center,
}: {
  home: { id: number; name: string; logo: string };
  away: { id: number; name: string; logo: string };
  center: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      <Link
        href={`/club/${home.id}`}
        className="flex min-w-0 items-center gap-1.5 hover:text-accent"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={home.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
        <span className="truncate">{home.name}</span>
      </Link>
      <div className="shrink-0 whitespace-nowrap text-center">{center}</div>
      <Link
        href={`/club/${away.id}`}
        className="flex min-w-0 items-center justify-end gap-1.5 hover:text-accent"
      >
        <span className="truncate text-right">{away.name}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={away.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
      </Link>
    </div>
  );
}

// API-Football's round names are English ("Regular Season - 7", "League
// Stage - 3"); the numbered ones become "Jornada 7" in the app's language,
// anything else (knockout rounds) is left as is.
export function translateRound(round: string | null | undefined, t: (key: string, values?: Record<string, number>) => string): string {
  if (!round) return "";
  const match = round.match(/^(?:Regular Season|League Stage|Group Stage|Apertura|Clausura)\s*-\s*(\d+)$/i);
  return match ? t("roundMatchday", { n: Number(match[1]) }) : round;
}

// API-Football's short match status → the app's own label.
const STATUS_KEYS: Record<string, string> = {
  FT: "fixtureStatusFinished",
  AET: "fixtureStatusAfterExtraTime",
  PEN: "fixtureStatusAfterPenalties",
  NS: "fixtureStatusNotStarted",
  TBD: "fixtureStatusNotStarted",
  "1H": "fixtureStatusLive",
  "2H": "fixtureStatusLive",
  ET: "fixtureStatusLive",
  BT: "fixtureStatusLive",
  P: "fixtureStatusLive",
  LIVE: "fixtureStatusLive",
  HT: "fixtureStatusHalfTime",
  PST: "fixtureStatusPostponed",
  CANC: "fixtureStatusCancelled",
  ABD: "fixtureStatusAbandoned",
  SUSP: "fixtureStatusSuspended",
  INT: "fixtureStatusSuspended",
  AWD: "fixtureStatusFinished",
  WO: "fixtureStatusFinished",
};
export function fixtureStatusLabel(status: { short: string; long: string }, t: (key: string) => string): string {
  const key = STATUS_KEYS[status.short];
  return key ? t(key) : status.long;
}

// API-Football names club friendlies "Friendlies Clubs" — say it in the
// app's language; real competitions keep their own name.
export function leagueLabel(name: string, t: (key: string) => string): string {
  return /^friendlies/i.test(name) ? t("manualMatchFriendly") : name;
}
