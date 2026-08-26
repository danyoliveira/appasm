import type { TacticalArrow, TacticalMarker, TacticalPosition } from "../actions";
import type { TeamColors } from "./useTeamColors";

const PITCH_VIEWBOX_WIDTH = 75;
const MARKER_COLOR = "#7c3aed";
// Matches TacticalBoard's pre-extraction default — used as-is by callers
// that don't pass teamColors (e.g. LiveFormationTeam, which has no teams).
const DEFAULT_TEAM_COLORS: TeamColors = {
  usColor: "#dc2626",
  usTextColor: "#ffffff",
  opponentColor: "#0f172a",
  opponentTextColor: "#ffffff",
};

// Read-only rendering of a saved tactical snapshot — same pitch visuals as
// the interactive TacticalBoard, minus the drag handling.
// "sm" (default) suits the tactical-analysis grid of several small preview
// cards; "lg" matches LiveFormationPitch's token size, for when this is the
// only/main pitch on screen (e.g. Live Mode's read-only formation view).
export default function StaticTacticalPitch({
  positions,
  ball,
  markers,
  arrows,
  teamColors = DEFAULT_TEAM_COLORS,
  size = "sm",
}: {
  positions: TacticalPosition[];
  ball?: { x: number; y: number } | null;
  markers?: TacticalMarker[];
  arrows?: TacticalArrow[];
  teamColors?: TeamColors;
  size?: "sm" | "lg";
}) {
  const tokenClass = size === "lg" ? "h-11 w-11 text-sm" : "h-7 w-7 text-[10px]";
  const labelClass =
    size === "lg" ? "max-w-[80px] px-1.5 py-0.5 text-[11px]" : "max-w-[60px] px-1 text-[8px]";
  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-lg shadow-inner"
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

      {arrows && arrows.length > 0 && (
        <svg
          viewBox={`0 0 ${PITCH_VIEWBOX_WIDTH} 100`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <marker id="tactical-arrowhead-static" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="#ffffff" />
            </marker>
          </defs>
          {arrows.map((a) => (
            <line
              key={a.id}
              x1={(a.x1 * PITCH_VIEWBOX_WIDTH) / 100}
              y1={a.y1}
              x2={(a.x2 * PITCH_VIEWBOX_WIDTH) / 100}
              y2={a.y2}
              stroke="#ffffff"
              strokeWidth={0.6}
              markerEnd="url(#tactical-arrowhead-static)"
            />
          ))}
        </svg>
      )}

      {positions.map((pos) => (
        <div
          key={pos.playerId}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        >
          <div
            style={{
              backgroundColor: pos.team === "us" ? teamColors.usColor : teamColors.opponentColor,
              color: pos.team === "us" ? teamColors.usTextColor : teamColors.opponentTextColor,
            }}
            className={`flex items-center justify-center rounded-full font-bold shadow ring-2 ring-white/40 ${tokenClass}`}
          >
            {pos.number ?? "-"}
          </div>
          <span
            className={`mt-1 truncate rounded bg-black/60 text-center font-medium text-white ${labelClass}`}
          >
            {pos.name}
          </span>
        </div>
      ))}

      {markers?.map((m) => (
        <div
          key={m.id}
          className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow ring-2 ring-white/40"
          style={{ left: `${m.x}%`, top: `${m.y}%`, backgroundColor: MARKER_COLOR }}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
            <circle cx="12" cy="6" r="4" />
            <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </svg>
        </div>
      ))}

      {ball && (
        <div
          className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs shadow ring-2 ring-black/20"
          style={{ left: `${ball.x}%`, top: `${ball.y}%` }}
        >
          ⚽
        </div>
      )}
    </div>
  );
}
