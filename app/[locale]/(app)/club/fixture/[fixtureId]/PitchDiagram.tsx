import type { FixtureEvent, FixtureLineup } from "@/lib/api-football/client";
import type { Locale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { eventIcon, eventTooltipLine, playerEvents } from "./eventUtils";
import { shortenPlayerName } from "../../playerShared";
import TeamCrest from "@/components/TeamCrest";

function parseGrid(grid: string | null): [number, number] | null {
  if (!grid) return null;
  const parts = grid.split(":").map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  return [parts[0], parts[1]];
}

function TeamPlayers({
  lineup,
  side,
  events,
  locale,
  assistLabel,
  isLinkable,
}: {
  lineup: FixtureLineup;
  side: "home" | "away";
  events: FixtureEvent[];
  locale: Locale;
  assistLabel: string;
  isLinkable: (playerId: number) => boolean;
}) {
  const rows = new Map<number, FixtureLineup["startXI"]>();
  lineup.startXI.forEach((p) => {
    const parsed = parseGrid(p.player.grid);
    if (!parsed) return;
    const [row] = parsed;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(p);
  });

  const rowNumbers = Array.from(rows.keys()).sort((a, b) => a - b);
  const maxRow = Math.max(...rowNumbers, 1);

  return (
    <>
      {rowNumbers.map((row) =>
        rows
          .get(row)!
          .slice()
          .sort((a, b) => (parseGrid(a.player.grid)?.[1] ?? 0) - (parseGrid(b.player.grid)?.[1] ?? 0))
          .map((p, idx, arr) => {
            const horizontalPct = ((idx + 1) / (arr.length + 1)) * 100;
            const outfieldLines = Math.max(maxRow - 1, 1);
            const lineT = row === 1 ? 0 : (row - 2) / Math.max(outfieldLines - 1, 1);
            const verticalPct =
              row === 1
                ? side === "home"
                  ? 94
                  : 6
                : side === "home"
                  ? 80 - lineT * 26
                  : 20 + lineT * 26;
            const isGK = p.player.pos === "G";
            const evts = playerEvents(p.player.id, events);
            const content = (
              <>
                <div className="relative">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow ring-2 ${
                      side === "home" ? "bg-white text-black" : "bg-slate-900 text-white"
                    } ${isGK ? "ring-yellow-400" : side === "home" ? "ring-black/10" : "ring-white/40"}`}
                  >
                    {p.player.number}
                  </div>
                  {evts.length > 0 && (
                    <div className="absolute -right-2 -top-2 flex -space-x-1">
                      {evts.slice(0, 3).map((ev, idx) => (
                        <span
                          key={idx}
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[9px] leading-none ring-1 ring-white/60"
                        >
                          {eventIcon(ev.type, ev.detail)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="mt-1.5 max-w-[66px] truncate rounded bg-black/60 px-1 text-center text-[9px] font-medium text-white">
                  {shortenPlayerName(p.player.name)}
                </span>
                {evts.length > 0 && (
                  <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 flex-col gap-0.5 whitespace-nowrap rounded-md bg-black/90 px-2 py-1.5 text-[10px] text-white shadow-lg group-hover:flex">
                    {evts.map((ev, idx) => (
                      <span key={idx}>{eventTooltipLine(ev, locale, assistLabel, p.player.id)}</span>
                    ))}
                  </div>
                )}
              </>
            );
            const className =
              "group absolute z-0 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center hover:z-50";
            const style = { left: `${horizontalPct}%`, top: `${verticalPct}%` };
            // Players without a page of their own (e.g. an ASM Live Mode
            // opponent typed by name) aren't links.
            return isLinkable(p.player.id) ? (
              <Link key={p.player.id} href={`/club/player/${p.player.id}`} className={className} style={style}>
                {content}
              </Link>
            ) : (
              <div key={p.player.id} className={className} style={style}>
                {content}
              </div>
            );
          }),
      )}
    </>
  );
}

function CornerArcs() {
  const corners = [
    "left-0 top-0 rounded-br-full border-b border-r",
    "right-0 top-0 rounded-bl-full border-b border-l",
    "left-0 bottom-0 rounded-tr-full border-t border-r",
    "right-0 bottom-0 rounded-tl-full border-t border-l",
  ];
  return (
    <>
      {corners.map((cls, i) => (
        <div key={i} className={`absolute h-3 w-3 border-white/30 ${cls}`} />
      ))}
    </>
  );
}

function GoalMouth({ position }: { position: "top" | "bottom" }) {
  return (
    <div
      className={`absolute left-1/2 h-[3px] w-[16%] -translate-x-1/2 bg-white/70 ${
        position === "top" ? "top-0" : "bottom-0"
      }`}
    />
  );
}

function PenaltyArea({ position }: { position: "top" | "bottom" }) {
  const isTop = position === "top";
  return (
    <>
      <div
        className={`absolute left-1/2 h-[18%] w-[62%] -translate-x-1/2 border border-white/30 ${
          isTop ? "top-0" : "bottom-0"
        }`}
      />
      <div
        className={`absolute left-1/2 h-[7%] w-[32%] -translate-x-1/2 border border-white/30 ${
          isTop ? "top-0" : "bottom-0"
        }`}
      />
      <div
        className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/50"
        style={{ top: isTop ? "13%" : undefined, bottom: isTop ? undefined : "13%" }}
      />
    </>
  );
}

function TeamLabel({ lineup, align, side }: { lineup: FixtureLineup; align: "left" | "right"; side: "home" | "away" }) {
  const className = `flex items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`;
  const content = (
    <>
      {/* Same look as this team's tokens on the pitch (home white at the
          bottom, away dark at the top), so it's clear which is which. */}
      <span
        aria-hidden
        className={`h-3.5 w-3.5 shrink-0 rounded-full ring-2 ${
          side === "home" ? "bg-white ring-black/20" : "bg-slate-900 ring-white/40"
        }`}
      />
      <TeamCrest logo={lineup.team.logo} className="h-6 w-6" />
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold">{lineup.team.name}</p>
        <p className="text-[11px] text-muted">{lineup.formation}</p>
      </div>
    </>
  );
  // A club outside API-Football (typed by hand) has no page to open.
  return lineup.team.id > 0 ? (
    <Link href={`/club/${lineup.team.id}`} className={`${className} hover:text-accent`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export default function PitchDiagram({
  home,
  away,
  events = [],
  locale,
  assistLabel,
  linkablePlayerIds,
}: {
  home: FixtureLineup | undefined;
  away: FixtureLineup | undefined;
  events?: FixtureEvent[];
  locale: Locale;
  assistLabel: string;
  // Only these players get a link to their page; omitted = every player
  // (API-Football lineups, where every id is a real player).
  linkablePlayerIds?: number[];
}) {
  if (!home || !away) return null;
  const linkable = linkablePlayerIds ? new Set(linkablePlayerIds) : null;
  const isLinkable = (id: number) => !linkable || linkable.has(id);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1">
        <TeamLabel lineup={home} align="left" side="home" />
        <TeamLabel lineup={away} align="right" side="away" />
      </div>

      <div className="relative mx-auto mt-3 aspect-[3/4.4] w-full max-w-lg">
        <div
          className="absolute inset-0 overflow-hidden rounded-xl shadow-inner"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, #2f7d32 0%, #2f7d32 10%, #34893a 10%, #34893a 20%)",
          }}
        >
          <div className="absolute inset-3 rounded-md border border-white/25">
            <CornerArcs />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/25" />
            <div className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
            <PenaltyArea position="top" />
            <PenaltyArea position="bottom" />
            <GoalMouth position="top" />
            <GoalMouth position="bottom" />
          </div>
        </div>
        <div className="absolute inset-3">
          <TeamPlayers lineup={home} side="home" events={events} locale={locale} assistLabel={assistLabel} isLinkable={isLinkable} />
          <TeamPlayers lineup={away} side="away" events={events} locale={locale} assistLabel={assistLabel} isLinkable={isLinkable} />
        </div>
      </div>
    </div>
  );
}
