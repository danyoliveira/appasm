"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { WeightEntry } from "./PlayerBodyMetrics";

const WIDTH = 480;
const HEIGHT = 140;
const PAD_X = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

export default function PlayerWeightChart({ entries }: { entries: WeightEntry[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Oldest first, left to right.
  const points = useMemo(
    () => entries.slice().sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
    [entries],
  );

  if (points.length < 2) {
    return <p className="text-xs text-muted">{t("weightChartNotEnoughData")}</p>;
  }

  const dates = points.map((p) => new Date(p.recordedAt).getTime());
  const weights = points.map((p) => p.weightKg);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  // A little headroom above/below so the line/dots never touch the edge.
  const weightPad = Math.max((maxWeight - minWeight) * 0.15, 0.5);
  const yMin = minWeight - weightPad;
  const yMax = maxWeight + weightPad;

  const dateSpan = maxDate - minDate || 1;
  const weightSpan = yMax - yMin || 1;

  function xFor(dateMs: number) {
    return PAD_X + ((dateMs - minDate) / dateSpan) * (WIDTH - PAD_X * 2);
  }
  function yFor(weight: number) {
    return HEIGHT - PAD_BOTTOM - ((weight - yMin) / weightSpan) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  }

  const coords = points.map((p) => ({
    x: xFor(new Date(p.recordedAt).getTime()),
    y: yFor(p.weightKg),
    entry: p,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  // Two hairline gridlines (max/min of the padded range) — recessive, not
  // rounded to "nice" numbers since kg has no natural gridline step.
  const gridLines = [yMax, yMin];

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = ((e.clientX - rect.left) / rect.width) * WIDTH;
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
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {gridLines.map((w) => (
          <line
            key={w}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={yFor(w)}
            y2={yFor(w)}
            stroke="currentColor"
            className="text-border"
            strokeWidth={1}
          />
        ))}

        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={PAD_TOP}
            y2={HEIGHT - PAD_BOTTOM}
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

        {coords.map((c, i) => (
          <g key={c.entry.id}>
            {/* Surface-color ring so the dot stays legible crossing the line,
                plus a hit target well past the visible 8px marker. */}
            <circle cx={c.x} cy={c.y} r={9} className="fill-surface" />
            <circle cx={c.x} cy={c.y} r={4} className="fill-accent" />
            <circle
              cx={c.x}
              cy={c.y}
              r={12}
              fill="transparent"
              onPointerEnter={() => setHoverIndex(i)}
            />
          </g>
        ))}

        {/* Sparse direct labels: first and last point only. */}
        <text
          x={coords[0].x}
          y={HEIGHT - 6}
          textAnchor="start"
          className="fill-muted text-[9px]"
        >
          {new Date(points[0].recordedAt).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })}
        </text>
        <text
          x={coords[coords.length - 1].x}
          y={HEIGHT - 6}
          textAnchor="end"
          className="fill-muted text-[9px]"
        >
          {new Date(points[points.length - 1].recordedAt).toLocaleDateString(locale, {
            day: "2-digit",
            month: "2-digit",
          })}
        </text>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surface px-2 py-1 text-[11px] shadow-sm"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: `${(hovered.y / HEIGHT) * 100}%`,
          }}
        >
          <div className="font-semibold">{hovered.entry.weightKg} kg</div>
          <div className="text-muted">{new Date(hovered.entry.recordedAt).toLocaleDateString(locale)}</div>
        </div>
      )}
    </div>
  );
}
