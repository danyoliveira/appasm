"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Icon from "@/components/Icon";
import CountryCombobox, { type ComboboxCountry } from "@/components/CountryCombobox";
import { findCountryForNationality } from "@/lib/api-football/flags";
import { createClient } from "@/lib/supabase/client";
import { cropToSquare } from "@/lib/cropToSquare";
import { setPlayerProfile } from "../actions";
import { translatePosition } from "./playerShared";
import {
  DETAILED_POSITIONS,
  POSITION_GROUP,
  PREFERRED_FEET,
  positionLabel,
  type DetailedPosition,
  type PlayerProfile,
  type PreferredFoot,
} from "./playerProfile";

const GROUPS = ["Goalkeeper", "Defender", "Midfielder", "Attacker"] as const;

const fieldClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "block text-sm font-medium";

// What the external source already says about the player, shown as the
// hint of an empty field — so it's clear what's used until the coach fills
// it in (and that there's nothing, where there isn't).
export interface PlayerSourceInfo {
  nationality?: string | null;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
}

// Everything the coach can set about a player, so a player the external
// source knows little about can have the same information as any other:
// positions and height (this spell at the club), weight (a new weigh-in),
// and foot, nationality and birth date (the player's, for good).
// Opened from the player's page (labelled button) or from the squad list
// (icon) — same dialog either way.
export default function PlayerProfileEditor({
  teamId,
  playerId,
  playerName,
  profile,
  photo = null,
  countries,
  source,
  variant = "button",
}: {
  teamId: number;
  playerId: number;
  // Shown in the dialog when it's opened from a list of players.
  playerName?: string;
  profile: PlayerProfile;
  // The photo on show right now (the coach's, or the source's).
  photo?: string | null;
  countries: ComboboxCountry[];
  source?: PlayerSourceInfo;
  variant?: "button" | "icon";
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState<DetailedPosition | "">("");
  const [secondary, setSecondary] = useState<DetailedPosition | "">("");
  const [foot, setFoot] = useState<PreferredFoot | null>(null);
  const [nationality, setNationality] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  // The coach's own photo (null = use the source's).
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function openEditor() {
    setPrimary(profile.primaryPosition ?? "");
    setSecondary(profile.secondaryPosition ?? "");
    setFoot(profile.preferredFoot);
    setNationality(findCountryForNationality(countries, profile.nationality)?.name ?? profile.nationality);
    setBirthDate(profile.birthDate ?? "");
    setHeight(profile.heightCm != null ? String(profile.heightCm) : "");
    setWeight(profile.weightKg != null ? String(profile.weightKg) : "");
    setPhotoUrl(profile.photoUrl);
    setPhotoFailed(false);
    setFailed(false);
    setOpen(true);
  }

  // Same as a hand-added player's photo: cropped square, stored in the
  // public "avatars" bucket under the coach's own folder.
  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setPhotoFailed(false);
    try {
      const blob = await cropToSquare(file);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no user");
      const path = `${user.id}/players/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setPhotoUrl(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    } catch {
      setPhotoFailed(true);
    } finally {
      setUploading(false);
    }
  }

  const toNumber = (value: string) => {
    const parsed = Number(value.trim().replace(",", "."));
    return value.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  function handleSave() {
    setFailed(false);
    startSaving(async () => {
      try {
        await setPlayerProfile(teamId, playerId, {
          primaryPosition: primary || null,
          // A second position only means something next to a main one, and
          // never the same one twice.
          secondaryPosition: primary && secondary && secondary !== primary ? secondary : null,
          preferredFoot: foot,
          nationality,
          birthDate: birthDate || null,
          photoUrl,
          heightCm: toNumber(height),
          weightKg: toNumber(weight),
        });
        setOpen(false);
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  }

  function renderOptions(exclude?: DetailedPosition | "") {
    return GROUPS.map((group) => (
      <optgroup key={group} label={translatePosition(group, t)}>
        {DETAILED_POSITIONS.filter((p) => POSITION_GROUP[p] === group && p !== exclude).map((p) => (
          <option key={p} value={p}>
            {positionLabel(p, t)}
          </option>
        ))}
      </optgroup>
    ));
  }

  // "Fonte externa: 174" under an empty field, or that the source has none.
  const sourceHint = (value: string | number | null | undefined, filled: boolean) =>
    source && !filled ? (
      <span className="mt-1 block text-[11px] font-normal text-muted">
        {value != null && value !== "" ? t("playerProfileSourceValue", { value }) : t("playerProfileSourceNone")}
      </span>
    ) : null;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={openEditor}
          title={t("playerProfileEditTitle")}
          aria-label={t("playerProfileEditTitle")}
          className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Icon name="target" className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <Icon name="target" className="h-3.5 w-3.5" />
          {t("playerProfileEditButton")}
        </button>
      )}

      {/* Portalled to <body>: the player header is its own stacking context
          (isolate + overflow-hidden), which would trap the dialog under the
          rest of the page. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => !isSaving && setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t("playerProfileEditTitle")}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl"
            >
              <h2 className="text-base font-semibold">{t("playerProfileEditTitle")}</h2>
              {playerName && <p className="text-sm font-medium text-accent">{playerName}</p>}
              <p className="mt-1 text-xs text-muted">{t("playerProfileHint")}</p>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-background"
                >
                  {(photoUrl ?? photo) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={(photoUrl ?? photo)!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted">
                      <Icon name="user" className="h-6 w-6" />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {uploading ? "..." : t("changePhoto")}
                  </span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
                <div className="min-w-0 text-xs">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="font-medium text-accent hover:underline disabled:opacity-50"
                  >
                    {uploading ? t("dossierUploading") : t("playerProfilePhotoUpload")}
                  </button>
                  {photoUrl && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrl(null)}
                      className="ml-3 font-medium text-muted hover:text-red-500"
                    >
                      {t("playerProfilePhotoRemove")}
                    </button>
                  )}
                  <p className="mt-0.5 text-muted">{t("playerProfilePhotoHint")}</p>
                  {photoFailed && <p className="mt-0.5 text-red-500">{t("manualPlayerPhotoError")}</p>}
                </div>
              </div>

              <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("playerProfileSectionField")}
              </h3>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  {t("primaryPositionLabel")}
                  <select
                    value={primary}
                    onChange={(e) => {
                      const next = e.target.value as DetailedPosition | "";
                      setPrimary(next);
                      if (!next || next === secondary) setSecondary("");
                    }}
                    className={`mt-1 ${fieldClass}`}
                  >
                    <option value="">{t("playerProfileNone")}</option>
                    {renderOptions()}
                  </select>
                </label>

                <label className={labelClass}>
                  {t("secondaryPositionLabel")}
                  <select
                    value={secondary}
                    disabled={!primary}
                    onChange={(e) => setSecondary(e.target.value as DetailedPosition | "")}
                    className={`mt-1 ${fieldClass} disabled:opacity-50`}
                  >
                    <option value="">{t("playerProfileNoSecondary")}</option>
                    {renderOptions(primary)}
                  </select>
                </label>

                <div className="sm:col-span-2">
                  <div className="text-sm font-medium">{t("preferredFootLabel")}</div>
                  <div className="mt-1 flex gap-1 rounded-lg border border-border bg-background p-1">
                    {PREFERRED_FEET.map((f) => (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={foot === f}
                        // Pressing the selected one again clears it.
                        onClick={() => setFoot(foot === f ? null : f)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          foot === f ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
                        }`}
                      >
                        {t(`preferredFoot_${f}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("playerProfileSectionPersonal")}
              </h3>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <div className={labelClass}>
                  {t("manualPlayerNationalityLabel")}
                  <div className="mt-1 font-normal">
                    <CountryCombobox
                      countries={countries}
                      value={nationality}
                      onChange={setNationality}
                      placeholder={t("manualPlayerNationalityPlaceholder")}
                      noResultsLabel={t("manualPlayerNoCountry")}
                    />
                  </div>
                  {sourceHint(source?.nationality, nationality != null)}
                </div>

                <label className={labelClass}>
                  {t("manualPlayerBirthLabel")}
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className={`mt-1 ${fieldClass}`}
                  />
                  {sourceHint(
                    source?.age != null ? t("opponentPlayerAge", { age: source.age }) : null,
                    birthDate !== "",
                  )}
                </label>

                <label className={labelClass}>
                  {t("statHeight")} (cm)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className={`mt-1 ${fieldClass}`}
                  />
                  {sourceHint(source?.heightCm != null ? `${source.heightCm} cm` : null, height.trim() !== "")}
                </label>

                <label className={labelClass}>
                  {t("statWeight")} (kg)
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={0}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    className={`mt-1 ${fieldClass}`}
                  />
                  {sourceHint(source?.weightKg != null ? `${source.weightKg} kg` : null, weight.trim() !== "")}
                </label>
              </div>

              {failed && <p className="mt-3 text-xs text-red-500">{t("playerProfileSaveError")}</p>}

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
                >
                  {t("cancelButton")}
                </button>
                <button
                  type="button"
                  disabled={isSaving || uploading}
                  onClick={handleSave}
                  className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isSaving ? t("savingClub") : t("saveNoteButton")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
