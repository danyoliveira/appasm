"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  addTacticalSnapshot,
  updateTacticalSnapshot,
  type PlayerStatus,
  type TacticalArrow,
  type TacticalMarker,
  type TacticalPosition,
} from "../actions";
import { translatePosition, STATUS_DOT } from "../clube/playerShared";
import type { TacticalSnapshotRow } from "./TacticalSnapshotList";
import type { TeamColors } from "./useTeamColors";

// Fixed, team-independent color for the generic marker ("boneco") — team
// pins are now derived from club crests, which can land on almost any
// color, so the marker needs a color that never coincides with either.
const MARKER_COLOR = "#7c3aed";

export interface OpponentSquadOption {
  id: number;
  name: string;
  number: number | null;
  photo: string;
  position: string;
}

export interface OurSquadOption extends OpponentSquadOption {
  status: PlayerStatus;
}

export type Team = "us" | "opponent";

// The bench merges both squads (plus any custom players added on either
// side) into one shape tagged by team, so drag/placement logic doesn't
// need to care which squad a player came from.
interface BenchOption {
  id: number;
  name: string;
  number: number | null;
  photo: string;
  position: string;
  team: Team;
  status?: PlayerStatus;
}

interface DragState {
  playerId: number;
  name: string;
  number: number | null;
  photo: string;
  team: Team;
  fromBench: boolean;
  clientX: number;
  clientY: number;
}

interface SimpleDragState {
  kind: "ball" | "marker";
  id: number | null;
  fromToolbox: boolean;
  clientX: number;
  clientY: number;
}

interface DrawingArrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const POSITION_GROUPS = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;
// The pitch keeps a fixed 3:4 (width:height) aspect ratio, so arrows are
// drawn in an SVG viewBox of the same ratio to avoid skewing their angle.
const PITCH_VIEWBOX_WIDTH = 75;

let nextCustomId = -1;
let nextMarkerId = 1;
let nextArrowId = 1;

