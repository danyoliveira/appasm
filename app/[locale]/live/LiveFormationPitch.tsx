"use client";

import { useEffect, useRef, useState } from "react";
import { defaultFormationPosition, lastName, type LineupPlayer } from "./liveStatsShared";

interface DragState {
  index: number;
  clientX: number;
  clientY: number;
}

// Interactive pitch for placing the starting XI — same visuals as
// StaticTacticalPitch/TacticalBoard, trimmed to just player drag (no
// bench/ball/markers/arrows, which this step doesn't need).
export default function LiveFormationPitch({
  players,
  onChange,
  onPlayerClick,
  eventIcons,
}: {
  players: LineupPlayer[];
  onChange: (players: LineupPlayer[]) => void;
  // Dedicated "+" badge per token — kept separate from the drag handle so it
  // never fights the drag gesture (a tap-vs-drag distance threshold was
  // unreliable in practice).
  onPlayerClick?: (player: LineupPlayer, index: number) => void;
  // Icons for events already logged, keyed by player name.
  eventIcons?: Record<string, string[]>;
}) {
  const pitchRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    if (!drag) return;

    function handleMove(e: PointerEvent) {
      setDrag((d) => (d ? { ...d, clientX: e.clientX, clientY: e.clientY } : d));
    }

    function handleUp(e: PointerEvent) {
      // Read the pitch rect and call onChange here, in the plain event
      // handler — not nested inside the setDrag updater. onChange updates a
      // *different* component's state (the parent's), and React disallows
      // that from inside another component's setState updater function.
      const rect = pitchRef.current?.getBoundingClientRect();
      if (rect) {
        const x = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.min(96, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100));
        onChange(players.map((p, i) => (i === drag.index ? { ...p, x, y } : p)));
      }
      setDrag(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, players, onChange]);

  function startDrag(index: number, e: React.PointerEvent) {
    e.preventDefault();
    setDrag({ index, clientX: e.clientX, clientY: e.clientY });
  }

  return (
    <div
      ref={pitchRef}
      className="relative aspect-[3/4] w-full touch-none select-none overflow-hidden rounded-lg shadow-inner"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to bottom, #2f7d32 0%, #2f7d32 10%, #34893a 10%, #34893a 20%)",
      }}
    >
      <div className="absolute inset-3 rounded-md border border-white/25">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/25" />
        <div className="absolute left-1/2 top-1/2 h-[16%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/50" />
        <div className="absolute left-1/2 top-0 h-[14%] w-[54%] -translate-x-1/2 border border-white/30" />
        <div className="absolute left-1/2 bottom-0 h-[14%] w-[54%] -translate-x-1/2 border border-white/30" />
      </div>

      {players.map((p, i) => {
        const pos = p.x != null && p.y != null ? { x: p.x, y: p.y } : defaultFormationPosition(i);
        const icons = eventIcons?.[p.name] ?? [];
        return (
          <div
            key={i}
            onPointerDown={(e) => startDrag(i, e)}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none flex-col items-center active:cursor-grabbing"
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, visibility: drag?.index === i ? "hidden" : "visible" }}
          >
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow ring-2 ring-white/40">
                {p.number ?? "-"}
              </div>
              {onPlayerClick && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayerClick(p, i);
                  }}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-bold leading-none text-accent-foreground shadow ring-2 ring-white/70"
                >
                  +
                </button>
              )}
            </div>
            {icons.length > 0 && (
              <div className="mt-0.5 flex gap-0.5">
                {icons.map((icon, idx) => (
                  <span key={idx} className="text-[11px] leading-none">
                    {icon}
                  </span>
                ))}
              </div>
            )}
            <span className="mt-0.5 max-w-[80px] truncate rounded bg-black/60 px-1.5 py-0.5 text-center text-[11px] font-medium text-white">
              {p.name ? lastName(p.name) : "-"}
            </span>
          </div>
        );
      })}

      {drag && (
        <div
          className="pointer-events-none fixed z-[60] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: drag.clientX, top: drag.clientY }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-lg ring-2 ring-accent">
            {players[drag.index]?.number ?? "-"}
          </div>
          <span className="mt-1 max-w-[80px] truncate rounded bg-black/60 px-1.5 py-0.5 text-center text-[11px] font-medium text-white">
            {players[drag.index]?.name ? lastName(players[drag.index].name) : ""}
          </span>
        </div>
      )}
    </div>
  );
}
