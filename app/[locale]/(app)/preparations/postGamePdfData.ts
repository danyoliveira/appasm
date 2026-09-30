import type { LiveMatchRecap } from "./liveStatsActions";
import type { PostGamePdfData, PitchPlayer } from "./PostGamePdf";
import {
  countGoals,
  defaultFormationPosition,
  gkEfficiency,
  lastName,
  statOf,
  type LineupPlayer,
} from "../../live/liveStatsShared";
import { activeCollectiveFields, activeGkGroups, fieldLabel, groupLabel } from "../../live/liveStatConfig";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const EVENT_LABEL_KEYS: Record<string, string> = {
  goal: "liveEventGoal",
  assist: "liveEventAssist",
  yellow_card: "liveEventYellowCard",
  red_card: "liveEventRedCard",
  substitution: "liveEventSubstitution",
};

function lineupOf(players: LineupPlayer[]): { starters: PitchPlayer[]; substitutes: string[] } {
  const starting = players.filter((p) => p.starting);
  return {
    starters: starting
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.name.trim())
      .map(({ p, i }) => {
        const pos = p.x != null && p.y != null ? { x: p.x, y: p.y } : defaultFormationPosition(i);
        return { name: lastName(p.name), number: p.number, x: pos.x, y: pos.y };
      }),
    substitutes: players
      .filter((p) => !p.starting && p.name.trim())
      .map((p) => `${p.number != null ? `${p.number} ` : ""}${lastName(p.name)}`),
  };
}

// Everything the post-game PDF prints, worked out from the same recap the
// Pós-Jogo tab shows — kept apart from the PDF layout so it can be tested
// and so the layout only ever deals with ready-made strings and numbers.
export function buildPostGamePdfData(
  recap: LiveMatchRecap,
  extra: {
    matchDate: string | null;
    competition: string | null;
    notes: string | null;
    colors: { home: string; homeText: string; away: string; awayText: string };
  },
  t: Translate,
): PostGamePdfData {
  // The feed is stored newest first; a report reads from kick-off.
  const chronological = [...recap.entries].reverse();
  const teamName = (side: "home" | "away" | null) =>
    side === "home" ? recap.homeName : side === "away" ? recap.awayName : "";
  const minuteOf = (minute: number | null, extra: number | null) =>
    minute != null ? `${minute}${extra ? `+${extra}` : ""}'` : "—";
  const scorers = (side: "home" | "away") =>
    chronological
      .filter((e) => e.eventType === "goal" && e.teamSide === side)
      .map((e) => `${e.playerName ? lastName(e.playerName) : "—"} ${minuteOf(e.minute, e.extraMinute)}`);

  const { collectiveStats: stats, gkStats, statConfig, ourSide } = recap;
  const possessionTotal = stats.possessionMsHome + stats.possessionMsAway + stats.possessionMsNeutral;

  const byPlayer = ourSide === "home" ? gkStats.homeByPlayer : gkStats.awayByPlayer;
  const gkName = ourSide === "home" ? gkStats.homeGkName : gkStats.awayGkName;
  const keepers =
    byPlayer.length > 0
      ? byPlayer
      : gkName
        ? [
            {
              name: gkName,
              playerId: null,
              stats: ourSide === "home" ? gkStats.home : gkStats.away,
              incomplete: ourSide === "home" ? gkStats.homeIncomplete : gkStats.awayIncomplete,
            },
          ]
        : [];
  const groups = activeGkGroups(statConfig);

  return {
    homeName: recap.homeName,
    awayName: recap.awayName,
    homeScore: countGoals(recap.entries, "home"),
    awayScore: countGoals(recap.entries, "away"),
    matchDate: extra.matchDate,
    competition: extra.competition,
    homeColor: extra.colors.home,
    homeTextColor: extra.colors.homeText,
    awayColor: extra.colors.away,
    awayTextColor: extra.colors.awayText,
    scorers: { home: scorers("home"), away: scorers("away") },
    notes: extra.notes?.trim() ? extra.notes.trim() : null,
    events: chronological
      .filter((e) => e.eventType)
      .map((e) => ({
        minute: minuteOf(e.minute, e.extraMinute),
        label: t(EVENT_LABEL_KEYS[e.eventType!]),
        detail: [e.playerName, e.eventType === "substitution" ? e.notes : null].filter(Boolean).join(" · "),
        team: teamName(e.teamSide),
      })),
    lineups: { home: lineupOf(recap.homeLineup.players), away: lineupOf(recap.awayLineup.players) },
    possession:
      possessionTotal > 0
        ? {
            home: Math.round((stats.possessionMsHome / possessionTotal) * 100),
            away: Math.round((stats.possessionMsAway / possessionTotal) * 100),
          }
        : null,
    collective: activeCollectiveFields(statConfig).map((field) => ({
      label: fieldLabel(field, t),
      home: statOf(stats.home, field.key),
      away: statOf(stats.away, field.key),
    })),
    goalkeepers: keepers
      .map((keeper) => ({
        name: keeper.name,
        groups: groups
          .map((group) => ({
            label: groupLabel(group, t),
            rows: group.fields.map((field) => {
              const complete = statOf(keeper.stats, field.key);
              const incomplete = statOf(keeper.incomplete, field.key);
              const pct = gkEfficiency(complete, incomplete);
              return { label: fieldLabel(field, t), complete, incomplete, pct: pct != null ? `${pct}%` : "—" };
            }),
          }))
          // Only the areas the keeper was actually involved in.
          .filter((group) => group.rows.some((row) => row.complete + row.incomplete > 0)),
      }))
      .filter((keeper) => keeper.groups.length > 0),
  };
}
