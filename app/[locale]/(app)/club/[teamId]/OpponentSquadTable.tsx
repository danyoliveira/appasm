"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { SquadPlayer } from "@/lib/api-football/client";
import { contrastTextColor, getLogoColor } from "@/lib/logoColor";
import { normalize } from "@/lib/text";
import Icon from "@/components/Icon";
import { translatePosition, shortenPlayerName, POSITION_ORDER } from "../playerShared";

// Goalkeepers first, then the tactical order (defence → midfield → attack).
const positionRank = (position: string) =>
  position === "Goalkeeper" ? -1 : (POSITION_ORDER[position] ?? 99);

const segmentedClass = "flex flex-wrap rounded-lg border border-border bg-background p-0.5";
const segmentClass = (active: boolean) =>
  `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
    active ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
  }`;

export default function OpponentSquadTable({
  players,
  logoUrl,
  flagUrlByPlayerId,
  newSigningPlayerIds,
}: {
  players: SquadPlayer[];
  logoUrl?: string | null;
  flagUrlByPlayerId: Map<number, string | null>;
  newSigningPlayerIds: Set<number>;
}) {
  const t = useTranslations("dashboard");
  const [positionFilter, setPositionFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Same crest-color extractor used on the coach's own squad — the shirt
  // number echoes this club's color instead of the generic accent.
  const [clubColor, setClubColor] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    getLogoColor(logoUrl).then((c) => {
      if (!cancelled) setClubColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);
  const badgeStyle = clubColor
    ? { background: clubColor, color: contrastTextColor(clubColor) }
    : undefined;

  const positions = useMemo(
    () => Array.from(new Set(players.map((p) => p.position))).sort((a, b) => positionRank(a) - positionRank(b)),
    [players],
  );

  const q = normalize(query.trim());
  const groups = positions
    .filter((pos) => !positionFilter || pos === positionFilter)
    .map((pos) => ({
      position: pos,
      players: players
        .filter((p) => p.position === pos && (!q || normalize(p.name).includes(q)))
        .sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.players.length > 0);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("squadFilterPlaceholder")}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className={segmentedClass}>
          {[null, ...positions].map((pos) => (
            <button
              key={pos ?? "all"}
              type="button"
              onClick={() => setPositionFilter(pos)}
              aria-pressed={positionFilter === pos}
              className={segmentClass(positionFilter === pos)}
            >
              {pos ? translatePosition(pos, t) : t("allPositions")}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted">{t("noPlayersFound")}</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.position}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                {translatePosition(group.position, t)}
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums">
                  {group.players.length}
                </span>
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.players.map((player) => {
                  const flagUrl = flagUrlByPlayerId.get(player.id);
                  const isNew = newSigningPlayerIds.has(player.id);
                  return (
                    <Link
                      key={player.id}
                      href={`/club/player/${player.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 shadow-sm transition-colors hover:border-accent/40"
                    >
                      <span className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={player.photo} alt="" className="h-11 w-11 rounded-full object-cover ring-1 ring-border" />
                        <span
                          className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-2 ring-surface"
                          style={badgeStyle}
                        >
                          {player.number ?? "-"}
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold group-hover:text-accent">
                          {shortenPlayerName(player.name)}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          {flagUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={flagUrl} alt="" className="h-3 w-4 rounded-sm object-cover" />
                          )}
                          {player.age ? t("opponentPlayerAge", { age: player.age }) : "—"}
                        </div>
                      </div>
                      {isNew && (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          {t("newSigningBadge")}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
