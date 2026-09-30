"use client";

import TeamCrest from "@/components/TeamCrest";

// The match header as one scoreboard card: a strip in each club's colour,
// crest + name either side, the score (once there is one) flanking the
// clock and its controls, and who this link is for.
export default function LiveScoreboard({
  roleLabel,
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeScore,
  awayScore,
  colors,
  children,
}: {
  roleLabel: string;
  homeName: string;
  awayName: string;
  homeLogo: string;
  awayLogo: string;
  // null before kick-off (no score to show yet).
  homeScore: number | null;
  awayScore: number | null;
  colors: { home: string; away: string };
  // The clock and its buttons.
  children: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
      <div aria-hidden className="flex h-1.5">
        <div className="flex-1 transition-colors duration-500" style={{ backgroundColor: colors.home }} />
        <div className="flex-1 transition-colors duration-500" style={{ backgroundColor: colors.away }} />
      </div>
      <div className="px-3 pb-4 pt-3 sm:px-6">
        <div className="flex justify-center">
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-medium text-accent">
            {roleLabel}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
          <Side name={homeName} logo={homeLogo} score={homeScore} align="left" />
          <div className="flex min-w-[7rem] justify-center">{children}</div>
          <Side name={awayName} logo={awayLogo} score={awayScore} align="right" />
        </div>
      </div>
    </div>
  );
}

function Side({
  name,
  logo,
  score,
  align,
}: {
  name: string;
  logo: string;
  score: number | null;
  align: "left" | "right";
}) {
  const team = (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <TeamCrest logo={logo} className="h-11 w-11 sm:h-14 sm:w-14" />
      <span className="max-w-full truncate text-center text-xs font-semibold sm:text-sm">{name}</span>
    </div>
  );
  const digit =
    score != null ? (
      <span className="shrink-0 text-4xl font-bold tabular-nums leading-none sm:text-5xl">{score}</span>
    ) : null;
  return (
    <div className={`flex min-w-0 items-center gap-3 sm:gap-5 ${align === "left" ? "justify-end" : "justify-start"}`}>
      {align === "left" ? (
        <>
          {team}
          {digit}
        </>
      ) : (
        <>
          {digit}
          {team}
        </>
      )}
    </div>
  );
}
