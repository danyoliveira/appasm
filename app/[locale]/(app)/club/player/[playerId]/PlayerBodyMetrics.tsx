"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setPlayerHeight, addPlayerWeightEntry, deletePlayerWeightEntry } from "../../../actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import PlayerWeightChart from "./PlayerWeightChart";

export interface WeightEntry {
  id: string;
  weightKg: number;
  recordedAt: string;
}

const VISIBLE_WEIGHT_COUNT = 3;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function PlayerBodyMetrics({
  teamId,
  playerId,
  isCoach,
  heightCm,
  weightEntries,
  apiWeightKg,
}: {
  teamId: number;
  playerId: number;
  isCoach: boolean;
  // Already resolved (hand-entered wins, falls back to the API's reading)
  // by the caller — nothing left to fall back to here.
  heightCm: number | null;
  weightEntries: WeightEntry[];
  // Only a fallback for the read-only "current weight" line below — kept
  // separate from weightEntries so it never gets treated as a real,
  // deletable log entry.
  apiWeightKg?: number | null;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditingHeight, setIsEditingHeight] = useState(false);
  const [heightInput, setHeightInput] = useState(heightCm != null ? String(heightCm) : "");
  const [isAddingWeight, setIsAddingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [dateInput, setDateInput] = useState(todayIso());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [weightExpanded, setWeightExpanded] = useState(false);

  function handleSaveHeight() {
    const trimmed = heightInput.trim();
    const value = trimmed ? Number(trimmed) : null;
    startTransition(async () => {
      await setPlayerHeight(teamId, playerId, value);
      setIsEditingHeight(false);
      router.refresh();
    });
  }

  function handleAddWeight() {
    const value = Number(weightInput.trim().replace(",", "."));
    if (!value || !dateInput) return;
    startTransition(async () => {
      await addPlayerWeightEntry(teamId, playerId, value, dateInput);
      setWeightInput("");
      setDateInput(todayIso());
      setIsAddingWeight(false);
      router.refresh();
    });
  }

  function confirmDeleteWeight() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startTransition(async () => {
      await deletePlayerWeightEntry(id);
      setPendingDeleteId(null);
      router.refresh();
    });
  }

  const latestWeight = weightEntries[0] ?? null;

  return (
    <div className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-semibold">📏 {t("bodyMetricsTitle")}</h2>

      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("statHeight")}
          </h3>
          {isEditingHeight ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="number"
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                placeholder="cm"
                className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-accent"
              />
              <span className="text-sm text-muted">cm</span>
              <button
                type="button"
                disabled={isPending}
                onClick={handleSaveHeight}
                className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                {t("saveNoteButton")}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setIsEditingHeight(false);
                  setHeightInput(heightCm != null ? String(heightCm) : "");
                }}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium disabled:opacity-50"
              >
                {t("cancelButton")}
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-xl font-bold">{heightCm != null ? `${heightCm} cm` : "-"}</span>
              {isCoach && (
                <button
                  type="button"
                  onClick={() => setIsEditingHeight(true)}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {t("editButton")}
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("statWeight")}
          </h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold">
              {latestWeight
                ? `${latestWeight.weightKg} kg`
                : apiWeightKg != null
                  ? `${apiWeightKg} kg`
                  : "-"}
            </span>
            {latestWeight && (
              <span className="text-xs text-muted">
                {new Date(latestWeight.recordedAt).toLocaleDateString(locale)}
              </span>
            )}
          </div>

          {weightEntries.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("noWeightHistory")}</p>
          ) : (
            <>
              <div className="mt-3">
                <PlayerWeightChart entries={weightEntries} />
              </div>
              <div className="mt-2 space-y-1 pr-1">
                {(weightExpanded ? weightEntries : weightEntries.slice(0, VISIBLE_WEIGHT_COUNT)).map(
                  (entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted">
                        {new Date(entry.recordedAt).toLocaleDateString(locale)}
                      </span>
                      <span className="font-medium">{entry.weightKg} kg</span>
                      {isCoach && (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(entry.id)}
                          title={t("deleteButton")}
                          className="text-muted hover:text-red-500"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ),
                )}
              </div>
              {!weightExpanded && weightEntries.length > VISIBLE_WEIGHT_COUNT && (
                <button
                  type="button"
                  onClick={() => setWeightExpanded(true)}
                  className="mt-1 text-xs font-medium text-accent hover:underline"
                >
                  {t("showMoreButton")} ({weightEntries.length - VISIBLE_WEIGHT_COUNT})
                </button>
              )}
            </>
          )}

          {isCoach &&
            (isAddingWeight ? (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div>
                  <label className="mb-1 block text-[10px] text-muted">kg</label>
                  <input
                    type="number"
                    step="0.1"
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted">{t("weightDateLabel")}</label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
                  />
                </div>
                <button
                  type="button"
                  disabled={isPending || !weightInput.trim()}
                  onClick={handleAddWeight}
                  className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50"
                >
                  {t("saveNoteButton")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingWeight(false)}
                  className="text-xs text-muted hover:text-foreground"
                >
                  {t("cancelButton")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddingWeight(true)}
                className="mt-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
              >
                + {t("addWeightButton")}
              </button>
            ))}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId != null}
        message={t("confirmDeleteMessage")}
        isPending={isPending}
        onConfirm={confirmDeleteWeight}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
