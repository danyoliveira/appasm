"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { searchOpponentClubs, createManualPreparation } from "../actions";
import type { TeamSearchResult, ApiFootballReason } from "@/lib/api-football/client";

export default function AddManualPreparation() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TeamSearchResult[]>([]);
  const [error, setError] = useState<ApiFootballReason | null>(null);
  const [isSearching, startSearching] = useTransition();
  const [selectedClub, setSelectedClub] = useState<TeamSearchResult["team"] | null>(null);
  const [matchDate, setMatchDate] = useState("");
  const [isSaving, startSaving] = useTransition();

  function handleSearch(value: string) {
    setQuery(value);
    setSelectedClub(null);
    setError(null);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    startSearching(async () => {
      const { results: found, error: fetchError } = await searchOpponentClubs(value);
      setResults(found);
      setError(fetchError ?? null);
    });
  }

  function handleSelectClub(team: TeamSearchResult["team"]) {
    setSelectedClub(team);
    setQuery(team.name);
    setResults([]);
  }

  function handleSubmit() {
    if (!selectedClub || !matchDate) return;
    startSaving(async () => {
      const id = await createManualPreparation(selectedClub.id, new Date(matchDate).toISOString());
      router.push(`/dashboard/preparations/manual-${id}`);
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent"
      >
        + {t("preparationAddManualButton")}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("preparationAddManualTitle")}</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          {t("cancelButton")}
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <label className="mb-1 block text-xs text-muted">{t("preparationOpponentLabel")}</label>
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t("clubFilterPlaceholder")}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          {query.trim() && !selectedClub && (
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
              {!isSearching && results.length === 0 && (
                <p className="p-3 text-sm text-muted">{t("noClubsFoundGeneric")}</p>
              )}
            </div>
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

        <button
          type="button"
          disabled={!selectedClub || !matchDate || isSaving}
          onClick={handleSubmit}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isSaving ? t("savingClub") : t("preparationStartButton")}
        </button>
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
