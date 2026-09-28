"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cropToSquare } from "@/lib/cropToSquare";
import { nameSimilarity } from "@/lib/playerMatching";
import Icon from "@/components/Icon";
import PlayerAvatar from "@/components/PlayerAvatar";
import ConfirmDialog from "@/components/ConfirmDialog";
import CountryCombobox, { type ComboboxCountry } from "@/components/CountryCombobox";
import { findCountryForNationality } from "@/lib/api-football/flags";
import {
  addManualPlayer,
  deleteManualPlayer,
  searchApiPlayers,
  updateManualPlayer,
  type ApiPlayerSearchResult,
  type ManualPlayerInput,
} from "../actions";

export interface ManualPlayerInfo {
  id: number;
  name: string;
  position: ManualPlayerInput["position"];
  number: number | null;
  birthDate: string | null;
  nationality: string | null;
  photoUrl: string | null;
}

const POSITIONS: { key: ManualPlayerInput["position"]; labelKey: string }[] = [
  { key: "Goalkeeper", labelKey: "positionGoalkeeper" },
  { key: "Defender", labelKey: "positionDefender" },
  { key: "Midfielder", labelKey: "positionMidfielder" },
  { key: "Attacker", labelKey: "positionAttacker" },
];

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent";

function toPosition(apiPosition: string | null): ManualPlayerInput["position"] {
  return POSITIONS.some((p) => p.key === apiPosition)
    ? (apiPosition as ManualPlayerInput["position"])
    : "Midfielder";
}

