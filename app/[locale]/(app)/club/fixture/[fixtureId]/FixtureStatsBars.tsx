"use client";

import { useEffect, useState } from "react";
import { getLogoColor, resolveOpponentColor } from "@/lib/logoColor";

export interface StatBarRow {
  type: string;
  label: string;
  homeDisplay: string;
  awayDisplay: string;
  homeNum: number;
  awayNum: number;
  // Rate stats that don't share a whole (e.g. pass accuracy: two
  // independent 0-100 values, not a split of one total) — a single
  // proportional bar between them would misleadingly imply they sum to
  // 100%, so each gets its own 0-100 track instead.
  independentPercent?: boolean;
}

export interface StatSection {
  title: string;
  rows: StatBarRow[];
}

export default function FixtureStatsBars({
  homeLogo,
  awayLogo,
  headline,
  sections,
}: {
  homeLogo: string;
  awayLogo: string;
  headline: StatBarRow[];
  sections: StatSection[];
}) {
  const [homeColor, setHomeColor] = useState<string | null>(null);
  const [awayColor, setAwayColor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLogoColor(homeLogo), getLogoColor(awayLogo)]).then(([h, a]) => {
      if (!cancelled) {
        setHomeColor(h);
        setAwayColor(a);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [homeLogo, awayLogo]);

  const resolvedAway = homeColor && awayColor ? resolveOpponentColor(homeColor, awayColor) : null;

  function renderRow(row: StatBarRow, size: "lg" | "sm") {
    const textSize = size === "lg" ? "text-sm" : "text-xs";
    const valueWeight = size === "lg" ? "font-bold" : "font-semibold";
    const barHeight = size === "lg" ? "h-2.5" : "h-1.5";

    return (
      <div key={row.type}>
        <div className={`flex items-center justify-between ${textSize}`}>
          <span className={valueWeight}>{row.homeDisplay}</span>
          <span className="text-muted">{row.label}</span>
          <span className={valueWeight}>{row.awayDisplay}</span>
        </div>

        {row.independentPercent ? (
          <div className="mt-1 space-y-1">
            <div className={`overflow-hidden rounded-full bg-background ${barHeight}`}>
              <div
                className={`h-full ${homeColor ? "" : "bg-accent"}`}
                style={{ width: `${Math.min(row.homeNum, 100)}%`, background: homeColor ?? undefined }}
              />
            </div>
            <div className={`overflow-hidden rounded-full bg-background ${barHeight}`}>
              <div
                className={`h-full ${resolvedAway ? "" : "bg-muted"}`}
                style={{ width: `${Math.min(row.awayNum, 100)}%`, background: resolvedAway ?? undefined }}
              />
            </div>
          </div>
        ) : (
          <div className={`mt-1 flex overflow-hidden rounded-full bg-background ${barHeight}`}>
            <div
              className={homeColor ? undefined : "bg-accent"}
              style={{
                width: `${(row.homeNum / (row.homeNum + row.awayNum || 1)) * 100}%`,
                background: homeColor ?? undefined,
              }}
            />
            <div
              className={resolvedAway ? undefined : "bg-muted"}
              style={{
                width: `${(row.awayNum / (row.homeNum + row.awayNum || 1)) * 100}%`,
                background: resolvedAway ?? undefined,
              }}
            />
          </div>
        )}
      </div>
    );
  }

  const visibleSections = sections.filter((s) => s.rows.length > 0);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={homeLogo} alt="" className="h-5 w-5 object-contain" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={awayLogo} alt="" className="h-5 w-5 object-contain" />
      </div>

      {headline.length > 0 && (
        <div className="mt-4 space-y-4">{headline.map((row) => renderRow(row, "lg"))}</div>
      )}

      {visibleSections.map((section) => (
        <div key={section.title} className="mt-5 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {section.title}
          </h3>
          <div className="mt-3 space-y-2.5">{section.rows.map((row) => renderRow(row, "sm"))}</div>
        </div>
      ))}
    </div>
  );
}
