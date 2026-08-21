import type { PlayerStatus } from "../actions";

export const POSITION_LABEL_KEYS: Record<string, string> = {
  Goalkeeper: "positionGoalkeeper",
  Defender: "positionDefender",
  Midfielder: "positionMidfielder",
  Attacker: "positionAttacker",
};

export function translatePosition(position: string, t: (key: string) => string) {
  const key = POSITION_LABEL_KEYS[position];
  return key ? t(key) : position;
}

// The API only gives injury/absence reasons in English free text — translate
// the common ones, and fall back to the original string for anything not
// covered (better than nothing, not guaranteed complete).
const INJURY_TYPE_TRANSLATIONS: Record<string, { pt: string; es: string; fr: string }> = {
  "Missing Fixture": { pt: "Jogo em falta", es: "Partido no disputado", fr: "Match manqué" },
  Suspended: { pt: "Suspenso", es: "Sancionado", fr: "Suspendu" },
  Illness: { pt: "Doença", es: "Enfermedad", fr: "Maladie" },
  Injured: { pt: "Lesionado", es: "Lesionado", fr: "Blessé" },
  Knock: { pt: "Pancada", es: "Golpe", fr: "Coup" },
  "COVID-19": { pt: "Covid-19", es: "Covid-19", fr: "Covid-19" },
  "Personal Reasons": { pt: "Razões pessoais", es: "Razones personales", fr: "Raisons personnelles" },
  "Not With Squad": { pt: "Fora do plantel", es: "Fuera de la plantilla", fr: "Hors groupe" },
  "Coach's Decision": { pt: "Decisão técnica", es: "Decisión técnica", fr: "Décision technique" },
  "International Duty": { pt: "Seleção nacional", es: "Selección nacional", fr: "Sélection nacional" },
  "Cruciate Ligament": { pt: "Ligamento cruzado", es: "Ligamento cruzado", fr: "Ligament croisé" },
  "Ligament Damage": { pt: "Lesão ligamentar", es: "Lesión de ligamentos", fr: "Lésion ligamentaire" },
  Concussion: { pt: "Concussão", es: "Conmoción cerebral", fr: "Commotion cérébrale" },
  "Broken Foot": { pt: "Fratura no pé", es: "Fractura de pie", fr: "Fracture du pied" },
  "Broken Leg": { pt: "Fratura na perna", es: "Fractura de pierna", fr: "Fracture de la jambe" },
  "Broken Arm": { pt: "Fratura no braço", es: "Fractura de brazo", fr: "Fracture du bras" },
  Fracture: { pt: "Fratura", es: "Fractura", fr: "Fracture" },
  Surgery: { pt: "Cirurgia", es: "Cirugía", fr: "Chirurgie" },
  Operation: { pt: "Operação", es: "Operación", fr: "Opération" },
  Inactive: { pt: "Inativo", es: "Inactivo", fr: "Inactif" },
  Injury: { pt: "Lesão", es: "Lesión", fr: "Blessure" },
  "Not In Squad": { pt: "Fora do plantel", es: "Fuera de la plantilla", fr: "Hors groupe" },
  "Coach Decision": { pt: "Decisão técnica", es: "Decisión técnica", fr: "Décision technique" },
  "National Team": { pt: "Seleção nacional", es: "Selección nacional", fr: "Sélection nacional" },
};

const BODY_PART_TRANSLATIONS: Record<string, { pt: string; es: string; fr: string }> = {
  Muscle: { pt: "muscular", es: "muscular", fr: "musculaire" },
  Knee: { pt: "no joelho", es: "de rodilla", fr: "au genou" },
  Ankle: { pt: "no tornozelo", es: "de tobillo", fr: "à la cheville" },
  Thigh: { pt: "na coxa", es: "de muslo", fr: "à la cuisse" },
  Calf: { pt: "no gémeo", es: "de gemelo", fr: "au mollet" },
  Groin: { pt: "na virilha", es: "de ingle", fr: "à l'aine" },
  Back: { pt: "nas costas", es: "de espalda", fr: "au dos" },
  Hamstring: { pt: "nos isquiotibiais", es: "isquiotibial", fr: "aux ischio-jambiers" },
  Shoulder: { pt: "no ombro", es: "de hombro", fr: "à l'épaule" },
  Foot: { pt: "no pé", es: "de pie", fr: "au pied" },
  Hand: { pt: "na mão", es: "de mano", fr: "à la main" },
  Wrist: { pt: "no pulso", es: "de muñeca", fr: "au poignet" },
  Head: { pt: "na cabeça", es: "de cabeza", fr: "à la tête" },
  Rib: { pt: "nas costelas", es: "de costillas", fr: "aux côtes" },
  Hip: { pt: "na anca", es: "de cadera", fr: "à la hanche" },
  Elbow: { pt: "no cotovelo", es: "de codo", fr: "au coude" },
  Achilles: { pt: "no tendão de Aquiles", es: "de tendón de Aquiles", fr: "au tendon d'Achille" },
};