// Add a player to the squad by hand (optionally found through an
// API-Football search, so they keep their real id), or edit/delete one.
export default function ManualPlayerDialog({
  teamId,
  editing,
  squadPlayers,
  countries,
  onClose,
}: {
  teamId: number;
  editing: ManualPlayerInfo | null;
  // Current squad — to warn about a likely duplicate while typing a name.
  squadPlayers: { id: number; name: string; photo: string }[];
  // API-Football's /countries — nationality is picked from it so the flag
  // resolves the same way it does for API players.
  countries: ComboboxCountry[];
  onClose: () => void;
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ApiPlayerSearchResult[] | null>(null);
  const [apiPlayer, setApiPlayer] = useState<ApiPlayerSearchResult | null>(null);

  const [name, setName] = useState(editing?.name ?? "");
  const [position, setPosition] = useState<ManualPlayerInput["position"]>(
    editing?.position ?? "Midfielder",
  );
  const [number, setNumber] = useState(editing?.number != null ? String(editing.number) : "");
  const [birthDate, setBirthDate] = useState(editing?.birthDate ?? "");
  const [nationality, setNationality] = useState<string | null>(
    findCountryForNationality(countries, editing?.nationality)?.name ?? editing?.nationality ?? null,
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(editing?.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounced API search (only when adding).
  useEffect(() => {
    if (editing) return;
    const q = search.trim();
    if (q.length < 3) return;
    const handle = setTimeout(async () => {
      setSearching(true);
      const res = await searchApiPlayers(q);
      setResults(res.results);
      setSearching(false);
    }, 450);
    return () => clearTimeout(handle);
  }, [search, editing]);

  const likelyDuplicate =
    name.trim().length >= 3
      ? squadPlayers
          .filter((p) => p.id !== editing?.id && p.id !== apiPlayer?.id)
          .map((p) => ({ p, score: nameSimilarity(name, p.name) }))
          .filter((x) => x.score >= 0.8)
          .sort((a, b) => b.score - a.score)[0]?.p
      : undefined;
  const alreadyInSquad = apiPlayer ? squadPlayers.some((p) => p.id === apiPlayer.id) : false;

  function pickApiPlayer(result: ApiPlayerSearchResult) {
    setApiPlayer(result);
    setName(result.name);
    setPosition(toPosition(result.position));
    setNumber(result.number != null ? String(result.number) : "");
    setBirthDate(result.birthDate ?? "");
    setNationality(findCountryForNationality(countries, result.nationality)?.name ?? null);
    setPhotoUrl(result.photo);
    setResults(null);
    setSearch("");
  }

  function clearApiPlayer() {
    setApiPlayer(null);
    setPhotoUrl(null);
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await cropToSquare(file);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("no user");
      const path = `${user.id}/manual-players/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      setPhotoUrl(supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl);
    } catch {
      setError(t("manualPlayerPhotoError"));
    } finally {
      setUploading(false);
    }
  }

  const canSave = !isPending && !uploading && name.trim().length > 0 && !alreadyInSquad;

  function save() {
    if (!canSave) return;
    const input: ManualPlayerInput = {
      name: name.trim(),
      position,
      number: number.trim() === "" ? null : Number(number),
      birthDate: birthDate || null,
      nationality,
      photoUrl,
    };
    setError(null);
    startTransition(async () => {
      try {
        if (editing) await updateManualPlayer(editing.id, input);
        else await addManualPlayer(teamId, input, apiPlayer?.id ?? null);
        router.refresh();
        onClose();
      } catch {
        setError(t("manualPlayerSaveError"));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">
            {editing ? t("manualPlayerEditTitle") : t("manualPlayerAddTitle")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("cancelButton")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
          >
            <Icon name="x" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* API search */}
          {!editing && !apiPlayer && (
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <p className="mb-2 text-xs text-muted">{t("manualPlayerSearchHint")}</p>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  <Icon name="search" />
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value.trim().length < 3) setResults(null);
                  }}
                  placeholder={t("manualPlayerSearchPlaceholder")}
                  className={`${inputClass} bg-surface pl-9`}
                />
              </div>
              {searching && <p className="mt-2 text-xs text-muted">{t("manualPlayerSearching")}</p>}
              {!searching && results && (
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                  {results.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted">{t("manualPlayerNoApiResults")}</p>
                  ) : (
                    results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pickApiPlayer(r)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface"
                      >
                        <PlayerAvatar photo={r.photo} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="block truncate text-xs text-muted">
                            {[r.age != null ? `${r.age}` : null, r.nationality].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted">{t("manualPlayerOrManual")}</p>
            </div>
          )}

          {apiPlayer && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
              <Icon name="check" className="h-3.5 w-3.5" />
              <span className="flex-1">{t("manualPlayerFromApi")}</span>
              <button type="button" onClick={clearApiPlayer} className="font-medium hover:underline">
                {t("manualPlayerUnlinkApi")}
              </button>
            </div>
          )}

          {/* Photo + name */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={uploading || !!apiPlayer}
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-background disabled:cursor-default"
            >
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted">
                  <Icon name="user" className="h-6 w-6" />
                </span>
              )}
              {!apiPlayer && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading ? "..." : t("changePhoto")}
                </span>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhoto}
              className="sr-only"
            />
            <label className="block flex-1">
              <span className="mb-1.5 block text-xs font-medium text-muted">{t("manualPlayerNameLabel")}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("manualPlayerNamePlaceholder")}
                className={inputClass}
              />
            </label>
          </div>

          {alreadyInSquad && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {t("manualPlayerAlreadyInSquad")}
            </p>
          )}
          {!alreadyInSquad && likelyDuplicate && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <PlayerAvatar photo={likelyDuplicate.photo} size="h-6 w-6" />
              <span>{t("manualPlayerDuplicateWarning", { name: likelyDuplicate.name })}</span>
            </div>
          )}

          {/* Position */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("manualPlayerPositionLabel")}</span>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-background p-0.5">
              {POSITIONS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPosition(p.key)}
                  className={`truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                    position === p.key ? "bg-surface text-foreground shadow-sm" : "text-muted"
                  }`}
                >
                  {t(p.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted">{t("manualPlayerNumberLabel")}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="col-span-2 block">
              <span className="mb-1.5 block text-xs font-medium text-muted">{t("manualPlayerBirthLabel")}</span>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">{t("manualPlayerNationalityLabel")}</span>
            <CountryCombobox
              countries={countries}
              value={nationality}
              onChange={setNationality}
              placeholder={t("manualPlayerNationalityPlaceholder")}
              noResultsLabel={t("manualPlayerNoCountry")}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {editing && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              {t("deleteButton")}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              {t("cancelButton")}
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-sm disabled:opacity-50"
            >
              {editing ? t("saveNoteButton") : t("manualPlayerAddButton")}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        message={t("manualPlayerDeleteConfirm")}
        isPending={isPending}
        onConfirm={() => {
          if (!editing) return;
          startTransition(async () => {
            await deleteManualPlayer(editing.id);
            setConfirmDelete(false);
            router.refresh();
            onClose();
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
