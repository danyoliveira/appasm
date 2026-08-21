import "server-only";
import { getFixturePlayers, getFixtureLineups, getFixtureEvents } from "./cache";
import type { FixtureEvent } from "./client";

export interface VerifiedAppearance {
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  conceded: number;
  yellow: number;
  red: number;
  rating: string | null;
  started: boolean;
}

function countEvents(events: FixtureEvent[], playerId: number) {
  let goals = 0;
  let assists = 0;
  let yellow = 0;
  let red = 0;
  for (const ev of events) {
    if (ev.type === "Goal" && ev.player.id === playerId && ev.detail !== "Missed Penalty") goals++;
    if (ev.type === "Goal" && ev.assist.id === playerId) assists++;
    if (ev.type === "Card" && ev.player.id === playerId) {
      if (ev.detail.includes("Red") || ev.detail.includes("Second Yellow")) red++;
      else yellow++;
    }
  }
  return { goals, assists, yellow, red };
}

// /fixtures/players is the most reliable source for a player's per-match
// stats (minutes, rating, goals, assists, cards) — but for some
// competitions (typically early continental qualifying rounds) it's
// missing players entirely, even though /fixtures/lineups clearly has them
// in the startXI or substitutes and /fixtures/events shows their sub
// on/off times. This combines all three so participation is never missed:
// the stats endpoint wins when it has the player, lineups+events fill in
// an approximate minute count for anyone it's missing.
export async function getFixtureAppearances(
  fixtureId: number,
): Promise<Map<number, VerifiedAppearance>> {
  const [playersData, lineups, events] = await Promise.all([
    getFixturePlayers(fixtureId).catch(() => []),
    getFixtureLineups(fixtureId).catch(() => []),
    getFixtureEvents(fixtureId).catch(() => []),
  ]);

  const result = new Map<number, VerifiedAppearance>();
  const lastEventMinute = events.reduce((max, ev) => Math.max(max, ev.time.elapsed), 90);

  // Goals conceded aren't reported per-player by any API-Football endpoint
  // for this team's competitions — derived instead from the lineup (which
  // team each player was on and their on-pitch window) plus the actual goal
  // events, so it works uniformly regardless of /fixtures/players coverage.
  const onPitch = new Map<number, { teamId: number; from: number; to: number }>();
  for (const lineup of lineups) {
    for (const p of lineup.startXI ?? []) {
      const subOff = events.find((ev) => ev.type === "subst" && ev.player.id === p.player.id);
      onPitch.set(p.player.id, { teamId: lineup.team.id, from: 0, to: subOff ? subOff.time.elapsed : lastEventMinute });
    }
    for (const p of lineup.substitutes ?? []) {
      const subOn = events.find((ev) => ev.type === "subst" && ev.assist.id === p.player.id);
      if (!subOn) continue;
      onPitch.set(p.player.id, { teamId: lineup.team.id, from: subOn.time.elapsed, to: lastEventMinute });
    }
  }

  function concededFor(playerId: number): number {
    const window = onPitch.get(playerId);
    if (!window) return 0;
    return events.filter(
      (ev) =>
        ev.type === "Goal" &&
        ev.detail !== "Missed Penalty" &&
        ev.team.id !== window.teamId &&
        ev.time.elapsed >= window.from &&
        ev.time.elapsed <= window.to,
    ).length;
  }

  for (const team of playersData) {
    for (const entry of team.players ?? []) {
      const stats = entry.statistics[0];
      const minutes = stats?.games.minutes ?? 0;
      const played = minutes > 0 || stats?.games.rating != null;
      if (!played) continue;
      result.set(entry.player.id, {
        minutes,
        goals: stats.goals.total ?? 0,
        assists: stats.goals.assists ?? 0,
        saves: stats.goals.saves ?? 0,
        conceded: concededFor(entry.player.id),
        yellow: stats.cards.yellow ?? 0,
        red: stats.cards.red ?? 0,
        rating: stats.games.rating,
        started: !stats.games.substitute,
      });
    }
  }

  for (const lineup of lineups) {
    for (const p of lineup.startXI ?? []) {
      if (result.has(p.player.id)) continue;
      const subOff = events.find((ev) => ev.type === "subst" && ev.player.id === p.player.id);
      const minutes = subOff ? subOff.time.elapsed : lastEventMinute;
      result.set(p.player.id, {
        minutes,
        ...countEvents(events, p.player.id),
        saves: 0,
        conceded: concededFor(p.player.id),
        rating: null,
        started: true,
      });
    }
    for (const p of lineup.substitutes ?? []) {
      if (result.has(p.player.id)) continue;
      const subOn = events.find((ev) => ev.type === "subst" && ev.assist.id === p.player.id);
      if (!subOn) continue;
      const minutes = Math.max(lastEventMinute - subOn.time.elapsed, 0);
      result.set(p.player.id, {
        minutes,
        ...countEvents(events, p.player.id),
        saves: 0,
        conceded: concededFor(p.player.id),
        rating: null,
        started: false,
      });
    }
  }

  return result;
}
