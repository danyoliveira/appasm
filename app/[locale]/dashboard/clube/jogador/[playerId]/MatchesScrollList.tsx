"use client";

import { useEffect, useRef, useState } from "react";

const MIN_HEIGHT = 160;

// The two cards must end at the same bottom edge, so the scrollable list's
// height is set to exactly fill whatever's left after the card's own
// header/padding ("chrome") once the outer card matches the stats card's
// height — not a fixed row count, since match cards vary in height
// (badges wrap). Chrome is measured once, before any height is applied, so
// later measurements of the (by then clamped) list don't feed back into it.
export default function MatchesScrollList({
  children,
  statsCardId,
}: {
  children: React.ReactNode;
  statsCardId: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const chromeHeightRef = useRef<number | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const list = listRef.current;
    const card = list?.closest<HTMLElement>(".js-matches-card");
    if (!list || !card) return;

    if (chromeHeightRef.current == null) {
      chromeHeightRef.current = card.offsetHeight - list.offsetHeight;
    }

    function update() {
      const statsCard = document.getElementById(statsCardId);
      const statsHeight = statsCard?.offsetHeight ?? 0;
      const chrome = chromeHeightRef.current ?? 0;
      setHeight(Math.max(statsHeight - chrome, MIN_HEIGHT));
    }

    update();
    const observer = new ResizeObserver(update);
    const statsCard = document.getElementById(statsCardId);
    if (statsCard) observer.observe(statsCard);
    return () => observer.disconnect();
  }, [statsCardId]);

  return (
    <div
      ref={listRef}
      className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1"
      style={height != null ? { height, maxHeight: height } : undefined}
    >
      {children}
    </div>
  );
}
