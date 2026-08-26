"use client";

import { useEffect, useState } from "react";
import { contrastTextColor, getLogoColor } from "@/lib/logoColor";

// Same treatment as the club header (ClubHeaderAccent): a solid wash of the
// player's current club color, with the headline season stats folded into
// the same card — consistent identity across dashboard, club and player
// pages instead of a one-off subtle tint here.
export default function PlayerHero({
  clubLogoUrl,
  photoUrl,
  number,
  stats,
  children,
}: {
  clubLogoUrl: string | null;
  photoUrl: string | null | undefined;
  number: number | null | undefined;
  stats?: { label: string; value: string | number }[];
  children: React.ReactNode;
}) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!clubLogoUrl) return;
    let cancelled = false;
    getLogoColor(clubLogoUrl).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [clubLogoUrl]);

  const textColor = color ? contrastTextColor(color) : undefined;
  const badgeStyle = color ? { background: color, color: textColor } : undefined;

  return (
    <div
      className="mt-4 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-surface p-6 shadow-sm transition-colors duration-500"
      style={color ? { background: color, borderColor: color, color: textColor } : undefined}
    >
      {photoUrl && (
        <div className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoUrl}
            alt=""
            className="h-24 w-24 rounded-full object-cover ring-4 ring-background shadow-md"
          />
          {number != null && (
            <span
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground ring-4 ring-surface"
              style={badgeStyle}
            >
              {number}
            </span>
          )}
        </div>
      )}

      <div className="min-w-0">{children}</div>

      {stats && stats.length > 0 && (
        <div className="ml-auto flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-current/15 pt-3 sm:w-auto sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-base font-semibold leading-tight">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wide opacity-70">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
