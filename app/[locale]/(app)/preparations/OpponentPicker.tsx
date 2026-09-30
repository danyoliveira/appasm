"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import TeamCrest from "@/components/TeamCrest";
import Icon from "@/components/Icon";
import { normalize } from "@/lib/text";
import { createClient } from "@/lib/supabase/client";
import { cropToSquare } from "@/lib/cropToSquare";
import { getClubsForCountry, getOpponentPickerData, searchOpponentClubs } from "../actions";
import type { TeamSearchResult, Country, ApiFootballReason } from "@/lib/api-football/client";

type Team = TeamSearchResult["team"];

// Either a club the external source knows, or one the coach creates on the
// spot (a name, and optionally its crest).
export type OpponentChoice =
  | { kind: "club"; team: Team }
  | { kind: "custom"; name: string; logo: string | null }
  | null;

// Same violet as every other "added by hand" thing in the app.
const CUSTOM_COLOR = "#7c3aed";

// The country's name in the app's language, from its ISO code.
function countryLabel(country: Pick<Country, "name" | "code">, locale: string): string {
  if (country.code && /^[A-Z]{2}$/.test(country.code)) {
    try {
      const name = new Intl.DisplayNames([locale], { type: "region" }).of(country.code);
      if (name && name !== country.code) return name;
    } catch {
      // Unknown code — keep the original name.
    }
  }
  return country.name.replace(/-/g, " ");
}

