"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

export interface ProgressionMatch {
  id: number;
  date: string;
  opponentName: string;
  isHome: boolean;
  goalsFor: number | null;
  goalsAgainst: number | null;
  result: "W" | "D" | "L" | null;
}

const RESULT_COLOR: Record<"W" | "D" | "L", string> = {
  W: "#16a34a",
  D: "#9ca3af",
  L: "#ef4444",
};

function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

// A compact "how are we doing lately" strip — the two charts below trade
// legibility for detail (rolling average, goal difference), so this stays
// as the at-a-glance summary: one dot per match, oldest to newest.
const FORM_STRIP_COUNT = 15;

export function FormStrip({ matches }: { matches: ProgressionMatch[] }) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const played = matches.filter((m): m is ProgressionMatch & { result: "W" | "D" | "L" } => m.result != null);
  const recent = played.slice(-FORM_STRIP_COUNT);

  if (recent.length === 0) {
    return <p className="text-xs text-muted">{t("progressionNotEnoughMatches")}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {recent.map((m) => (
        <div
          key={m.id}
          title={`${m.isHome ? "vs" : "@"} ${m.opponentName} · ${m.goalsFor}-${m.goalsAgainst} · ${fmtDate(m.date, locale)}`}
          className="h-3.5 w-3.5 shrink-0 rounded-full"
          style={{ backgroundColor: RESULT_COLOR[m.result] }}
        />
      ))}
    </div>
  );
}

const LINE_WIDTH = 640;
const LINE_HEIGHT = 180;
const LINE_PAD_X = 14;
const LINE_PAD_TOP = 16;
const LINE_PAD_BOTTOM = 24;
const ROLLING_WINDOW = 5;