const INJURY_WORD: Record<"pt" | "es" | "fr", string> = {
  pt: "Lesão",
  es: "Lesión",
  fr: "Blessure",
};

export function translateInjuryType(type: string, locale: string): string {
  if (locale !== "pt" && locale !== "es" && locale !== "fr") return type;

  const exact = INJURY_TYPE_TRANSLATIONS[type];
  if (exact) return exact[locale];

  const match = type.match(/^(.+?)\s+Injury$/i);
  if (match) {
    const prefix = match[1];
    const exactPart = BODY_PART_TRANSLATIONS[prefix];
    if (exactPart) return `${INJURY_WORD[locale]} ${exactPart[locale]}`;

    const partKey = Object.keys(BODY_PART_TRANSLATIONS).find((key) =>
      new RegExp(`\\b${key}\\b`, "i").test(prefix),
    );
    if (partKey) return `${INJURY_WORD[locale]} ${BODY_PART_TRANSLATIONS[partKey][locale]}`;
  }

  return type;
}

// Reasons in /injuries and /sidelined that aren't an actual medical injury —
// used to split "suspended / not in squad / inactive / on national duty"
// players into their own "unavailable" list instead of lumping them in with
// injuries. Matched by keyword (not exact string) since the API isn't
// consistent about exact wording/casing across leagues.
const NON_INJURY_KEYWORDS = [
  "suspend",
  "squad",
  "decision",
  "personal",
  "duty",
  "national",
  "inactive",
  "quota",
  "missing fixture",
];

export function isNonInjuryReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return NON_INJURY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export interface AvailabilityInfo {
  status: PlayerStatus;
  lastSeenInjuryKey: string | null;
  excluded: boolean;
}

export interface PendingInjury {
  key: string;
  reason: string;
}

export interface PlayerSeasonStat {
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  saves: number;
  conceded: number;
}

export const STATUS_DOT: Record<PlayerStatus, string> = {
  available: "bg-green-600",
  doubtful: "bg-yellow-500",
  injured: "bg-red-500",
  suspended: "bg-muted",
  unavailable: "bg-orange-500",
};

export const STATUS_TEXT: Record<PlayerStatus, string> = {
  available: "text-green-600",
  doubtful: "text-yellow-600",
  injured: "text-red-500",
  suspended: "text-muted",
  unavailable: "text-orange-600",
};

export const STATUS_KEYS = [
  "available",
  "doubtful",
  "injured",
  "suspended",
  "unavailable",
] as const;

export function statusLabelKey(status: PlayerStatus) {
  return {
    available: "statusAvailable",
    doubtful: "statusDoubtful",
    injured: "statusInjured",
    suspended: "statusSuspended",
    unavailable: "statusUnavailable",
  }[status];
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" strokeWidth={2}>
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatusControl({
  status,
  isCoach,
  isPending,
  onChange,
  t,
}: {
  status: PlayerStatus;
  isCoach: boolean;
  isPending: boolean;
  onChange: (status: PlayerStatus) => void;
  t: (key: string) => string;
}) {
  if (!isCoach) {
    return (
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium">
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
        <span className={STATUS_TEXT[status]}>{t(statusLabelKey(status))}</span>
      </span>
    );
  }

  return (
    <div className="relative w-fit">
      <select
        value={status}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value as PlayerStatus)}
        className={`appearance-none rounded-full border border-border bg-background py-1 pl-5 pr-6 text-xs font-medium outline-none focus:border-accent disabled:opacity-50 ${STATUS_TEXT[status]}`}
      >
        {STATUS_KEYS.map((key) => (
          <option key={key} value={key} className="text-foreground">
            {t(statusLabelKey(key))}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${STATUS_DOT[status]}`}
      />
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-muted">
        <ChevronIcon />
      </span>
    </div>
  );
}

export function InjuryConfirmBanner({
  pendingInjury,
  isPending,
  onResolve,
  t,
}: {
  pendingInjury: PendingInjury;
  isPending: boolean;
  onResolve: (isReal: boolean) => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  return (
    <div className="rounded-xl bg-yellow-500/10 p-2.5 text-xs">
      <p className="text-yellow-700 dark:text-yellow-500">
        {t("apiInjuryPrompt", { reason: pendingInjury.reason })}
      </p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onResolve(true)}
          className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground disabled:opacity-50"
        >
          {t("confirmInjuryButton")}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onResolve(false)}
          className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
        >
          {t("dismissInjuryButton")}
        </button>
      </div>
    </div>
  );
}
