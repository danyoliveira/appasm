"use client";

import { useTranslations } from "next-intl";
import StaticTacticalPitch from "../(app)/preparations/StaticTacticalPitch";
import LiveFormationPitch from "./LiveFormationPitch";
import {
  FORMATION_PRESETS,
  applyFormation,
  defaultFormationPosition,
  lastName,
  type LineupPlayer,
} from "./liveStatsShared";

// Controlled — the wizard/Match Mode owns the starting-XI array so saves can
// be batched (Seguinte) or immediate (a drag in Match Mode), whichever fits.
export default function LiveFormationTeam({
  teamName,
  players,
  canEdit,
  onChange,
  substitutes,
  onPlayerClick,
  eventIcons,
  saving = false,
  showPresets = false,
  tokenColor,
}: {
  teamName: string;
  players: LineupPlayer[];
  canEdit: boolean;
  onChange?: (players: LineupPlayer[]) => void;
  substitutes?: LineupPlayer[];
  onPlayerClick?: (player: LineupPlayer, index: number) => void;
  // Keyed by player name (not index) — covers both the pitch and the
  // substitutes list below, and a player subbed off keeps whatever they
  // logged while they were still on.
  eventIcons?: Record<string, string[]>;
  // A drag is still being stored — blocks the next one until it is.
  saving?: boolean;
  // The pre-game formation step: one-tap systems (4-3-3, 4-4-2, …) above
  // the pitch. Off in Match Mode, where a stray tap would move everyone.
  showPresets?: boolean;
  // The club's colour for this side's tokens, so the two pitches tell the
  // teams apart at a glance.
  tokenColor?: { background: string; text: string };
}) {
  const t = useTranslations("dashboard");
  const namedSubs = substitutes?.filter((p) => p.name.trim()) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        {tokenColor && (
          <span
            aria-hidden
            className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
            style={{ backgroundColor: tokenColor.background }}
          />
        )}
        {teamName}
      </h4>
      {showPresets && canEdit && onChange && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("liveFormationPresetLabel")}
          </span>
          {FORMATION_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onChange(applyFormation(players, preset.lines))}
              className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium tabular-nums text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <div className="relative mt-3">
        {canEdit && onChange ? (
          <>
            <LiveFormationPitch
              players={players}
              onChange={onChange}
              onPlayerClick={onPlayerClick}
              eventIcons={eventIcons}
              tokenColor={tokenColor}
            />
            {saving && (
              <div className="absolute inset-0 flex items-start justify-center rounded-lg bg-black/10 pt-3">
                <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t("savingClub")}
                </span>
              </div>
            )}
          </>
        ) : (
          <StaticTacticalPitch
            size="lg"
            teamColors={
              tokenColor
                ? {
                    usColor: tokenColor.background,
                    usTextColor: tokenColor.text,
                    opponentColor: tokenColor.background,
                    opponentTextColor: tokenColor.text,
                  }
                : undefined
            }
            positions={players
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.name.trim())
              .map(({ p, i }) => {
                // Same fallback as LiveFormationPitch (edit mode), keyed by
                // each player's original index — a filled-in x/y always
                // wins, an unset one falls back to the formation layout
                // instead of collapsing every unpositioned player onto the
                // center spot.
                const pos = p.x != null && p.y != null ? { x: p.x, y: p.y } : defaultFormationPosition(i);
                return {
                  playerId: i,
                  name: lastName(p.name),
                  number: p.number,
                  photo: "",
                  x: pos.x,
                  y: pos.y,
                };
              })}
            iconsByPositionId={Object.fromEntries(
              players
                .map((p, i) => [i, eventIcons?.[p.name] ?? []] as const)
                .filter(([, icons]) => icons.length > 0),
            )}
          />
        )}
      </div>

      {substitutes && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("liveStatsSubstitutesLabel")}
          </p>
          {namedSubs.length === 0 ? (
            <p className="mt-1 text-xs text-muted">—</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {namedSubs.map((p, i) => {
                const icons = eventIcons?.[p.name] ?? [];
                return (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted">{p.number ?? ""}</span>
                    {lastName(p.name)}
                    {icons.length > 0 && (
                      <span className="flex gap-0.5">
                        {icons.map((icon, idx) => (
                          <span key={idx} className="text-[11px] leading-none">
                            {icon}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
