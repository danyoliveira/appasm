"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { SquadPlayer } from "@/lib/api-football/client";
import { translatePosition } from "../playerShared";

export default function OpponentSquadTable({
  players,
  flagUrlByPlayerId,
  newSigningPlayerIds,
}: {
  players: SquadPlayer[];
  flagUrlByPlayerId: Map<number, string | null>;
  newSigningPlayerIds: Set<number>;
}) {
  const t = useTranslations("dashboard");
  const [positionFilter, setPositionFilter] = useState<string | null>(null);

  const distinctPositions = useMemo(
    () => Array.from(new Set(players.map((p) => p.position))),
    [players],
  );

  const filteredPlayers = useMemo(
    () => (positionFilter ? players.filter((p) => p.position === positionFilter) : players),
    [players, positionFilter],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPositionFilter(null)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            positionFilter === null
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          {t("allPositions")}
        </button>
        {distinctPositions.map((pos) => (
          <button
            key={pos}
            type="button"
            onClick={() => setPositionFilter(pos)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              positionFilter === pos
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {translatePosition(pos, t)}
          </button>
        ))}
      </div>

      {filteredPlayers.length === 0 ? (
        <p className="text-sm text-muted">{t("noPlayersFound")}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-background text-xs uppercase tracking-wide text-muted">
                  <th className="px-2 py-2 text-left">{t("squadColumnPlayer")}</th>
                  <th className="w-6 px-1 py-2 text-left">
                    <span className="sr-only">{t("squadColumnFlag")}</span>
                  </th>
                  <th className="px-2 py-2 text-center">{t("squadColumnAge")}</th>
                  <th className="px-2 py-2 text-left">{t("squadColumnPosition")}</th>
                  <th className="px-2 py-2 text-left">
                    <span className="sr-only">{t("newSigningBadge")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPlayers.map((player) => {
                  const flagUrl = flagUrlByPlayerId.get(player.id);
                  return (
                    <tr
                      key={player.id}
                      className="odd:bg-surface even:bg-background/60 transition-colors hover:bg-accent/5"
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={player.photo}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded-full object-cover"
                          />
                          <span className="truncate font-medium">{player.name}</span>
                        </div>
                      </td>
                      <td className="px-1 py-2">
                        {flagUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={flagUrl} alt="" className="h-3.5 w-5 rounded-sm object-cover" />
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">{player.age ?? "-"}</td>
                      <td className="px-2 py-2">
                        <span className="inline-block rounded-full bg-background px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">
                          {translatePosition(player.position, t)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {newSigningPlayerIds.has(player.id) && (
                          <span className="inline-block rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                            {t("newSigningBadge")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
