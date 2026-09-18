"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { searchOpponentClubs } from "../actions";
import type { TeamSearchResult, ApiFootballReason } from "@/lib/api-football/client";

export type ManualOpponentSelection = { teamId: number } | { name: string } | null;

// Shared by the "+ Jogo fora da lista" create form and the "Editar" form on
// an existing manual preparation — same search/custom-name/date fields
// either way, just what happens with the result differs.
export default function ManualPreparationForm({
  initialMatchDate = "",
  currentOpponentName,
  requireOpponent = true,
  submitLabel,
  isSaving = false,
  onSubmit,
  onCancel,
}: {
  initialMatchDate?: string;
  // Edit mode only: shown as context so leaving the search field empty
  // (keeping the current opponent) doesn't feel like a silent no-op.
  currentOpponentName?: string;
  // false in edit mode — leaving the opponent search untouched there means
  // "keep the current one", not "missing".
  requireOpponent?: boolean;
  submitLabel: string;
  isSaving?: boolean;
  onSubmit: (opponent: ManualOpponentSelection, matchDateIso: string) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("dashboard");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeamSearchResult[]>([]);
  const [error, setError] = useState<ApiFootballReason | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedClub, setSelectedClub] = useState<TeamSearchResult["team"] | null>(null);
  const [matchDate, setMatchDate] = useState(initialMatchDate);
  const [useCustomName, setUseCustomName] = useState(false);

  const opponentProvided = Boolean(selectedClub || (useCustomName && query.trim()));
  const canSubmit = Boolean(matchDate && (opponentProvided || (!requireOpponent && !query.trim())));

  async function handleSearch(value: string) {
    setQuery(value);
    setSelectedClub(null);
    setUseCustomName(false);
    setError(null);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const { results: found, error: fetchError } = await searchOpponentClubs(value);
    setResults(found);
    setError(fetchError ?? null);
    setIsSearching(false);
  }

  function handleSelectClub(team: TeamSearchResult["team"]) {
    setSelectedClub(team);
    setUseCustomName(false);
    setQuery(team.name);
    setResults([]);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const opponent: ManualOpponentSelection = selectedClub
      ? { teamId: selectedClub.id }
      : useCustomName
        ? { name: query.trim() }
        : null;
    onSubmit(opponent, new Date(matchDate).toISOString());
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label className="mb-1 block text-xs text-muted">{t("preparationOpponentLabel")}</label>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={currentOpponentName ?? t("clubFilterPlaceholder")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          {query.trim() && !selectedClub && !useCustomName && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
              {isSearching && <p className="p-3 text-sm text-muted">{t("loadingClubs")}</p>}
              {!isSearching &&
                results.map(({ team }) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => handleSelectClub(team)}
                    className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-background"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={team.logo} alt="" className="h-5 w-5 object-contain" />
                    <span className="flex-1 truncate">{team.name}</span>
                    <span className="shrink-0 text-xs text-muted">{team.country}</span>
                  </button>
                ))}
              {!isSearching && (
                <div className="p-3">
                  {results.length === 0 && <p className="text-sm text-muted">{t("noClubsFoundGeneric")}</p>}
                  <button
                    type="button"
                    onClick={() => setUseCustomName(true)}
                    className="mt-1.5 text-xs font-medium text-accent hover:underline"
                  >
                    {t("preparationUseCustomOpponentButton", { name: query.trim() })}
                  </button>
                </div>
              )}
            </div>
          )}
          {useCustomName && (
            <p className="mt-1.5 text-xs text-muted">
              {t("preparationCustomOpponentConfirmed", { name: query.trim() })}{" "}
              <button
                type="button"
                onClick={() => setUseCustomName(false)}
                className="font-medium text-accent hover:underline"
              >
                {t("editButton")}
              </button>
            </p>
          )}
          {!query.trim() && currentOpponentName && (
            <p className="mt-1.5 text-xs text-muted">{t("preparationKeepCurrentOpponentHint")}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">{t("preparationDateLabel")}</label>
          <input
            type="datetime-local"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canSubmit || isSaving}
            onClick={handleSubmit}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? t("savingClub") : submitLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted hover:text-foreground"
            >
              {t("cancelButton")}
            </button>
          )}
        </div>
      </div>

      {error === "not-subscribed" && (
        <p className="mt-2 text-sm text-red-500">
          A chave da API-Football ainda não está subscrita a nenhum plano no
          RapidAPI.
        </p>
      )}
      {error === "rate-limit" && (
        <p className="mt-2 text-sm text-red-500">
          Limite de pedidos à API-Football atingido por agora. Tenta de novo daqui a pouco.
        </p>
      )}
      {error === "unknown" && (
        <p className="mt-2 text-sm text-red-500">Não foi possível pesquisar clubes agora.</p>
      )}
    </div>
  );
}
