"use client";

import { useEffect, useState } from "react";
import { contrastTextColor, getLogoColor } from "@/lib/logoColor";

// The dashboard's own "hero" for whichever club is loaded — a solid wash
// of the club's crest color (reusing the same extractor built for the
// tactical board's team pins, lib/logoColor.ts) with the crest itself on
// top, so this one card feels unmistakably like "this club." The rest of
// the app's interactive palette (buttons, links, focus rings) stays the
// tested, accessible default everywhere else — only this card's
// background/text swap, and always together via contrastTextColor, so
// text stays readable regardless of how light or dark the crest is.
export default function ClubHeaderAccent({
  logoUrl,
  stats,
  children,
}: {
  logoUrl: string | null;
  stats?: { label: string; value: string | number }[];
  children: React.ReactNode;
}) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    getLogoColor(logoUrl).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  const textColor = color ? contrastTextColor(color) : undefined;

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm transition-colors duration-500"
      style={color ? { background: color, borderColor: color, color: textColor } : undefined}
    >
      {logoUrl && (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/90 p-2 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" className="h-full w-full object-contain" />
        </span>
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