// Cumulative points only ever goes up (a bad run just makes it climb
// slower), which reads as permanent improvement even mid-slump. A rolling
// average over the last few games actually falls when form dips, which is
// the whole point of a "progression" view.
export function RollingFormChart({ matches }: { matches: ProgressionMatch[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = useMemo(() => {
    const played = matches.filter((m): m is ProgressionMatch & { result: "W" | "D" | "L" } => m.result != null);
    return played.map((m, i) => {
      const windowStart = Math.max(0, i - ROLLING_WINDOW + 1);
      const window = played.slice(windowStart, i + 1);
      const totalPoints = window.reduce((sum, w) => sum + (w.result === "W" ? 3 : w.result === "D" ? 1 : 0), 0);
      return { ...m, average: totalPoints / window.length, windowSize: window.length };
    });
  }, [matches]);

  if (points.length < 2) {
    return <p className="text-xs text-muted">{t("progressionNotEnoughMatches")}</p>;
  }

  function xFor(index: number) {
    return points.length === 1
      ? LINE_WIDTH / 2
      : LINE_PAD_X + (index / (points.length - 1)) * (LINE_WIDTH - LINE_PAD_X * 2);
  }
  // Fixed 0-3 domain — points per game has a natural, meaningful range
  // (0 = nothing, 3 = maximum), unlike something with no fixed scale.
  function yFor(value: number) {
    return LINE_HEIGHT - LINE_PAD_BOTTOM - (value / 3) * (LINE_HEIGHT - LINE_PAD_TOP - LINE_PAD_BOTTOM);
  }

  const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.average), match: p }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * LINE_WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex != null ? coords[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
        className="w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {[0, 3].map((value) => (
          <line
            key={value}
            x1={LINE_PAD_X}
            x2={LINE_WIDTH - LINE_PAD_X}
            y1={yFor(value)}
            y2={yFor(value)}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />
        ))}

        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={LINE_PAD_TOP}
            y2={LINE_HEIGHT - LINE_PAD_BOTTOM}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />
        )}

        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          className="text-accent"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((c) => (
          <g key={c.match.id}>
            <circle cx={c.x} cy={c.y} r={6} className="fill-surface" />
            <circle cx={c.x} cy={c.y} r={3} fill={RESULT_COLOR[c.match.result]} />
            <circle
              cx={c.x}
              cy={c.y}
              r={10}
              fill="transparent"
              onPointerEnter={() => setHoverIndex(coords.indexOf(c))}
            />
          </g>
        ))}

        <text x={LINE_PAD_X} y={yFor(3) - 4} textAnchor="start" className="fill-muted text-[9px]">
          3 {t("progressionPointsPerGameShort")}
        </text>
        <text x={LINE_PAD_X} y={yFor(0) - 4} textAnchor="start" className="fill-muted text-[9px]">
          0
        </text>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] shadow-sm"
          style={{
            left: `${(hovered.x / LINE_WIDTH) * 100}%`,
            top: `${(hovered.y / LINE_HEIGHT) * 100}%`,
          }}
        >
          <div className="font-semibold">
            {hovered.match.isHome ? "vs" : "@"} {hovered.match.opponentName}
          </div>
          <div className="text-muted">
            {hovered.match.goalsFor ?? "-"}-{hovered.match.goalsAgainst ?? "-"} ·{" "}
            {new Date(hovered.match.date).toLocaleDateString(locale)}
          </div>
          <div className="text-muted">
            {t("progressionRollingAverageLabel", {
              count: hovered.match.windowSize,
              value: hovered.match.average.toFixed(1),
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const BAR_WIDTH = 640;
const BAR_HEIGHT = 160;
const BAR_PAD_X = 14;
const BAR_PAD_TOP = 14;
const BAR_PAD_BOTTOM = 14;

// Goal difference per match — the rolling chart shows the results trend,
// this shows whether it's being driven by scoring more or conceding less.
export function GoalDifferenceChart({ matches }: { matches: ProgressionMatch[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const played = useMemo(
    () =>
      matches.filter(
        (m): m is ProgressionMatch & { goalsFor: number; goalsAgainst: number } =>
          m.goalsFor != null && m.goalsAgainst != null,
      ),
    [matches],
  );

  if (played.length < 2) {
    return <p className="text-xs text-muted">{t("progressionNotEnoughMatches")}</p>;
  }

  const margins = played.map((m) => m.goalsFor - m.goalsAgainst);
  const maxAbs = Math.max(...margins.map((m) => Math.abs(m)), 1);

  const barGap = 2;
  const barWidth = Math.min(24, (BAR_WIDTH - BAR_PAD_X * 2) / played.length - barGap);
  const usableWidth = BAR_WIDTH - BAR_PAD_X * 2;
  const step = usableWidth / played.length;
  const zeroY = BAR_PAD_TOP + (BAR_HEIGHT - BAR_PAD_TOP - BAR_PAD_BOTTOM) / 2;
  const halfHeight = (BAR_HEIGHT - BAR_PAD_TOP - BAR_PAD_BOTTOM) / 2;

  function yForMargin(margin: number) {
    return zeroY - (margin / maxAbs) * halfHeight;
  }

  const bars = played.map((m, i) => {
    const margin = m.goalsFor - m.goalsAgainst;
    const x = BAR_PAD_X + i * step + (step - barWidth) / 2;
    const y = margin >= 0 ? yForMargin(margin) : zeroY;
    const height = Math.abs(yForMargin(margin) - zeroY);
    return { match: m, margin, x, y, height };
  });

  const hovered = hoverIndex != null ? bars[hoverIndex] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`} className="w-full touch-none">
        <line
          x1={BAR_PAD_X}
          x2={BAR_WIDTH - BAR_PAD_X}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />
        {bars.map((b, i) => (
          <rect
            key={b.match.id}
            x={b.x}
            y={b.y}
            width={barWidth}
            height={Math.max(b.height, 1.5)}
            rx={1.5}
            fill={b.margin > 0 ? "#16a34a" : b.margin < 0 ? "#ef4444" : "#9ca3af"}
            onPointerEnter={() => setHoverIndex(i)}
            onPointerLeave={() => setHoverIndex(null)}
          />
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] shadow-sm"
          style={{
            left: `${((hovered.x + barWidth / 2) / BAR_WIDTH) * 100}%`,
            top: hovered.margin >= 0 ? `${(hovered.y / BAR_HEIGHT) * 100}%` : undefined,
            bottom: hovered.margin < 0 ? `${100 - ((hovered.y + hovered.height) / BAR_HEIGHT) * 100}%` : undefined,
            transform: hovered.margin >= 0 ? "translate(-50%, -100%)" : "translate(-50%, 100%)",
          }}
        >
          <div className="font-semibold">
            {hovered.match.isHome ? "vs" : "@"} {hovered.match.opponentName}
          </div>
          <div className="text-muted">
            {hovered.match.goalsFor}-{hovered.match.goalsAgainst} · {fmtDate(hovered.match.date, locale)}
          </div>
        </div>
      )}
    </div>
  );
}
