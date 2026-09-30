"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Icon from "@/components/Icon";
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

const selectClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";

// The coach's own read of a player: main and second position (kept for this
// spell at the club) and preferred foot (kept with the player for good).
// Opened from the player's page (labelled button) or from a row of the
// squad list (pencil icon) — same dialog either way.
export default function PlayerProfileEditor({
  teamId,
  playerId,
  playerName,
  profile,
  variant = "button",
}: {
  teamId: number;
  playerId: number;
  // Shown in the dialog when it's opened from a list of players.
  playerName?: string;
  profile: PlayerProfile;
  variant?: "button" | "icon";
}) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState<DetailedPosition | "">(profile.primaryPosition ?? "");
  const [secondary, setSecondary] = useState<DetailedPosition | "">(profile.secondaryPosition ?? "");
  const [foot, setFoot] = useState<PreferredFoot | null>(profile.preferredFoot);
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
    setFailed(false);
    setOpen(true);
  }

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
            className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-5 shadow-xl sm:rounded-2xl"
          >
            <h2 className="text-base font-semibold">{t("playerProfileEditTitle")}</h2>
            {playerName && <p className="text-sm font-medium text-accent">{playerName}</p>}
            <p className="mt-1 text-xs text-muted">{t("playerProfileHint")}</p>

            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                {t("primaryPositionLabel")}
                <select
                  value={primary}
                  onChange={(e) => {
                    const next = e.target.value as DetailedPosition | "";
                    setPrimary(next);
                    if (!next || next === secondary) setSecondary("");
                  }}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">{t("playerProfileNone")}</option>
                  {renderOptions()}
                </select>
              </label>

              <label className="block text-sm font-medium">
                {t("secondaryPositionLabel")}
                <select
                  value={secondary}
                  disabled={!primary}
                  onChange={(e) => setSecondary(e.target.value as DetailedPosition | "")}
                  className={`mt-1 ${selectClass} disabled:opacity-50`}
                >
                  <option value="">{t("playerProfileNoSecondary")}</option>
                  {renderOptions(primary)}
                </select>
              </label>

              <div>
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

            {failed && <p className="mt-3 text-xs text-red-500">{t("playerProfileSaveError")}</p>}

            <div className="mt-5 flex justify-end gap-2">
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
                disabled={isSaving}
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
