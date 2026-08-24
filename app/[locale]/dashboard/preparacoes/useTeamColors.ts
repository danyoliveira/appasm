"use client";

import { useEffect, useState } from "react";
import { contrastTextColor, getLogoColor, resolveOpponentColor } from "@/lib/logoColor";

export interface TeamColors {
  usColor: string;
  usTextColor: string;
  opponentColor: string;
  opponentTextColor: string;
}

// Starting colors match the board's original fixed scheme (red for us,
// dark slate for the opponent) so there's no visible flash while the crest
// colors are still being extracted.
const DEFAULT_COLORS: TeamColors = {
  usColor: "#dc2626",
  usTextColor: "#ffffff",
  opponentColor: "#0f172a",
  opponentTextColor: "#ffffff",
};

export function useTeamColors(ourLogo?: string, opponentLogo?: string): TeamColors {
  const [colors, setColors] = useState<TeamColors>(DEFAULT_COLORS);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLogoColor(ourLogo), getLogoColor(opponentLogo)]).then(([us, opponentRaw]) => {
      if (cancelled) return;
      const opponent = resolveOpponentColor(us, opponentRaw);
      setColors({
        usColor: us,
        usTextColor: contrastTextColor(us),
        opponentColor: opponent,
        opponentTextColor: contrastTextColor(opponent),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ourLogo, opponentLogo]);

  return colors;
}
