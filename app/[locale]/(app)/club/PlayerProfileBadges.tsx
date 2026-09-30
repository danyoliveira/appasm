import { translatePosition } from "./playerShared";
import {
  POSITION_GROUP,
  positionLabel,
  positionShort,
  type DetailedPosition,
  type PlayerProfile,
  type PreferredFoot,
} from "./playerProfile";

type Translate = (key: string) => string;

// One colour per line of the team, so a squad list reads at a glance:
// keepers amber, defenders blue, midfielders green, attackers red.
const GROUP_TONE: Record<string, string> = {
  Goalkeeper: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  Defender: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  Midfielder: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  Attacker: "bg-rose-500/15 text-rose-800 dark:text-rose-300",
};
const NEUTRAL_TONE = "bg-background text-muted ring-1 ring-inset ring-border";

const CHIP = "inline-flex shrink-0 items-center whitespace-nowrap rounded-md font-semibold uppercase tracking-wide";
const CHIP_SIZE = { sm: "px-1.5 py-0.5 text-[9px]", md: "px-2 py-0.5 text-[10px]" };

// A player's position as chips: the main one filled in its line's colour,
// the second one outlined next to it. Until the coach sets a specific
// position, the external source's group ("Defesa") shows instead, plain.
export function PositionChips({
  profile,
  fallbackPosition,
  t,
  size = "sm",
  full = false,
}: {
  profile: PlayerProfile | undefined;
  // The external source's group: Goalkeeper, Defender, Midfielder, Attacker.
  fallbackPosition?: string | null;
  t: Translate;
  size?: "sm" | "md";
  // "Defesa direito" instead of "DD" for the main position.
  full?: boolean;
}) {
  const chip = `${CHIP} ${CHIP_SIZE[size]}`;
  const primary = profile?.primaryPosition ?? null;
  const secondary = profile?.secondaryPosition ?? null;

  if (!primary) {
    if (!fallbackPosition) return null;
    return <span className={`${chip} ${NEUTRAL_TONE} font-medium`}>{translatePosition(fallbackPosition, t)}</span>;
  }

  const tone = (position: DetailedPosition) => GROUP_TONE[POSITION_GROUP[position]];
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={`${chip} ${tone(primary)}`} title={positionLabel(primary, t)}>
        {full ? positionLabel(primary, t) : positionShort(primary, t)}
      </span>
      {secondary && (
        <span
          className={`${chip} bg-transparent text-muted ring-1 ring-inset ring-border`}
          title={`${t("secondaryPositionLabel")}: ${positionLabel(secondary, t)}`}
        >
          {positionShort(secondary, t)}
        </span>
      )}
    </span>
  );
}

// The preferred foot as its initial in a small box: just "E" or just "D"
// for a one-footed player (showing both, one greyed out, read as "which one
// is it?"), and the two side by side for a two-footed one.
export function FootIndicator({
  foot,
  t,
  withLabel = false,
  size = "sm",
}: {
  foot: PreferredFoot | null | undefined;
  t: Translate;
  // Adds "Direito" / "Esquerdo" / "Ambidestro" next to it.
  withLabel?: boolean;
  size?: "sm" | "md";
}) {
  if (!foot) return null;
  const box = size === "md" ? "h-5 w-5 text-[10px]" : "h-4 w-4 text-[9px]";
  const side = `flex ${box} items-center justify-center rounded bg-foreground font-bold leading-none text-background`;
  const label = `${t("preferredFootLabel")}: ${t(`preferredFoot_${foot}`)}`;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5" title={label} aria-label={label}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {foot !== "right" && <span className={side}>{t("preferredFootLetter_left")}</span>}
        {foot !== "left" && <span className={side}>{t("preferredFootLetter_right")}</span>}
      </span>
      {withLabel && <span className="whitespace-nowrap">{t(`preferredFoot_${foot}`)}</span>}
    </span>
  );
}
