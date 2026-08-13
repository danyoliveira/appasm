import type { FixtureEvent } from "@/lib/api-football/client";
import type { Locale } from "@/i18n/routing";

const EVENT_LABELS: Record<string, { pt: string; es: string; fr: string }> = {
  "Normal Goal": { pt: "Golo", es: "Gol", fr: "But" },
  "Own Goal": { pt: "Autogolo", es: "Autogol", fr: "But contre son camp" },
  Penalty: { pt: "Grande penalidade", es: "Penalti", fr: "Penalty" },
  "Missed Penalty": { pt: "Penálti falhado", es: "Penalti fallado", fr: "Penalty manqué" },
  "Yellow Card": { pt: "Cartão amarelo", es: "Tarjeta amarilla", fr: "Carton jaune" },
  "Red Card": { pt: "Cartão vermelho", es: "Tarjeta roja", fr: "Carton rouge" },
  "Second Yellow card": { pt: "Segundo amarelo", es: "Segunda amarilla", fr: "Deuxième jaune" },
};

export function translateEventDetail(detail: string, locale: Locale): string {
  const entry = EVENT_LABELS[detail];
  if (!entry) return detail;
  return locale === "en" ? detail : entry[locale];
}

export function eventIcon(type: string, detail: string): string {
  if (type === "Goal") return detail === "Missed Penalty" ? "❌" : "⚽";
  if (type === "Card") return detail.includes("Red") || detail.includes("Second Yellow") ? "🟥" : "🟨";
  if (type === "subst") return "🔁";
  if (type === "Var") return "📺";
  return "•";
}

export function formatMinute(event: FixtureEvent): string {
  return `${event.time.elapsed}${event.time.extra ? `+${event.time.extra}` : ""}'`;
}

export function playerEvents(playerId: number, events: FixtureEvent[]): FixtureEvent[] {
  return events
    .filter((ev) => ev.player.id === playerId || (ev.type === "subst" && ev.assist.id === playerId))
    .sort((a, b) => a.time.elapsed - b.time.elapsed);
}

export function eventTooltipLine(
  event: FixtureEvent,
  locale: Locale,
  assistLabel: string,
  forPlayerId?: number,
): string {
  const base = `${formatMinute(event)} ${eventIcon(event.type, event.detail)} ${translateEventDetail(event.detail, locale)}`;
  if (event.type === "subst") {
    const cameOn = forPlayerId !== undefined && event.assist.id === forPlayerId;
    const other = cameOn ? event.player.name : event.assist.name;
    return other ? `${base} ↔ ${other}` : base;
  }
  if (event.assist.name && event.type === "Goal") {
    return `${base} (${assistLabel}: ${event.assist.name})`;
  }
  return base;
}
