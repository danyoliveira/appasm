import { Link } from "@/i18n/navigation";
import type { Fixture } from "@/lib/api-football/client";
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

export function toCalendarRow(fx: Fixture, teamId: number): CalendarRow {
  const isHome = fx.teams.home.id === teamId;
  const opponent = isHome ? fx.teams.away : fx.teams.home;
  return {
    id: fx.fixture.id,
    date: fx.fixture.date,
    opponent: { id: opponent.id, name: opponent.name, logo: opponent.logo },
    competition: { name: fx.league.name, logo: fx.league.logo },
    isHome,
    result: matchResult(fx, teamId),
    goalsFor: isHome ? fx.goals.home : fx.goals.away,
    goalsAgainst: isHome ? fx.goals.away : fx.goals.home,
    finished: fx.goals.home != null && fx.goals.away != null,
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
