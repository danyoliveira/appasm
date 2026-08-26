"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { FixtureEvent, FixtureLineup } from "@/lib/api-football/client";
import { contrastTextColor, getLogoColor } from "@/lib/logoColor";
import { eventIcon, eventTooltipLine, playerEvents } from "./eventUtils";
import { shortenPlayerName } from "../../playerShared";

export default function LineupSubsList({
  lineup,
  events,
  locale,
  assistLabel,
}: {
  lineup: FixtureLineup;
  events: FixtureEvent[];
  locale: Locale;
  assistLabel: string;
}) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLogoColor(lineup.team.logo).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [lineup.team.logo]);

  const badgeStyle = color ? { background: color, color: contrastTextColor(color) } : undefined;

  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {lineup.substitutes.map((p) => {
        const evts = playerEvents(p.player.id, events);
        return (
          <Link
            key={p.player.id}
            href={`/club/player/${p.player.id}`}
            className="group relative flex items-center gap-1.5 rounded-full bg-background px-2 py-1 text-xs transition-colors hover:bg-border"
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-border text-[10px] font-bold"
              style={badgeStyle}
            >
              {p.player.number}
            </span>
            <span className="truncate">{shortenPlayerName(p.player.name)}</span>
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
                  <span key={idx}>{eventTooltipLine(ev, locale, assistLabel, p.player.id)}</span>
                ))}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
