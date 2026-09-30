"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ManualMatchDetails } from "../actions";
import OpponentPicker, { type OpponentChoice } from "./OpponentPicker";

export type ManualOpponentSelection = { teamId: number } | { name: string; logo?: string | null } | null;

export interface CompetitionOption {
  id: number;
  name: string;
  logo: string;
}

// The external source calls club friendlies "Friendlies Clubs" — the form
// offers them once, as "Amigável".
const isFriendlies = (name: string) => /^friendl/i.test(name);

// "" = none, "api:<id>" = one of the club's competitions, "friendly",
// "custom" = free text.
type CompetitionChoice = string;

function initialChoice(
  details: ManualMatchDetails | undefined,
  competitions: CompetitionOption[],
  friendlyLabel: string,
): CompetitionChoice {
  const c = details?.competition;
  if (!c) return "";
  const apiMatch = c.leagueId != null ? competitions.find((o) => o.id === c.leagueId) : undefined;
  if (isFriendlies(c.name) || c.name === friendlyLabel || (apiMatch && isFriendlies(apiMatch.name))) return "friendly";
  if (apiMatch) return `api:${c.leagueId}`;
  return "custom";
}

const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";
const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

// Shared by "+ Adicionar jogo" / "Preparar jogo fora da lista" and the
// "Editar" form on an existing manual game — same opponent picker and match
// fields either way, just what happens with the result differs.
export default function ManualPreparationForm({
  initialMatchDate = "",
  currentOpponentName,
  requireOpponent = true,
  submitLabel,
  isSaving = false,
  onSubmit,
  onCancel,
  competitions = [],
  initialDetails,
}: {
  initialMatchDate?: string;
  // Edit mode only: the opponent the game already has.
  currentOpponentName?: string;
  // false in edit mode — not picking another opponent there means "keep the
  // current one", not "missing".
  requireOpponent?: boolean;
  submitLabel: string;
  isSaving?: boolean;
  onSubmit: (opponent: ManualOpponentSelection, matchDateIso: string, details: ManualMatchDetails) => void;
  onCancel?: () => void;
  // The club's current competitions, offered as the game's competition.
  competitions?: CompetitionOption[];
  initialDetails?: ManualMatchDetails;
}) {
  const t = useTranslations("dashboard");
  const friendlyLabel = t("manualMatchFriendly");
  const [opponent, setOpponent] = useState<OpponentChoice>(null);
  const [matchDate, setMatchDate] = useState(initialMatchDate);
  const [competitionChoice, setCompetitionChoice] = useState<CompetitionChoice>(() =>
    initialChoice(initialDetails, competitions, friendlyLabel),
  );
  const [customCompetition, setCustomCompetition] = useState(
    initialChoice(initialDetails, competitions, friendlyLabel) === "custom"
      ? (initialDetails?.competition?.name ?? "")
      : "",
  );
  const [isHome, setIsHome] = useState(initialDetails?.isHome ?? true);
  const [goalsFor, setGoalsFor] = useState(
    initialDetails?.goalsFor != null ? String(initialDetails.goalsFor) : "",
  );
  const [goalsAgainst, setGoalsAgainst] = useState(
    initialDetails?.goalsAgainst != null ? String(initialDetails.goalsAgainst) : "",
  );
  const isPast = matchDate ? new Date(matchDate).getTime() < new Date().getTime() : false;

  const canSubmit = Boolean(matchDate && (opponent || !requireOpponent));
  // The source's own friendlies entry backs the single "Amigável" option
  // (keeping its id and logo) instead of being listed next to it.
  const apiFriendlies = competitions.find((c) => isFriendlies(c.name)) ?? null;
  const listedCompetitions = competitions.filter((c) => !isFriendlies(c.name));

  function handleSubmit() {
    if (!canSubmit) return;
    const selection: ManualOpponentSelection = !opponent
      ? null
      : opponent.kind === "club"
        ? { teamId: opponent.team.id }
        : { name: opponent.name, logo: opponent.logo };
    const apiCompetition = competitionChoice.startsWith("api:")
      ? competitions.find((c) => `api:${c.id}` === competitionChoice)
      : null;
    const competition: ManualMatchDetails["competition"] = apiCompetition
      ? { leagueId: apiCompetition.id, name: apiCompetition.name, logo: apiCompetition.logo }
      : competitionChoice === "friendly"
        ? { leagueId: apiFriendlies?.id ?? null, name: friendlyLabel, logo: apiFriendlies?.logo ?? null }
        : competitionChoice === "custom" && customCompetition.trim()
          ? { leagueId: null, name: customCompetition.trim(), logo: null }
          : null;
    onSubmit(selection, new Date(matchDate).toISOString(), {
      competition,
      isHome,
      goalsFor: isPast && goalsFor !== "" ? Number(goalsFor) : null,
      goalsAgainst: isPast && goalsAgainst !== "" ? Number(goalsAgainst) : null,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <OpponentPicker value={opponent} onChange={setOpponent} currentOpponentName={currentOpponentName} />

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div>
          <label className={labelClass}>{t("preparationDateLabel")}</label>
          <input
            type="datetime-local"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="min-w-[200px] flex-1">
          <label className={labelClass}>{t("columnCompetition")}</label>
          <div className="flex gap-2">
            <select
              value={competitionChoice}
              onChange={(e) => setCompetitionChoice(e.target.value)}
              className={`w-full ${fieldClass}`}
            >
              <option value="">{t("manualMatchNoCompetition")}</option>
              {listedCompetitions.map((c) => (
                <option key={c.id} value={`api:${c.id}`}>
                  {c.name}
                </option>
              ))}
              <option value="friendly">{friendlyLabel}</option>
              <option value="custom">{t("manualMatchOtherCompetition")}</option>
            </select>
            {competitionChoice === "custom" && (
              <input
                type="text"
                value={customCompetition}
                onChange={(e) => setCustomCompetition(e.target.value)}
                placeholder={t("manualMatchCompetitionPlaceholder")}
                className={`w-full ${fieldClass}`}
              />
            )}
          </div>
        </div>

        <div>
          <label className={labelClass}>{t("columnVenue")}</label>
          <div className="flex rounded-lg border border-border bg-background p-0.5">
            {([true, false] as const).map((home) => (
              <button
                key={String(home)}
                type="button"
                onClick={() => setIsHome(home)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isHome === home ? "bg-surface text-foreground shadow-sm" : "text-muted"
                }`}
              >
                {home ? t("homeLabel") : t("awayLabel")}
              </button>
            ))}
          </div>
        </div>

        {isPast && (
          <div>
            <label className={labelClass}>{t("manualMatchScoreLabel")}</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                value={goalsFor}
                onChange={(e) => setGoalsFor(e.target.value)}
                aria-label={t("liveStatsUs")}
                placeholder={t("liveStatsUs")}
                className={`w-16 px-2 text-center ${fieldClass}`}
              />
              <span className="text-muted">–</span>
              <input
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                value={goalsAgainst}
                onChange={(e) => setGoalsAgainst(e.target.value)}
                aria-label={t("liveStatsThem")}
                placeholder={t("liveStatsThem")}
                className={`w-16 px-2 text-center ${fieldClass}`}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground"
          >
            {t("cancelButton")}
          </button>
        )}
        <button
          type="button"
          disabled={!canSubmit || isSaving}
          onClick={handleSubmit}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? t("savingClub") : submitLabel}
        </button>
      </div>
    </div>
  );
}
