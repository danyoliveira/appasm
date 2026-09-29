"use client";

import { useEffect, useState } from "react";
import { contrastTextColor, getVividLogoColor, resolveOpponentColor } from "@/lib/logoColor";

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
    // Vivid, not dominant: the dominant pixel of many crests is a grey or
    // white outline (Benfica's comes out light grey).
    Promise.all([getVividLogoColor(ourLogo), getVividLogoColor(opponentLogo)]).then(([us, opponentRaw]) => {
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

// Just the loudest color in our own crest — used where the UI wants to
// borrow the club's identity as an accent (e.g. flagging which match phase
// is live right now) rather than the full us-vs-opponent pin scheme above.
export function useVividLogoColor(logo?: string): string {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVividLogoColor(logo).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [logo]);

  return color ?? DEFAULT_COLORS.usColor;
}