// Picking the opponent of a game added by hand, the same way the coach picks
// their own club: a country (starting on the club's own), then a club from a
// searchable grid of crests. A club that isn't there can be looked for in
// every country, or created right here with a name and a crest.
export default function OpponentPicker({
  value,
  onChange,
  currentOpponentName,
}: {
  value: OpponentChoice;
  onChange: (next: OpponentChoice) => void;
  // Edit mode: the opponent the game already has — kept unless another one
  // is picked, so the picker starts folded behind it.
  currentOpponentName?: string;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();

  const [countries, setCountries] = useState<Country[]>([]);
  const [ownTeamId, setOwnTeamId] = useState<number | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState("");
  const [isCountryFieldFocused, setIsCountryFieldFocused] = useState(false);
  const [clubs, setClubs] = useState<TeamSearchResult[]>([]);
  const [clubFilter, setClubFilter] = useState("");
  const [error, setError] = useState<ApiFootballReason | null>(null);
  const [isLoadingClubs, startLoadingClubs] = useTransition();
  // Results of "look in every country", when asked for.
  const [worldResults, setWorldResults] = useState<TeamSearchResult[] | null>(null);
  const [isSearchingWorld, startSearchingWorld] = useTransition();
  const [folded, setFolded] = useState(Boolean(currentOpponentName));
  // Creating a club by hand.
  const [creating, setCreating] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedCountries = useMemo(
    () =>
      countries
        .filter((c) => c.name !== "World")
        .map((c) => ({ ...c, label: countryLabel(c, locale) }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [countries, locale],
  );
  const labelOf = (name: string) => sortedCountries.find((c) => c.name === name)?.label ?? name.replace(/-/g, " ");

  function loadClubs(name: string) {
    startLoadingClubs(async () => {
      const { results, error: fetchError } = await getClubsForCountry(name);
      setClubs(results);
      setError(fetchError ?? null);
    });
  }

  // Country list, opening on the coach's own club's country.
  useEffect(() => {
    let cancelled = false;
    getOpponentPickerData().then(({ countries: list, defaultCountry, ownTeamId: own }) => {
      if (cancelled) return;
      setCountries(list);
      setOwnTeamId(own);
      const initial = list.find((c) => c.name === defaultCountry);
      if (initial) {
        setCountry(initial.name);
        setCountryFilter(countryLabel(initial, locale));
        loadClubs(initial.name);
      }
    });
    return () => {
      cancelled = true;
    };
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
    // National teams (named after the country) go last.
    return [...list].sort((a, b) => Number(a.team.name === a.team.country) - Number(b.team.name === b.team.country));
  }, [clubs, clubFilter]);

  function handleCountrySelect(name: string, label: string) {
    setCountry(name);
    setCountryFilter(label);
    setIsCountryFieldFocused(false);
    setClubs([]);
    setClubFilter("");
    setWorldResults(null);
    setError(null);
    loadClubs(name);
  }

  function searchEverywhere() {
    const query = clubFilter.trim();
    if (!query) return;
    startSearchingWorld(async () => {
      const { results, error: fetchError } = await searchOpponentClubs(query);
      setWorldResults(results);
      setError(fetchError ?? null);
    });
  }

  function startCreating() {
    setCustomName(clubFilter.trim());
    setCustomLogo(null);
    setLogoFailed(false);
    setCreating(true);
  }

  // Cropped square, in the public "avatars" bucket under the coach's folder
  // — same as a hand-added player's photo.
  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setLogoFailed(false);
    try {
      const blob = await cropToSquare(file);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no user");
      const path = `${user.id}/clubs/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      setCustomLogo(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    } catch {
      setLogoFailed(true);
    } finally {
      setUploading(false);
    }
  }

  // A crest for a club without one: its initial on the "by hand" colour.
  function renderCustomCrest(name: string, logo: string | null, size: string, text: string) {
    return logo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logo} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
    ) : (
      <span
        className={`${size} flex shrink-0 items-center justify-center rounded-full font-bold text-white ${text}`}
        style={{ background: `linear-gradient(135deg, ${CUSTOM_COLOR}, #4f46e5)` }}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-muted";

  // --- Chosen --------------------------------------------------------------
  if (value) {
    const isCustom = value.kind === "custom";
    return (
      <div>
        <span className={labelClass}>{t("preparationOpponentLabel")}</span>
        <div
          className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5"
          style={isCustom ? { borderColor: `${CUSTOM_COLOR}55` } : undefined}
        >
          {isCustom ? (
            renderCustomCrest(value.name, value.logo, "h-10 w-10", "text-base")
          ) : (
            <TeamCrest logo={value.team.logo} className="h-10 w-10" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{isCustom ? value.name : value.team.name}</div>
            <div className="truncate text-xs text-muted">
              {isCustom ? t("opponentCustomBadge") : labelOf(value.team.country)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {t("opponentChangeButton")}
          </button>
        </div>
      </div>
    );
  }

  // --- Edit mode, untouched: the opponent the game already has ---------------
  if (folded && currentOpponentName) {
    return (
      <div>
        <span className={labelClass}>{t("preparationOpponentLabel")}</span>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-border">
            <Icon name="shield" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">{currentOpponentName}</div>
          <button
            type="button"
            onClick={() => setFolded(false)}
            className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
          >
            {t("opponentChangeButton")}
          </button>
        </div>
      </div>
    );
  }

  // --- Creating a club -------------------------------------------------------
  if (creating) {
    const name = customName.trim();
    return (
      <div>
        <span className={labelClass}>{t("opponentCreateTitle")}</span>
        <div
          className="relative overflow-hidden rounded-2xl border p-4"
          style={{
            borderColor: `${CUSTOM_COLOR}55`,
            background: `radial-gradient(120% 140% at 0% 0%, ${CUSTOM_COLOR}1f 0%, ${CUSTOM_COLOR}0a 45%, transparent 75%)`,
          }}
        >
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="flex shrink-0 flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="group relative rounded-full ring-4 ring-surface transition-transform hover:scale-105"
                title={t("opponentCreateCrestHint")}
              >
                {renderCustomCrest(name, customLogo, "h-20 w-20", "text-3xl")}
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading ? "..." : customLogo ? t("changePhoto") : t("opponentCreateCrestButton")}
                </span>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
              {customLogo ? (
                <button
                  type="button"
                  onClick={() => setCustomLogo(null)}
                  className="text-[11px] font-medium text-muted hover:text-red-500"
                >
                  {t("playerProfilePhotoRemove")}
                </button>
              ) : (
                <span className="text-[11px] text-muted">{t("opponentCreateCrestHint")}</span>
              )}
            </div>

            <div className="w-full min-w-0 flex-1">
              <label className="block text-sm font-medium">
                {t("opponentCreateNameLabel")}
                <input
                  type="text"
                  value={customName}
                  autoFocus
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name && !uploading) {
                      e.preventDefault();
                      onChange({ kind: "custom", name, logo: customLogo });
                      setCreating(false);
                    }
                  }}
                  placeholder={t("opponentCreateNamePlaceholder")}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal text-foreground outline-none focus:border-accent"
                />
              </label>
              <p className="mt-2 text-xs text-muted">{t("opponentCreateHint")}</p>
              {logoFailed && <p className="mt-1 text-xs text-red-500">{t("manualPlayerPhotoError")}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!name || uploading}
                  onClick={() => {
                    onChange({ kind: "custom", name, logo: customLogo });
                    setCreating(false);
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: CUSTOM_COLOR }}
                >
                  {t("opponentCreateConfirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-foreground"
                >
                  ← {t("opponentCreateBack")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Choosing --------------------------------------------------------------
  const showCountryDropdown = isCountryFieldFocused && filteredCountries.length > 0;
  const shownClubs = (worldResults ?? filteredClubs).filter(({ team }) => team.id !== ownTeamId);
  const typedClub = clubFilter.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="relative">
          <label className={labelClass}>{t("clubPickerCountryLabel")}</label>
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
              onChange={(e) => setCountryFilter(e.target.value)}
              onFocus={(e) => {
                setIsCountryFieldFocused(true);
                e.target.select();
              }}
              onBlur={() =>
                setTimeout(() => {
                  setIsCountryFieldFocused(false);
                  // Left without picking: back to the chosen country's name.
                  setCountryFilter((current) => (selectedCountry ? selectedCountry.label : current));
                }, 150)
              }
              placeholder={t("countryPlaceholder")}
              className={`w-full rounded-lg border border-border bg-background py-2 pr-3 text-sm text-foreground outline-none focus:border-accent ${
                selectedCountry?.flag && !isCountryFieldFocused ? "pl-10" : "pl-3"
              }`}
            />
          </div>

          {showCountryDropdown && (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
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
          <label className={labelClass}>{t("preparationOpponentLabel")}</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" className="h-4 w-4" />
            </span>
            <input
              type="text"
              value={clubFilter}
              onChange={(e) => {
                setClubFilter(e.target.value);
                setWorldResults(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filteredClubs.length === 0) searchEverywhere();
                }
              }}
              placeholder={t("clubSearchPlaceholder")}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {error === "not-subscribed" && <p className="text-sm text-red-500">{t("clubsErrorNotSubscribed")}</p>}
      {error === "rate-limit" && <p className="text-sm text-red-500">{t("clubsErrorRateLimit")}</p>}
      {error === "unknown" && <p className="text-sm text-red-500">{t("clubsErrorUnknown")}</p>}

      {worldResults && (
        <p className="text-xs text-muted">
          {t("opponentWorldResults", { query: typedClub })}{" "}
          <button type="button" onClick={() => setWorldResults(null)} className="font-medium text-accent hover:underline">
            {t("opponentWorldBack")}
          </button>
        </p>
      )}

      {isLoadingClubs || isSearchingWorld ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-border/50" />
          ))}
        </div>
      ) : shownClubs.length > 0 ? (
        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {shownClubs.map(({ team }) => (
            <button
              key={team.id}
              type="button"
              onClick={() => onChange({ kind: "club", team })}
              className="flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-accent hover:bg-surface"
            >
              <TeamCrest logo={team.logo} className="h-8 w-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{team.name}</span>
                {worldResults && <span className="block truncate text-[11px] text-muted">{labelOf(team.country)}</span>}
              </span>
            </button>
          ))}
        </div>
      ) : (
        !error && (
          <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
            {!country && !worldResults
              ? t("clubPickCountryFirst")
              : typedClub
                ? worldResults
                  ? t("opponentWorldNoMatch", { query: typedClub })
                  : t("clubSearchNoMatch", { query: typedClub })
                : t("noClubsFound")}
          </p>
        )
      )}

      {/* Not there? Look everywhere, or create it. */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed px-3 py-2.5"
        style={{ borderColor: `${CUSTOM_COLOR}55`, background: `${CUSTOM_COLOR}0a` }}
      >
        {renderCustomCrest(typedClub || "+", null, "h-8 w-8", "text-sm")}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t("opponentNotFoundTitle")}</div>
          <div className="text-xs text-muted">{t("opponentNotFoundHint")}</div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {typedClub && !worldResults && (
            <button
              type="button"
              disabled={isSearchingWorld}
              onClick={searchEverywhere}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {t("opponentSearchEverywhere")}
            </button>
          )}
          <button
            type="button"
            onClick={startCreating}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            style={{ background: CUSTOM_COLOR }}
          >
            + {typedClub ? t("opponentCreateNamed", { name: typedClub }) : t("opponentCreateButton")}
          </button>
        </div>
      </div>

      {currentOpponentName && (
        <button
          type="button"
          onClick={() => setFolded(true)}
          className="self-start text-xs font-medium text-muted hover:text-foreground"
        >
          ← {t("opponentKeepCurrent", { name: currentOpponentName })}
        </button>
      )}
    </div>
  );
}
