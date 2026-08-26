"use client";

import { useEffect, useState } from "react";
import { getLogoColor, resolveOpponentColor } from "@/lib/logoColor";

// Same crest-color extractor used across the club pages, applied to both
// sides at once — a faint side-to-side wash (home color fading in from the
// left, away color from the right) so the score card reads as "these two
// clubs" instead of a neutral, unbranded box.
export default function FixtureHeroAccent({
  homeLogo,
  awayLogo,
  className = "mt-4",
  children,
}: {
  homeLogo: string | null;
  awayLogo: string | null;
  className?: string;
  children: React.ReactNode;
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
  const style =
    homeColor && resolvedAway
      ? {
          backgroundImage: `linear-gradient(to right, ${homeColor}22, transparent 45%, transparent 55%, ${resolvedAway}22)`,
        }
      : undefined;

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm transition-colors duration-500 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
