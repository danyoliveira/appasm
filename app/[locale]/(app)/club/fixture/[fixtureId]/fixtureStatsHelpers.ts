import type { Locale } from "@/i18n/routing";
import type { StatBarRow } from "./FixtureStatsBars";

// Shared by the fixture page's own "Estatísticas do jogo" section and the
// preparation's Pós-Jogo "Externa" tab — both read the exact same bars from
// the exact same API-Football data, so the labels/groupings live here once.
export const STAT_LABELS: Record<string, { pt: string; es: string; fr: string; en: string }> = {
  "Shots on Goal": { pt: "Remates à baliza", es: "Tiros a puerta", fr: "Tirs cadrés", en: "Shots on target" },
  "Shots off Goal": { pt: "Remates ao lado", es: "Tiros fuera", fr: "Tirs non cadrés", en: "Shots off target" },
  "Total Shots": { pt: "Remates totais", es: "Tiros totales", fr: "Tirs totaux", en: "Total shots" },
  "Blocked Shots": { pt: "Remates bloqueados", es: "Tiros bloqueados", fr: "Tirs bloqués", en: "Blocked shots" },
  "Shots insidebox": { pt: "Remates dentro da área", es: "Tiros dentro del área", fr: "Tirs dans la surface", en: "Shots inside box" },
  "Shots outsidebox": { pt: "Remates fora da área", es: "Tiros fuera del área", fr: "Tirs hors surface", en: "Shots outside box" },
  Fouls: { pt: "Faltas", es: "Faltas", fr: "Fautes", en: "Fouls" },
  "Corner Kicks": { pt: "Cantos", es: "Córners", fr: "Corners", en: "Corners" },
  Offsides: { pt: "Fora de jogo", es: "Fueras de juego", fr: "Hors-jeu", en: "Offsides" },
  "Ball Possession": { pt: "Posse de bola", es: "Posesión", fr: "Possession", en: "Possession" },
  "Yellow Cards": { pt: "Cartões amarelos", es: "Tarjetas amarillas", fr: "Cartons jaunes", en: "Yellow cards" },
  "Red Cards": { pt: "Cartões vermelhos", es: "Tarjetas rojas", fr: "Cartons rouges", en: "Red cards" },
  "Goalkeeper Saves": { pt: "Defesas do guarda-redes", es: "Paradas del portero", fr: "Arrêts du gardien", en: "Goalkeeper saves" },
  "Total passes": { pt: "Passes totais", es: "Pases totales", fr: "Passes totales", en: "Total passes" },
  "Passes accurate": { pt: "Passes certos", es: "Pases precisos", fr: "Passes réussies", en: "Accurate passes" },
  "Passes %": { pt: "Precisão de passe", es: "Precisión de pase", fr: "Précision de passe", en: "Pass accuracy" },
  expected_goals: { pt: "Golos esperados (xG)", es: "Goles esperados (xG)", fr: "Buts attendus (xG)", en: "Expected goals (xG)" },
};

export function translateStatLabel(type: string, locale: Locale): string {
  const entry = STAT_LABELS[type];
  if (!entry) return type;
  return entry[locale] ?? type;
}

// The two or three numbers a coach actually glances at first — everything
// else (fouls, offsides, cards, blocked shots...) is real but secondary,
// grouped below by category instead of one flat list.
export const HEADLINE_STAT_TYPES = new Set(["Ball Possession", "Total Shots", "Shots on Goal"]);

// Rate stats that are two independent 0-100 values, not a split of one
// shared total (unlike Ball Possession, which genuinely sums to ~100) — a
// shared proportional bar between them would misleadingly imply otherwise.
export const INDEPENDENT_PERCENT_STAT_TYPES = new Set(["Passes %"]);

export type StatSectionId = "attack" | "passing" | "discipline" | "goalkeeping";

export const STAT_SECTION: Record<string, StatSectionId> = {
  "Shots off Goal": "attack",
  "Blocked Shots": "attack",
  "Shots insidebox": "attack",
  "Shots outsidebox": "attack",
  "Corner Kicks": "attack",
  expected_goals: "attack",
  "Total passes": "passing",
  "Passes accurate": "passing",
  "Passes %": "passing",
  Fouls: "discipline",
  Offsides: "discipline",
  "Yellow Cards": "discipline",
  "Red Cards": "discipline",
  "Goalkeeper Saves": "goalkeeping",
};

export const STAT_SECTION_ORDER: { id: StatSectionId; titleKey: string }[] = [
  { id: "attack", titleKey: "statGroupAttack" },
  { id: "passing", titleKey: "statGroupPasses" },
  { id: "discipline", titleKey: "statGroupDiscipline" },
  { id: "goalkeeping", titleKey: "statGroupGoalkeeping" },
];

export interface FixtureStatSections {
  headline: StatBarRow[];
  sections: { title: string; rows: StatBarRow[] }[];
}

// Raw API-Football statistics -> ready-to-render StatBarRow groups.
export function buildFixtureStatSections(
  homeStats: { statistics: { type: string; value: unknown }[] } | undefined,
  awayStats: { statistics: { type: string; value: unknown }[] } | undefined,
  locale: Locale,
  sectionTitle: (titleKey: string) => string,
): FixtureStatSections {
  const statTypes = Array.from(
    new Set([
      ...(homeStats?.statistics.map((s) => s.type) ?? []),
      ...(awayStats?.statistics.map((s) => s.type) ?? []),
    ]),
  );

  const toRow = (type: string): StatBarRow => {
    const homeRaw = homeStats?.statistics.find((s) => s.type === type)?.value;
    const awayRaw = awayStats?.statistics.find((s) => s.type === type)?.value;
    return {
      type,
      label: translateStatLabel(type, locale),
      homeDisplay: String(homeRaw ?? "-"),
      awayDisplay: String(awayRaw ?? "-"),
      homeNum: Number(String(homeRaw ?? "0").replace("%", "")) || 0,
      awayNum: Number(String(awayRaw ?? "0").replace("%", "")) || 0,
      independentPercent: INDEPENDENT_PERCENT_STAT_TYPES.has(type),
    };
  };

  return {
    headline: statTypes.filter((type) => HEADLINE_STAT_TYPES.has(type)).map(toRow),
    sections: STAT_SECTION_ORDER.map(({ id, titleKey }) => ({
      title: sectionTitle(titleKey),
      rows: statTypes.filter((type) => STAT_SECTION[type] === id).map(toRow),
    })),
  };
}
