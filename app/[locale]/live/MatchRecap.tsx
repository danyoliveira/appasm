"use client";

import { useState, Fragment } from "react";
import { useTranslations } from "next-intl";
import TeamCrest from "@/components/TeamCrest";
import LiveFeedList from "./LiveFeedList";
import LiveFormationTeam from "./LiveFormationTeam";
import CollectiveStatsPanel from "./CollectiveStatsPanel";
import GkStatsPanel from "./GkStatsPanel";
import type { LiveStatConfig } from "./liveStatConfig";
import FixtureExternalStatsSection from "./FixtureExternalStatsSection";
import {
  countGoals,
  eventIconsByName,
  type CollectiveStats,
  type GkStatsByPlayer,
  type GkStatsSide,
  type LineupPlayer,
  type LiveEntryRow,
  lastName,
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
  ourGkIncomplete,
  ourGkName,
  ourGkStatsByPlayer,
  ourTeamName,
  statConfig,
  tokenColors,
  homeLogo,
  awayLogo,
}: {
  preparationKey: string;
  homeName: string;
  awayName: string;
  homePlayers: LineupPlayer[];
  awayPlayers: LineupPlayer[];
  homeLogo?: string | null;
  awayLogo?: string | null;
  // Each club's colour for its pitch tokens.
  tokenColors?: { home: { background: string; text: string }; away: { background: string; text: string } };
  // Same array as homePlayers or awayPlayers, whichever is our own club —
  // passed separately since only the caller (member/viewer token vs.
  // dashboard) knows which side that is here.
  ourPlayers: LineupPlayer[];
  entries: LiveEntryRow[];
  collectiveStats: CollectiveStats;
  ourGkStats: GkStatsSide;
  ourGkIncomplete: GkStatsSide;
  ourGkName: string | null;
  // Every one of our own goalkeepers credited with a stat this match — Modo
  // GK only ever tracks our own team, so this is the "did we use more than
  // one keeper" breakdown the recap needs (a mid-match GK change otherwise
  // only shows whoever finished the match in goal).
  ourGkStatsByPlayer: GkStatsByPlayer[];
  ourTeamName: string;
  // The fields this game was played with.
  statConfig?: LiveStatConfig;
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
          {/* Final score: crests, the result, and who scored under each side. */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {tokenColors && (
              <div aria-hidden className="flex h-1.5">
                <div className="flex-1" style={{ backgroundColor: tokenColors.home.background }} />
                <div className="flex-1" style={{ backgroundColor: tokenColors.away.background }} />
              </div>
            )}
            <div className="p-5">
              <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("liveStatsFinalScoreLabel")}
              </p>
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 sm:gap-6">
                {(["home", "away"] as const).map((side) => {
                  const goals = [...entries]
                    .reverse()
                    .filter((e) => e.eventType === "goal" && e.teamSide === side);
                  const team = (
                    <div
                      key={side}
                      className={`flex min-w-0 flex-col gap-1.5 ${side === "home" ? "items-end text-right" : "items-start text-left"}`}
                    >
                      <div className={`flex items-center gap-2 ${side === "home" ? "flex-row-reverse" : ""}`}>
                        <TeamCrest logo={side === "home" ? homeLogo : awayLogo} className="h-9 w-9" />
                        <span className="min-w-0 truncate text-sm font-semibold">
                          {side === "home" ? homeName : awayName}
                        </span>
                      </div>
                      {goals.length > 0 && (
                        <ul className="space-y-0.5 text-xs text-muted">
                          {goals.map((g) => (
                            <li key={g.id}>
                              ⚽ {g.playerName ? lastName(g.playerName) : "—"}
                              {g.minute != null && <span className="tabular-nums"> {g.minute}&apos;</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                  return side === "home" ? (
                    <Fragment key={side}>
                      {team}
                      <span className="pt-0.5 text-4xl font-bold tabular-nums leading-none">
                        {countGoals(entries, "home")} – {countGoals(entries, "away")}
                      </span>
                    </Fragment>
                  ) : (
                    team
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("liveStatsEventsListTitle")}
            </h3>
            <div className="mt-2">
              {/* The live feed is newest-first (handy mid-match); a summary
                  reads from kick-off to the final whistle. */}
              <LiveFeedList entries={[...entries].reverse()} homeName={homeName} awayName={awayName} />
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
                tokenColor={tokenColors?.home}
              />
              <LiveFormationTeam
                teamName={awayName}
                players={awayPlayers.filter((p) => p.starting)}
                substitutes={awayPlayers.filter((p) => !p.starting)}
                canEdit={false}
                eventIcons={eventIconsByName(entries, "away")}
                tokenColor={tokenColors?.away}
              />
            </div>
          </div>

          <CollectiveStatsPanel
            tokenColors={tokenColors}
            stats={collectiveStats}
            homeName={homeName}
            awayName={awayName}
            canEdit={false}
            statConfig={statConfig}
          />

          <GkStatsPanel
            stats={ourGkStats}
            incompleteStats={ourGkIncomplete}
            gkName={ourGkName}
            teamName={ourTeamName}
            players={ourPlayers}
            canEdit={false}
            byPlayer={ourGkStatsByPlayer}
            statConfig={statConfig}
          />
        </div>
      ) : (
        <FixtureExternalStatsSection preparationKey={preparationKey} />
      )}
    </div>
  );
}
