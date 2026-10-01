"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import TeamCrest from "@/components/TeamCrest";
import Icon from "@/components/Icon";
import { normalize } from "@/lib/text";
import { getClubsForCountry, updateClub } from "../actions";
import type { TeamSearchResult, Country, ApiFootballReason } from "@/lib/api-football/client";

export interface CurrentClub {
  id: number;
  name: string;
  logo: string | null;
  // As the data source names it ("Portugal", "Spain") — opens the picker
  // on that country straight away.
  country: string | null;
}

// The country's name in the app's language ("Portugal", "Espanha"…), from
// its ISO code; the source's English name when there is none.
function countryLabel(country: Country, locale: string): string {
  if (country.code && /^[A-Z]{2}$/.test(country.code)) {
    try {
      const name = new Intl.DisplayNames([locale], { type: "region" }).of(country.code);
      if (name && name !== country.code) return name;
    } catch {
      // Unknown code — keep the original name.
    }
  }
  return country.name;
}

// Choose a club in two moves: a country (pre-set to the current club's), then
// a club from a searchable grid of crests. Switching away from a club ends
// with a "from → to" step that spells out what happens, since it archives
// the current one.
export default function ClubPicker({
  countries,
  currentClub = null,
  onDone,
}: {
  countries: Country[];
  currentClub?: CurrentClub | null;
  // After the club was saved (e.g. to close the dialog).
  onDone?: () => void;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();

  const sortedCountries = useMemo(
    () =>
      countries
        .map((c) => ({ ...c, label: countryLabel(c, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [countries, locale],
  );
  const initialCountry = sortedCountries.find((c) => c.name === currentClub?.country) ?? null;

  const [country, setCountry] = useState<string | null>(initialCountry?.name ?? null);
  const [countryFilter, setCountryFilter] = useState(initialCountry?.label ?? "");
  const [isCountryFieldFocused, setIsCountryFieldFocused] = useState(false);
  const [clubs, setClubs] = useState<TeamSearchResult[]>([]);
  const [clubFilter, setClubFilter] = useState("");
  const [error, setError] = useState<ApiFootballReason | null>(null);
  const [isLoadingClubs, startLoadingClubs] = useTransition();
  // The club picked in the grid, waiting for the final confirmation.
  const [chosen, setChosen] = useState<TeamSearchResult["team"] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  function loadClubs(name: string) {
    startLoadingClubs(async () => {
      const { results, error: fetchError } = await getClubsForCountry(name);
      setClubs(results);
      setError(fetchError ?? null);
    });
  }

  // Opens already showing the current club's country.
  useEffect(() => {
    if (initialCountry) loadClubs(initialCountry.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCountry = sortedCountries.find((c) => c.name === country) ?? null;
  const filteredCountries = useMemo(() => {
    // The untouched field shows the whole list, not just the chosen country.
    const typed = selectedCountry && countryFilter === selectedCountry.label ? "" : countryFilter;
    if (!typed.trim()) return sortedCountries;
    const needle = normalize(typed.trim());
    return sortedCountries.filter((c) => normalize(c.label).includes(needle) || normalize(c.name).includes(needle));
  }, [sortedCountries, countryFilter, selectedCountry]);

  const filteredClubs = useMemo(() => {
    const needle = normalize(clubFilter.trim());
    const list = needle ? clubs.filter(({ team }) => normalize(team.name).includes(needle)) : clubs;
    // National teams (named after the country) go last — a club is what is
    // nearly always wanted.
    return [...list].sort(
      (a, b) => Number(a.team.name === a.team.country) - Number(b.team.name === b.team.country),
    );
  }, [clubs, clubFilter]);

  function handleCountrySelect(name: string, label: string) {
    setCountry(name);
    setCountryFilter(label);
    setIsCountryFieldFocused(false);
    setClubs([]);
    setClubFilter("");
    setError(null);
    loadClubs(name);
  }

  async function saveClub(team: TeamSearchResult["team"]) {
    setIsSaving(true);
    setSaveFailed(false);
    try {
      await updateClub(team.id);
      router.refresh();
      onDone?.();
    } catch {
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  }

  // --- Final step: from → to ---------------------------------------------
  if (chosen) {
    return (
      <div>
        <div className="flex items-center justify-center gap-4 rounded-2xl border border-border bg-background px-4 py-6 sm:gap-8">
          {currentClub && (
            <>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center opacity-70">
                <TeamCrest logo={currentClub.logo} className="h-14 w-14" />
                <span className="max-w-full truncate text-sm font-medium">{currentClub.name}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-border">
                  {t("clubGoesToArchive")}
                </span>
              </div>
              <span aria-hidden className="shrink-0 text-2xl text-muted">
                →
              </span>
            </>
          )}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
            <TeamCrest logo={chosen.logo} className="h-16 w-16" />
            <span className="max-w-full truncate text-base font-semibold">{chosen.name}</span>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
              {t("clubBecomesCurrent")}
            </span>
          </div>
        </div>

        {currentClub && (
          <p className="mt-3 text-sm text-muted">{t("changeClubConfirmMessage", { current: currentClub.name })}</p>
        )}
        {saveFailed && <p className="mt-2 text-sm text-red-500">{t("liveConfigSaveError")}</p>}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              setChosen(null);
              setSaveFailed(false);
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
          >
            ← {t("liveStatsBackButton")}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => saveClub(chosen)}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? t("savingClub") : t("changeClubConfirmButton", { club: chosen.name })}
          </button>
        </div>
      </div>
    );
  }

  // --- Choosing -----------------------------------------------------------
  const showCountryDropdown = isCountryFieldFocused && filteredCountries.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="relative">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t("clubPickerCountryLabel")}
          </label>
          <div className="relative">
            {selectedCountry?.flag && !isCountryFieldFocused && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedCountry.flag}
                alt=""
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-5 -translate-y-1/2 rounded-sm object-cover"
              />
            )}
            <input
              type="text"
              value={countryFilter}
              onChange={(e) => {
                setCountryFilter(e.target.value);
                // Typing again right after a pick reopens the list.
                setIsCountryFieldFocused(true);
              }}
              onFocus={(e) => {
                setIsCountryFieldFocused(true);
                e.target.select();
              }}
              onBlur={() => {
                setIsCountryFieldFocused(false);
                // Left without picking: back to the chosen country's name.
                setCountryFilter((current) => (selectedCountry ? selectedCountry.label : current));
              }}
              placeholder={t("countryPlaceholder")}
              className={`w-full rounded-lg border border-border bg-background py-2 pr-3 text-sm text-foreground outline-none focus:border-accent ${
                selectedCountry?.flag && !isCountryFieldFocused ? "pl-10" : "pl-3"
              }`}
            />
          </div>

          {showCountryDropdown && (
            <div
              // Keeps the field focused while picking, so its blur can't
              // undo the pick with the previous country's name.
              onMouseDown={(e) => e.preventDefault()}
              className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
              {filteredCountries.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => handleCountrySelect(c.name, c.label)}
                  className={`flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-background ${
                    c.name === country ? "font-semibold text-accent" : ""
                  }`}
                >
                  {c.flag ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.flag} alt="" className="h-3.5 w-5 shrink-0 rounded-sm object-cover" />
                  ) : (
                    <span className="h-3.5 w-5 shrink-0" />
                  )}
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
            {t("clubPickerClubLabel")}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={clubFilter}
              onChange={(e) => setClubFilter(e.target.value)}
              disabled={!country}
              placeholder={country ? t("clubSearchPlaceholder") : t("clubPickCountryFirst")}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60"
            />
          </div>
        </div>
      </div>

      {error === "not-subscribed" && <p className="text-sm text-red-500">{t("clubsErrorNotSubscribed")}</p>}
      {error === "rate-limit" && <p className="text-sm text-red-500">{t("clubsErrorRateLimit")}</p>}
      {error === "unknown" && <p className="text-sm text-red-500">{t("clubsErrorUnknown")}</p>}
      {saveFailed && <p className="text-sm text-red-500">{t("liveConfigSaveError")}</p>}

      {!country ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {t("clubPickCountryFirst")}
        </p>
      ) : isLoadingClubs ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-border/50" />
          ))}
        </div>
      ) : !error && filteredClubs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {clubs.length === 0 ? t("noClubsFound") : t("clubSearchNoMatch", { query: clubFilter.trim() })}
        </p>
      ) : (
        !error && (
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {filteredClubs.map(({ team }) => {
              const isCurrent = team.id === currentClub?.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  disabled={isCurrent || isSaving}
                  onClick={() => (currentClub ? setChosen(team) : saveClub(team))}
                  className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    isCurrent
                      ? "border-accent/40 bg-accent/5"
                      : "border-border bg-background hover:border-accent hover:bg-surface disabled:opacity-60"
                  }`}
                >
                  <TeamCrest logo={team.logo} className="h-8 w-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{team.name}</span>
                    {isCurrent && <span className="block text-[10px] font-medium text-accent">{t("clubCurrentBadge")}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
