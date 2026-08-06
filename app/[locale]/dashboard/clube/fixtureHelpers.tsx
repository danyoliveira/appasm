import type { Fixture } from "@/lib/api-football/client";

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

export function FixtureTeamsRow({
  home,
  away,
  center,
}: {
  home: { name: string; logo: string };
  away: { name: string; logo: string };
  center: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={home.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
        <span className="truncate">{home.name}</span>
      </div>
      <div className="shrink-0 whitespace-nowrap text-center">{center}</div>
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        <span className="truncate text-right">{away.name}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={away.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />
      </div>
    </div>
  );
}
