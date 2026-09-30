import type { Fixture } from "./client";

// Status codes of the external source for a game that will never be played
// (or whose result was decided off the pitch): cancelled, abandoned,
// technical loss, walkover.
const CANCELLED = new Set(["CANC", "ABD", "AWD", "WO"]);

export function isCancelled(fx: Fixture): boolean {
  return CANCELLED.has(fx.fixture.status?.short ?? "");
}

// Postponed: still to be played, but the date on it is the old one.
export function isPostponed(fx: Fixture): boolean {
  return fx.fixture.status?.short === "PST";
}

const hasScore = (fx: Fixture) => fx.goals.home != null && fx.goals.away != null;
// A game that kicked off this long ago and still has no score isn't "next".
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

// The games still to be played, in the order a coach needs them: the ones
// with a real date ahead first (soonest first), then the ones without one —
// postponed, or left without a result by the source — by their old date.
// "No score" alone used to be the test, so a friendly cancelled in January
// showed up as the next game in September.
export function upcomingFixtures<T extends Fixture>(fixtures: T[], now = Date.now()): T[] {
  const time = (fx: T) => new Date(fx.fixture.date).getTime();
  const undated = (fx: T) => isPostponed(fx) || time(fx) < now - STALE_AFTER_MS;
  return fixtures
    .filter((fx) => !hasScore(fx) && !isCancelled(fx))
    .sort((a, b) => Number(undated(a)) - Number(undated(b)) || time(a) - time(b));
}

// Shown as "Adiado" instead of as a game with a date: postponed, or past
// its kick-off without a result.
export function hasNoRealDate(fx: Fixture, now = Date.now()): boolean {
  return !hasScore(fx) && (isPostponed(fx) || new Date(fx.fixture.date).getTime() < now - STALE_AFTER_MS);
}