export default function TacticalBoard({
  preparationKey,
  opponentSquad,
  ourSquad,
  isCoach,
  sideBySide = false,
  editingSnapshot = null,
  onCancelEdit,
  onSaved,
  duplicateSeed = null,
  teamColors,
  activeTeam,
}: {
  preparationKey: string;
  opponentSquad: OpponentSquadOption[];
  ourSquad: OurSquadOption[];
  isCoach: boolean;
  sideBySide?: boolean;
  editingSnapshot?: TacticalSnapshotRow | null;
  onCancelEdit?: () => void;
  onSaved?: () => void;
  duplicateSeed?: TacticalSnapshotRow | null;
  teamColors: TeamColors;
  activeTeam: Team;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const pitchRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<TacticalPosition[]>([]);
  const [ball, setBall] = useState<{ x: number; y: number } | null>(null);
  const [markers, setMarkers] = useState<TacticalMarker[]>([]);
  const [arrows, setArrows] = useState<TacticalArrow[]>([]);
  const [activeTool, setActiveTool] = useState<"select" | "arrow">("select");
  const [drawingArrow, setDrawingArrow] = useState<DrawingArrow | null>(null);
  const [notes, setNotes] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const pinStyle = (team: Team) => ({
    backgroundColor: team === "us" ? teamColors.usColor : teamColors.opponentColor,
    color: team === "us" ? teamColors.usTextColor : teamColors.opponentTextColor,
  });
  const [customPlayers, setCustomPlayers] = useState<BenchOption[]>([]);
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newPosition, setNewPosition] = useState<(typeof POSITION_GROUPS)[number]>("Midfielder");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [simpleDrag, setSimpleDrag] = useState<SimpleDragState | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);

  // Pre-filling the board when a saved snapshot is selected for editing or
  // duplicating is state derived from props, not a side effect — done here
  // during render (React's documented pattern for "adjusting state when a
  // prop changes") instead of in a useEffect, so it applies before paint
  // and doesn't trigger an extra render pass.
  const [appliedEditingId, setAppliedEditingId] = useState<string | null>(null);
  if (editingSnapshot && editingSnapshot.id !== appliedEditingId) {
    setAppliedEditingId(editingSnapshot.id);
    setPositions(editingSnapshot.positions);
    setBall(editingSnapshot.ball);
    setMarkers(editingSnapshot.markers);
    setArrows(editingSnapshot.arrows);
    setNotes(editingSnapshot.notes ?? "");
    setVideoUrl(editingSnapshot.videoUrl ?? "");
    setCustomPlayers(
      editingSnapshot.positions
        .filter(
          (p) => !opponentSquad.some((s) => s.id === p.playerId) && !ourSquad.some((s) => s.id === p.playerId),
        )
        .map((p) => ({
          id: p.playerId,
          name: p.name,
          number: p.number,
          photo: p.photo,
          position: "Midfielder",
          team: p.team ?? "opponent",
        })),
    );
  } else if (!editingSnapshot && appliedEditingId !== null) {
    setAppliedEditingId(null);
  }

  // Duplicating a saved snapshot pre-fills the (always-new) board with its
  // content, but leaves editingSnapshot untouched — so Guardar still inserts
  // a fresh row via addTacticalSnapshot instead of overwriting the original.
  const [appliedDuplicateId, setAppliedDuplicateId] = useState<string | null>(null);
  if (duplicateSeed && duplicateSeed.id !== appliedDuplicateId) {
    setAppliedDuplicateId(duplicateSeed.id);
    setPositions(duplicateSeed.positions);
    setBall(duplicateSeed.ball);
    setMarkers(duplicateSeed.markers);
    setArrows(duplicateSeed.arrows);
    setNotes(duplicateSeed.notes ?? "");
    setVideoUrl("");
    setCustomPlayers(
      duplicateSeed.positions
        .filter(
          (p) => !opponentSquad.some((s) => s.id === p.playerId) && !ourSquad.some((s) => s.id === p.playerId),
        )
        .map((p) => ({
          id: p.playerId,
          name: p.name,
          number: p.number,
          photo: p.photo,
          position: "Midfielder",
          team: p.team ?? "opponent",
        })),
    );
  } else if (!duplicateSeed && appliedDuplicateId !== null) {
    setAppliedDuplicateId(null);
  }

  useEffect(() => {
    if (!drag) return;

    function handleMove(e: PointerEvent) {
      setDrag((d) => (d ? { ...d, clientX: e.clientX, clientY: e.clientY } : d));
    }

    function handleUp(e: PointerEvent) {
      setDrag((current) => {
        if (!current) return null;
        const rect = pitchRef.current?.getBoundingClientRect();
        const withinPitch =
          rect &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        if (withinPitch && rect) {
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          setPositions((prev) => [
            ...prev.filter((p) => p.playerId !== current.playerId),
            {
              playerId: current.playerId,
              name: current.name,
              number: current.number,
              photo: current.photo,
              team: current.team,
              x: Math.min(96, Math.max(4, x)),
              y: Math.min(96, Math.max(4, y)),
            },
          ]);
        } else if (!current.fromBench) {
          // Dropped outside the pitch while repositioning an already-placed
          // player — treat it as sending them back to the bench.
          setPositions((prev) => prev.filter((p) => p.playerId !== current.playerId));
        }
        return null;
      });
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag]);

  useEffect(() => {
    if (!simpleDrag) return;

    function handleMove(e: PointerEvent) {
      setSimpleDrag((d) => (d ? { ...d, clientX: e.clientX, clientY: e.clientY } : d));
    }

    function handleUp(e: PointerEvent) {
      setSimpleDrag((current) => {
        if (!current) return null;
        const rect = pitchRef.current?.getBoundingClientRect();
        const withinPitch =
          rect &&
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom;

        if (withinPitch && rect) {
          const x = Math.min(96, Math.max(4, ((e.clientX - rect.left) / rect.width) * 100));
          const y = Math.min(96, Math.max(4, ((e.clientY - rect.top) / rect.height) * 100));
          if (current.kind === "ball") {
            setBall({ x, y });
          } else if (current.id != null) {
            const markerId = current.id;
            setMarkers((prev) => prev.map((m) => (m.id === markerId ? { ...m, x, y } : m)));
          } else {
            setMarkers((prev) => [...prev, { id: nextMarkerId++, x, y }]);
          }
        } else if (!current.fromToolbox) {
          // Dropped outside the pitch while repositioning an already-placed
          // ball/marker — remove it, same convention as players.
          if (current.kind === "ball") {
            setBall(null);
          } else if (current.id != null) {
            const markerId = current.id;
            setMarkers((prev) => prev.filter((m) => m.id !== markerId));
          }
        }
        return null;
      });
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [simpleDrag]);

  useEffect(() => {
    if (!drawingArrow) return;

    function handleMove(e: PointerEvent) {
      const rect = pitchRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
      setDrawingArrow((d) => (d ? { ...d, x2: x, y2: y } : d));
    }

    function handleUp() {
      setDrawingArrow((current) => {
        if (current) {
          const dist = Math.hypot(current.x2 - current.x1, current.y2 - current.y1);
          if (dist > 3) {
            setArrows((prev) => [...prev, { id: nextArrowId++, ...current }]);
          }
        }
        return null;
      });
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drawingArrow]);

  function startDragFromBench(player: BenchOption, e: React.PointerEvent) {
    if (!isCoach) return;
    setDrag({
      playerId: player.id,
      name: player.name,
      number: player.number,
      photo: player.photo,
      team: player.team,
      fromBench: true,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  function startDragFromPitch(pos: TacticalPosition, e: React.PointerEvent) {
    if (!isCoach) return;
    e.stopPropagation();
    setDrag({
      playerId: pos.playerId,
      name: pos.name,
      number: pos.number,
      photo: pos.photo,
      team: pos.team ?? "opponent",
      fromBench: false,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  function startBallDrag(e: React.PointerEvent, fromToolbox: boolean) {
    if (!isCoach) return;
    e.stopPropagation();
    setSimpleDrag({ kind: "ball", id: null, fromToolbox, clientX: e.clientX, clientY: e.clientY });
  }

  function startMarkerDrag(e: React.PointerEvent, marker: TacticalMarker | null) {
    if (!isCoach) return;
    e.stopPropagation();
    setSimpleDrag({
      kind: "marker",
      id: marker?.id ?? null,
      fromToolbox: marker === null,
      clientX: e.clientX,
      clientY: e.clientY,
    });
  }

  function handlePitchPointerDown(e: React.PointerEvent) {
    if (!isCoach || activeTool !== "arrow") return;
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawingArrow({ x1: x, y1: y, x2: x, y2: y });
  }

  function removeArrow(id: number) {
    setArrows((prev) => prev.filter((a) => a.id !== id));
  }

  function handleAddCustomPlayer() {
    if (!newName.trim()) return;
    const player: BenchOption = {
      id: nextCustomId--,
      name: newName.trim(),
      number: newNumber.trim() ? Number(newNumber.trim()) : null,
      photo: "",
      position: newPosition,
      team: activeTeam,
    };
    setCustomPlayers((prev) => [...prev, player]);
    setNewName("");
    setNewNumber("");
    setIsAddingPlayer(false);
  }

  const hasContent = positions.length > 0 || ball !== null || markers.length > 0 || arrows.length > 0;

  function resetBoard() {
    setPositions([]);
    setBall(null);
    setMarkers([]);
    setArrows([]);
    setNotes("");
    setVideoUrl("");
    setCustomPlayers([]);
  }

  function handleSave() {
    startSaving(async () => {
      if (editingSnapshot) {
        await updateTacticalSnapshot(
          editingSnapshot.id,
          { players: positions, ball, markers, arrows, team: activeTeam },
          notes,
          videoUrl,
        );
        resetBoard();
        onSaved?.();
      } else {
        await addTacticalSnapshot(
          preparationKey,
          { players: positions, ball, markers, arrows, team: activeTeam },
          notes,
          videoUrl,
        );
        resetBoard();
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    });
  }

  function handleCancelEdit() {
    resetBoard();
    onCancelEdit?.();
  }

  const benchByPosition = useMemo(() => {
    const squadForTeam: BenchOption[] =
      activeTeam === "us"
        ? ourSquad.map((p) => ({ ...p, team: "us" as const }))
        : opponentSquad.map((p) => ({ ...p, team: "opponent" as const }));
    const allOptions = [...squadForTeam, ...customPlayers.filter((p) => p.team === activeTeam)];
    const unplaced = allOptions.filter((p) => !positions.some((pos) => pos.playerId === p.id));
    const groups = new Map<string, BenchOption[]>();
    for (const player of unplaced) {
      const key = POSITION_GROUPS.includes(player.position as (typeof POSITION_GROUPS)[number])
        ? player.position
        : "Midfielder";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(player);
    }
    return groups;
  }, [activeTeam, ourSquad, opponentSquad, customPlayers, positions]);

  return (
    <div className="select-none">
      {isCoach && (
        <h4 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted">
          <span>
            {editingSnapshot
              ? t("tacticalEditingSnapshotTitle", { title: editingSnapshot.title })
              : t("tacticalNewSnapshotTitle")}
          </span>
          {editingSnapshot && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-[11px] font-medium normal-case text-muted hover:text-foreground"
            >
              {t("cancelButton")}
            </button>
          )}
        </h4>
      )}
      <div className={sideBySide ? "grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start" : ""}>
      <div>
      {isCoach && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">
            {t("tacticalToolsTitle")}
          </span>
          <div
            onPointerDown={(e) => startBallDrag(e, true)}
            title={t("tacticalBallLabel")}
            className="flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full border border-border bg-surface text-sm active:cursor-grabbing"
          >
            ⚽
          </div>
          <div
            onPointerDown={(e) => startMarkerDrag(e, null)}
            title={t("tacticalMarkerLabel")}
            style={{ backgroundColor: MARKER_COLOR }}
            className="flex h-8 w-8 cursor-grab touch-none items-center justify-center rounded-full border border-border text-white active:cursor-grabbing"
          >
            <PlayerIcon />
          </div>
          <button
            type="button"
            onClick={() => setActiveTool((tool) => (tool === "arrow" ? "select" : "arrow"))}
            title={t("tacticalArrowLabel")}
            className={`flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors ${
              activeTool === "arrow"
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            ➜ {t("tacticalArrowLabel")}
          </button>
        </div>
      )}
      <div
        ref={pitchRef}
        onPointerDown={handlePitchPointerDown}
        className={`relative mx-auto aspect-[3/4] w-full max-w-md touch-none select-none overflow-hidden rounded-xl shadow-inner ${
          activeTool === "arrow" ? "cursor-crosshair" : ""
        }`}
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

        <svg
          viewBox={`0 0 ${PITCH_VIEWBOX_WIDTH} 100`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <marker id="tactical-arrowhead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="#ffffff" />
            </marker>
          </defs>
          {arrows.map((a) => (
            <g key={a.id}>
              {/* Fat, invisible hit area — the visible line below is too
                  thin to click reliably, so clicking anywhere near it
                  (not just the tiny delete button) removes the arrow. */}
              {isCoach && (
                <line
                  x1={(a.x1 * PITCH_VIEWBOX_WIDTH) / 100}
                  y1={a.y1}
                  x2={(a.x2 * PITCH_VIEWBOX_WIDTH) / 100}
                  y2={a.y2}
                  stroke="transparent"
                  strokeWidth={4}
                  className="pointer-events-auto cursor-pointer"
                  onClick={() => removeArrow(a.id)}
                />
              )}
              <line
                x1={(a.x1 * PITCH_VIEWBOX_WIDTH) / 100}
                y1={a.y1}
                x2={(a.x2 * PITCH_VIEWBOX_WIDTH) / 100}
                y2={a.y2}
                stroke="#ffffff"
                strokeWidth={0.6}
                markerEnd="url(#tactical-arrowhead)"
              />
            </g>
          ))}
          {drawingArrow && (
            <line
              x1={(drawingArrow.x1 * PITCH_VIEWBOX_WIDTH) / 100}
              y1={drawingArrow.y1}
              x2={(drawingArrow.x2 * PITCH_VIEWBOX_WIDTH) / 100}
              y2={drawingArrow.y2}
              stroke="#ffffff"
              strokeWidth={0.6}
              strokeDasharray="2,2"
              markerEnd="url(#tactical-arrowhead)"
            />
          )}
        </svg>

        {isCoach &&
          arrows.map((a) => (
            <button
              key={`del-${a.id}`}
              type="button"
              onClick={() => removeArrow(a.id)}
              title={t("deleteButton")}
              className="absolute z-10 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white shadow-md hover:bg-red-500"
              style={{ left: `${(a.x1 + a.x2) / 2}%`, top: `${(a.y1 + a.y2) / 2}%` }}
            >
              ×
            </button>
          ))}

        {positions.map((pos) => (
          <button
            key={pos.playerId}
            type="button"
            onPointerDown={(e) => startDragFromPitch(pos, e)}
            className="group absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none flex-col items-center active:cursor-grabbing"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              visibility: drag?.playerId === pos.playerId ? "hidden" : "visible",
            }}
          >
            <div
              style={pinStyle(pos.team ?? "opponent")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow ring-2 ring-white/40"
            >
              {pos.number ?? "-"}
            </div>
            <span className="mt-1 max-w-[70px] truncate rounded bg-black/60 px-1 text-center text-[9px] font-medium text-white">
              {pos.name}
            </span>
          </button>
        ))}

        {markers.map((m) => (
          <button
            key={m.id}
            type="button"
            onPointerDown={(e) => startMarkerDrag(e, m)}
            className="absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full text-white shadow ring-2 ring-white/40 active:cursor-grabbing"
            style={{
              left: `${m.x}%`,
              top: `${m.y}%`,
              backgroundColor: MARKER_COLOR,
              visibility: simpleDrag?.kind === "marker" && simpleDrag.id === m.id ? "hidden" : "visible",
            }}
          >
            <PlayerIcon />
          </button>
        ))}

        {ball && (
          <button
            type="button"
            onPointerDown={(e) => startBallDrag(e, false)}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full bg-white text-sm shadow ring-2 ring-black/20 active:cursor-grabbing"
            style={{
              left: `${ball.x}%`,
              top: `${ball.y}%`,
              visibility: simpleDrag?.kind === "ball" ? "hidden" : "visible",
            }}
          >
            ⚽
          </button>
        )}
      </div>
      </div>

      {drag && (
        <div
          className="pointer-events-none fixed z-[60] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: drag.clientX, top: drag.clientY }}
        >
          <div
            style={pinStyle(drag.team)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold shadow-lg ring-2 ring-accent"
          >
            {drag.number ?? "-"}
          </div>
          <span className="mt-1 max-w-[70px] truncate rounded bg-black/60 px-1 text-center text-[9px] font-medium text-white">
            {drag.name}
          </span>
        </div>
      )}

      {simpleDrag && (
        <div
          className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2"
          style={{ left: simpleDrag.clientX, top: simpleDrag.clientY }}
        >
          {simpleDrag.kind === "ball" ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm shadow-lg ring-2 ring-accent">
              ⚽
            </div>
          ) : (
            <div
              style={{ backgroundColor: MARKER_COLOR }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-white shadow-lg ring-2 ring-accent"
            >
              <PlayerIcon />
            </div>
          )}
        </div>
      )}

      {isCoach && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: activeTeam === "us" ? teamColors.usColor : teamColors.opponentColor }}
            />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("tacticalBenchTitle")} —{" "}
              {activeTeam === "us" ? t("tacticalOurTeamTab") : t("preparationOpponentLabel")}
            </h4>
          </div>
          <div className="mt-2 space-y-3">
            {POSITION_GROUPS.map((group) => {
              const players = benchByPosition.get(group);
              if (!players || players.length === 0) return null;
              return (
                <div key={group}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">
                    {translatePosition(group, t)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {players.map((player) => (
                      <div
                        key={player.id}
                        onPointerDown={(e) => startDragFromBench(player, e)}
                        className="flex cursor-grab touch-none items-center gap-2 rounded-full border border-border bg-surface px-2 py-1 text-xs active:cursor-grabbing"
                      >
                        <span className="relative shrink-0">
                          {player.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={player.photo}
                              alt=""
                              className="h-5 w-5 rounded-full object-cover"
                            />
                          ) : (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[9px] font-semibold text-accent">
                              {player.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          {player.status && player.status !== "available" && (
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-surface ${STATUS_DOT[player.status]}`}
                            />
                          )}
                        </span>
                        <span className="truncate">{player.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {benchByPosition.size === 0 && (
              <p className="text-xs text-muted">{t("tacticalBenchEmpty")}</p>
            )}
          </div>

          {isAddingPlayer ? (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-3">
              <div>
                <label className="mb-1 block text-[10px] text-muted">{t("tacticalPlayerNameLabel")}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-36 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted">{t("tacticalPlayerNumberLabel")}</label>
                <input
                  type="number"
                  value={newNumber}
                  onChange={(e) => setNewNumber(e.target.value)}
                  className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted">{t("squadColumnPosition")}</label>
                <select
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value as (typeof POSITION_GROUPS)[number])}
                  className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                >
                  {POSITION_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {translatePosition(g, t)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={handleAddCustomPlayer}
                disabled={!newName.trim()}
                className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                {t("videoSaveButton")}
              </button>
              <button
                type="button"
                onClick={() => setIsAddingPlayer(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                {t("cancelButton")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingPlayer(true)}
              className="mt-3 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
            >
              + {t("tacticalAddPlayerButton")}
            </button>
          )}
        </div>
      )}
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
          {t("videoNotesLabel")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!isCoach}
          rows={3}
          className="w-full select-text resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-70"
        />
      </div>

      {isCoach && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t("videoUrlLabel")}
          </label>
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>
      )}

      {isCoach && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasContent}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? t("savingClub") : t("videoSaveButton")}
          </button>
          {saved && <span className="text-sm text-green-600">✓</span>}
        </div>
      )}
    </div>
  );
}

function PlayerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <circle cx="12" cy="6" r="4" />
      <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
