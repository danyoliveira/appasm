"use client";

import { useTranslations } from "next-intl";
import StaticTacticalPitch from "../dashboard/preparacoes/StaticTacticalPitch";
import LiveFormationPitch from "./LiveFormationPitch";
import { lastName, type LineupPlayer } from "./liveStatsShared";

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
}) {
  const t = useTranslations("dashboard");
  const namedSubs = substitutes?.filter((p) => p.name.trim()) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <h4 className="text-sm font-semibold">{teamName}</h4>
      <div className="mt-3">
        {canEdit && onChange ? (
          <LiveFormationPitch
            players={players}
            onChange={onChange}
            onPlayerClick={onPlayerClick}
            eventIcons={eventIcons}
          />
        ) : (
          <StaticTacticalPitch
            positions={players
              .filter((p) => p.name.trim())
              .map((p, i) => ({
                playerId: i,
                name: lastName(p.name),
                number: p.number,
                photo: "",
                x: p.x ?? 50,
                y: p.y ?? 50,
              }))}
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
