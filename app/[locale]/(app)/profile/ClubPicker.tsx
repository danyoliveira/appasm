"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { getClubsForCountry, updateClub } from "../actions";
import type { TeamSearchResult, Country, ApiFootballReason } from "@/lib/api-football/client";

export default function ClubPicker({ countries }: { countries: Country[] }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [country, setCountry] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState("");
  const [isCountryFieldFocused, setIsCountryFieldFocused] = useState(false);
  const [clubs, setClubs] = useState<TeamSearchResult[]>([]);
  const [clubFilter, setClubFilter] = useState("");
  const [error, setError] = useState<ApiFootballReason | null>(null);
  const [isLoadingClubs, startLoadingClubs] = useTransition();
  const [savingClubId, setSavingClubId] = useState<number | null>(null);
  const [savedClubId, setSavedClubId] = useState<number | null>(null);

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  const filteredCountries = useMemo(() => {
    if (!countryFilter.trim()) return sortedCountries;
    const needle = countryFilter.trim().toLowerCase();
    return sortedCountries.filter((c) => c.name.toLowerCase().includes(needle));
  }, [sortedCountries, countryFilter]);

  const filteredClubs = useMemo(() => {
    if (!clubFilter.trim()) return clubs;
    const needle = clubFilter.trim().toLowerCase();
    return clubs.filter(({ team }) => team.name.toLowerCase().includes(needle));
  }, [clubs, clubFilter]);

  function handleCountrySelect(name: string) {
    setCountry(name);
    setCountryFilter(name);
    setIsCountryFieldFocused(false);
    setClubs([]);
    setClubFilter("");
    setError(null);
    setSavedClubId(null);

    startLoadingClubs(async () => {
      const { results, error: fetchError } = await getClubsForCountry(name);
      setClubs(results);
      setError(fetchError ?? null);
    });
  }

  async function handleSelectClub(teamId: number) {
    setSavingClubId(teamId);
    setSavedClubId(null);
    try {
      await updateClub(teamId);
      setSavedClubId(teamId);
      router.refresh();
    } finally {
      setSavingClubId(null);
    }
  }

  const showCountryDropdown = isCountryFieldFocused && filteredCountries.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          type="text"
          value={countryFilter}
          onChange={(e) => {
            setCountryFilter(e.target.value);
            if (e.target.value !== country) setCountry(null);
          }}
          onFocus={() => setIsCountryFieldFocused(true)}
          onBlur={() => setTimeout(() => setIsCountryFieldFocused(false), 150)}
          placeholder={t("countryPlaceholder")}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
        />

        {showCountryDropdown && (
          <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
            {filteredCountries.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => handleCountrySelect(c.name)}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-background"
              >
                {c.flag && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.flag} alt="" className="h-4 w-6 object-contain" />
                )}
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error === "not-subscribed" && (
        <p className="text-sm text-red-500">
          A chave da API-Football ainda não está subscrita a nenhum plano no
          RapidAPI. Vai à página da API-Football no RapidAPI e subscreve o plano
          gratuito (Basic).
        </p>
      )}
      {error === "rate-limit" && (
        <p className="text-sm text-red-500">
          Limite de pedidos à API-Football atingido por agora. Tenta de novo daqui a
          pouco.
        </p>
      )}
      {error === "unknown" && (
        <p className="text-sm text-red-500">
          Não foi possível carregar os clubes agora. Tenta de novo.
        </p>
      )}

      {country && !error && (
        <>
          <input
            type="text"
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value)}
            placeholder={t("clubFilterPlaceholder")}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
          />

          <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-surface">
            {isLoadingClubs && (
              <p className="p-3 text-sm text-muted">{t("loadingClubs")}</p>
            )}
            {!isLoadingClubs &&
              filteredClubs.map(({ team }) => (
                <button
                  key={team.id}
                  type="button"
                  disabled={savingClubId !== null}
                  onClick={() => handleSelectClub(team.id)}
                  className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-background disabled:opacity-60"
                >
                  <span className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={team.logo} alt="" className="h-6 w-6 object-contain" />
                    <span>{team.name}</span>
                  </span>
                  {savingClubId === team.id && (
                    <span className="shrink-0 text-xs text-muted">{t("savingClub")}</span>
                  )}
                  {savedClubId === team.id && (
                    <span className="shrink-0 text-xs text-green-600">✓ {t("clubSaved")}</span>
                  )}
                </button>
              ))}
            {!isLoadingClubs && clubs.length === 0 && (
              <p className="p-3 text-sm text-muted">{t("noClubsFound")}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
