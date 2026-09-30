"use client";

import { useTranslations } from "next-intl";
import { translatePosition } from "./club/playerShared";

export interface PlayerSelectOption {
  id: number;
  name: string;
  number?: number | null;
  // API-Football position ("Goalkeeper", "Defender", …); anything else
  // (or missing) is listed under Médio.
  position?: string | null;
  // The coach's specific position(s), already abbreviated ("DD · ED").
  role?: string | null;
}

const POSITION_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;

// The app's player dropdown: grouped by position, shirt number first
// ("8 · F. Aursnes"), numbers in order inside each group — with the coach's
// specific position after the name where there is one ("… (DD · ED)").
export default function PlayerSelect({
  players,
  value,
  onChange,
  noneLabel,
  disabled = false,
  className = "",
}: {
  players: PlayerSelectOption[];
  value: number | "";
  onChange: (id: number | "") => void;
  noneLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("dashboard");
  const groups = POSITION_ORDER.map((group) => ({
    group,
    players: players
      .filter((p) => {
        const position = POSITION_ORDER.includes(p.position as (typeof POSITION_ORDER)[number])
          ? p.position
          : "Midfielder";
        return position === group;
      })
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name)),
  })).filter((g) => g.players.length > 0);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      disabled={disabled}
      className={`w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent disabled:opacity-50 ${className}`}
    >
      <option value="">{noneLabel}</option>
      {groups.map((g) => (
        <optgroup key={g.group} label={translatePosition(g.group, t)}>
          {g.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.number != null ? `${p.number} · ` : ""}
              {p.name}
              {p.role ? ` (${p.role})` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
