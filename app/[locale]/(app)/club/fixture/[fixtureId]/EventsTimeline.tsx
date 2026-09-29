"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import type { FixtureEvent } from "@/lib/api-football/client";
import { shortenPlayerName } from "../../playerShared";
import { eventIcon, eventTooltipLine, formatMinute, translateEventDetail } from "./eventUtils";

// The match as it happened, compact by default: a 0'–90' strip with each
// team's events at their minute (home above the line, away below — hover
// for the detail) and each side's scorers underneath. "Ver cronologia
// completa" opens the full minute-by-minute list.
export default function EventsTimeline({
  events,
  homeTeamId,
  homeName,
  awayName,
  locale,
  labels,
}: {
  events: FixtureEvent[];
  homeTeamId: number;
  homeName: string;
  awayName: string;
  locale: Locale;
  labels: { title: string; assist: string; halfTime: string; showAll: string; showLess: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = events
    .filter((e) => e.type === "Goal" || e.type === "Card" || e.type === "subst" || e.type === "Var")
    .slice()
    .sort((a, b) => a.time.elapsed - b.time.elapsed || (a.time.extra ?? 0) - (b.time.extra ?? 0));
  if (!shown.length) return null;

  const name = (n: string | null) => (n ? shortenPlayerName(n) : "—");
  const isHomeEvent = (e: FixtureEvent) => e.team.id === homeTeamId;
  const minuteOf = (e: FixtureEvent) => e.time.elapsed + (e.time.extra ?? 0);
  const end = Math.max(90, ...shown.map(minuteOf));
  const x = (m: number) => `${(Math.min(m, end) / end) * 100}%`;
  const scored = (e: FixtureEvent) => e.type === "Goal" && e.detail !== "Missed Penalty";

  // Markers close in time stack instead of overlapping.
  function withLanes(list: FixtureEvent[]) {
    const lastAt: number[] = [];
    return list.map((e) => {
      const m = minuteOf(e);
      let lane = lastAt.findIndex((prev) => m - prev >= 4);
      if (lane === -1) lane = lastAt.length;
      lastAt[lane] = m;
      return { e, lane };
    });
  }
  const homeMarkers = withLanes(shown.filter(isHomeEvent));
  const awayMarkers = withLanes(shown.filter((e) => !isHomeEvent(e)));
  const lanes = Math.max(1, ...homeMarkers.map((m) => m.lane + 1), ...awayMarkers.map((m) => m.lane + 1));
  const laneHeight = 22;

  function marker({ e, lane }: { e: FixtureEvent; lane: number }, side: "home" | "away", i: number) {
    const offset = 10 + lane * laneHeight;
    return (
      <span
        key={`${side}-${i}`}
        title={`${eventTooltipLine(e, locale, labels.assist)} — ${name(e.player.name)}`}
        className={`absolute flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-[10px] leading-none shadow-sm ring-1 ${
          scored(e) ? "z-10 bg-accent text-accent-foreground ring-accent" : "bg-surface ring-border"
        }`}
        style={{ left: x(minuteOf(e)), [side === "home" ? "bottom" : "top"]: `calc(50% + ${offset}px)` }}
      >
        {eventIcon(e.type, e.detail)}
      </span>
    );
  }

  function scorers(home: boolean) {
    const goals = shown.filter((e) => scored(e) && isHomeEvent(e) === home);
    if (!goals.length) return <span className="text-muted">—</span>;
    return goals.map((g, i) => (
      <span key={i}>
        {i > 0 && ", "}
        {name(g.player.name)} <span className="tabular-nums text-muted">{formatMinute(g)}</span>
        {g.detail === "Own Goal" && <span className="text-muted"> ({translateEventDetail(g.detail, locale)})</span>}
      </span>
    ));
  }

  function describe(e: FixtureEvent) {
    if (e.type === "subst") {
      // API-Football: player = who went off, assist = who came on.
      return (
        <>
          <span className="font-medium text-green-700 dark:text-green-400">▲ {name(e.assist.name)}</span>{" "}
          <span className="text-muted">▼ {name(e.player.name)}</span>
        </>
      );
    }
    if (e.type === "Goal") {
      return (
        <>
          <span className="font-semibold">{name(e.player.name)}</span>
          {e.detail !== "Normal Goal" && <span className="text-muted"> · {translateEventDetail(e.detail, locale)}</span>}
          {e.assist.name && (
            <span className="text-muted">
              {" "}
              ({labels.assist}: {name(e.assist.name)})
            </span>
          )}
        </>
      );
    }
    return (
      <>
        <span className="font-medium">{name(e.player.name)}</span>
        <span className="text-muted"> · {translateEventDetail(e.detail, locale)}</span>
      </>
    );
  }

  const secondHalfStart = shown.findIndex((e) => e.time.elapsed > 45);
  const stripHeight = 2 * (10 + lanes * laneHeight) + 8;

  return (
    <section className="mt-10 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{labels.title}</h2>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-medium text-accent hover:underline"
        >
          {expanded ? labels.showLess : labels.showAll}
        </button>
      </div>

      {/* The strip, centred: home above the line, away below. */}
      <div className="mx-auto mt-4 max-w-3xl">
        <div className="flex items-center justify-center gap-2 text-[11px] font-semibold">
          <span aria-hidden className="h-2 w-2 rounded-full bg-foreground/70" />
          <span className="truncate">{homeName}</span>
        </div>
        <div className="relative mx-3" style={{ height: stripHeight }}>
          <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
          {[0, 45, 90].map((m) => (
            <span
              key={m}
              className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-muted/50"
              style={{ left: x(m) }}
            />
          ))}
          <span
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-surface px-1 text-[9px] font-semibold tabular-nums text-muted"
            style={{ left: x(45) }}
          >
            45&apos;
          </span>
          {homeMarkers.map((m, i) => marker(m, "home", i))}
          {awayMarkers.map((m, i) => marker(m, "away", i))}
          <span className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2 pr-1.5 text-[9px] tabular-nums text-muted">0&apos;</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-1.5 text-[9px] tabular-nums text-muted">
            {end}&apos;
          </span>
        </div>
        <div className="flex items-center justify-center gap-2 text-[11px] font-semibold">
          <span aria-hidden className="h-2 w-2 rounded-full border border-foreground/60" />
          <span className="truncate">{awayName}</span>
        </div>
      </div>

      {/* Scorers */}
      {/* Scorers, mirrored around the centre like a scoreboard. */}
      <div className="mx-auto mt-3 grid max-w-3xl grid-cols-[1fr_auto_1fr] items-start gap-3 border-t border-border pt-3 text-xs">
        <p className="min-w-0 text-right">
          <span className="font-semibold">{homeName}</span>
          <br />
          {scorers(true)}
        </p>
        <span aria-hidden className="pt-1 text-sm">⚽</span>
        <p className="min-w-0">
          <span className="font-semibold">{awayName}</span>
          <br />
          {scorers(false)}
        </p>
      </div>

      {expanded && (
        <ol className="relative mt-4 space-y-1.5 border-t border-border pt-4">
          <span aria-hidden className="absolute bottom-0 left-1/2 top-4 w-px -translate-x-1/2 bg-border" />
          {shown.map((e, i) => {
            const isHome = isHomeEvent(e);
            return (
              <li key={i}>
                {i === secondHalfStart && i > 0 && (
                  <div className="relative my-2 flex justify-center">
                    <span className="rounded-full bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-border">
                      {labels.halfTime}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                  <div className="min-w-0 text-right">{isHome && <span className="break-words">{describe(e)}</span>}</div>
                  <span
                    className={`relative z-10 flex h-7 min-w-[3.25rem] items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums ring-1 ${
                      scored(e) ? "bg-accent text-accent-foreground ring-accent" : "bg-background ring-border"
                    }`}
                  >
                    <span aria-hidden>{eventIcon(e.type, e.detail)}</span>
                    {formatMinute(e)}
                  </span>
                  <div className="min-w-0">{!isHome && <span className="break-words">{describe(e)}</span>}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
