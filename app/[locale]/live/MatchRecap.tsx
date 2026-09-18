"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import LiveFeedList from "./LiveFeedList";
import LiveFormationTeam from "./LiveFormationTeam";
import CollectiveStatsPanel from "./CollectiveStatsPanel";
import GkStatsPanel from "./GkStatsPanel";
import FixtureExternalStatsSection from "./FixtureExternalStatsSection";
import {
  countGoals,
  eventIconsByName,
  type CollectiveStats,
  type GkStatsByPlayer,
  type GkStatsSide,
  type LineupPlayer,
  type LiveEntryRow,
} from "./liveStatsShared";

// Everything gathered during Modo Jogo, read-only, in one place — shared by
// the shareable /live/<token> link (once the match has ended) and the
// coach's own dashboard panel, so the two never drift into two different
// summaries of the same match. Split into the same Interna/Externa framing
// used elsewhere (club/player season stats): Interna is everything the
// coaching staff tracked by hand during the match; Externa is the same
// API-Football bars shown on the fixture page, for a real fixture.
export default function MatchRecap({
  preparationKey,
  homeName,
  awayName,
  homePlayers,
  awayPlayers,
  ourPlayers,
  entries,
  collectiveStats,
  ourGkStats,
  ourGkName,
  ourGkStatsByPlayer,
  ourTeamName,
}: {
  preparationKey: string;
  homeName: string;
  awayName: string;
  homePlayers: LineupPlayer[];
  awayPlayers: LineupPlayer[];
  // Same array as homePlayers or awayPlayers, whichever is our own club —
  // passed separately since only the caller (member/viewer token vs.
  // dashboard) knows which side that is here.
  ourPlayers: LineupPlayer[];
  entries: LiveEntryRow[];
  collectiveStats: CollectiveStats;
  ourGkStats: GkStatsSide;
  ourGkName: string | null;
  // Every one of our own goalkeepers credited with a stat this match — Modo
  // GK only ever tracks our own team, so this is the "did we use more than
  // one keeper" breakdown the recap needs (a mid-match GK change otherwise
  // only shows whoever finished the match in goal).
  ourGkStatsByPlayer: GkStatsByPlayer[];
  ourTeamName: string;
}) {
  const t = useTranslations("dashboard");
  const [tab, setTab] = useState<"internal" | "external">("internal");

  return (
    <div className="space-y-6">
      <div className="flex border-b border-border">
        {(
          [
            { key: "internal" as const, label: t("statsInternalTab") },
            { key: "external" as const, label: t("statsExternalTab") },
          ]
        ).map((tabDef) => (
          <button
            key={tabDef.key}
            type="button"
            onClick={() => setTab(tabDef.key)}
            className={`-mb-px flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === tabDef.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tabDef.label}
          </button>
        ))}
      </div>

      {tab === "internal" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-surface to-surface p-6 text-center shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t("liveStatsFinalScoreLabel")}
            </p>
            <div className="mt-2 flex items-center justify-center gap-4">
              <span className="max-w-[100px] truncate text-sm font-medium sm:max-w-[160px]">{homeName}</span>
              <span className="text-3xl font-bold tabular-nums">
                {countGoals(entries, "home")} – {countGoals(entries, "away")}
              </span>
              <span className="max-w-[100px] truncate text-sm font-medium sm:max-w-[160px]">{awayName}</span>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("liveStatsEventsListTitle")}
            </h3>
            <div className="mt-2">
              <LiveFeedList entries={entries} homeName={homeName} awayName={awayName} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("liveStatsFormationTitle")}
            </h3>
            <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <LiveFormationTeam
                teamName={homeName}
                players={homePlayers.filter((p) => p.starting)}
                substitutes={homePlayers.filter((p) => !p.starting)}
                canEdit={false}
                eventIcons={eventIconsByName(entries, "home")}
              />
              <LiveFormationTeam
                teamName={awayName}
                players={awayPlayers.filter((p) => p.starting)}
                substitutes={awayPlayers.filter((p) => !p.starting)}
                canEdit={false}
                eventIcons={eventIconsByName(entries, "away")}
              />
            </div>
          </div>

          <CollectiveStatsPanel stats={collectiveStats} homeName={homeName} awayName={awayName} canEdit={false} />

          <GkStatsPanel
            stats={ourGkStats}
            gkName={ourGkName}
            teamName={ourTeamName}
            players={ourPlayers}
            canEdit={false}
            byPlayer={ourGkStatsByPlayer}
          />
        </div>
      ) : (
        <FixtureExternalStatsSection preparationKey={preparationKey} />
      )}
    </div>
  );
}
