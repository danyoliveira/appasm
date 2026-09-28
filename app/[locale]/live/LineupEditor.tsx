"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { normalize } from "@/lib/text";
import PlayerAvatar from "@/components/PlayerAvatar";
import {
  STARTING_XI_SIZE,
  lineupFromSquad,
  type LineupPlayer,
  type LiveSquadPlayer,
  type TeamLineup,
} from "./liveStatsShared";

// Our team's name field: type to search the squad and pick the real player
// (fills number + links the id), or keep typing a free name (unlinked).
function SquadNameInput({
  player,
  squad,
  takenIds,
  placeholder,
  onPick,
  onType,
}: {
  player: LineupPlayer;
  squad: LiveSquadPlayer[];
  takenIds: Set<number>;
  placeholder?: string;
  onPick: (p: LiveSquadPlayer) => void;
  onType: (name: string) => void;
}) {
  const t = useTranslations("dashboard");
  const [open, setOpen] = useState(false);
  const q = normalize(player.name.trim());
  const linked = player.playerId != null ? squad.find((s) => s.id === player.playerId) : undefined;
  // The whole squad (scrollable list), minus players already in the lineup;
  // typing narrows it down.
  const options = squad
    .filter((s) => s.id === player.playerId || !takenIds.has(s.id))
    .filter((s) => !q || linked || normalize(s.name).includes(q));

  return (
    <div className="relative min-w-0 flex-1">
      <div
        className={`flex items-center gap-2 rounded-md border bg-surface px-2 py-1 ${
          open ? "border-accent" : "border-border"
        }`}
      >
        {linked ? (
          <PlayerAvatar photo={linked.photo} size="h-6 w-6" />
        ) : player.name.trim() ? (
          <span
            title={t("liveLineupUnlinkedHint")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-amber-500/60 text-[10px] text-amber-600"
          >
            ?
          </span>
        ) : null}
        <input
          type="text"
          value={player.name}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            onType(e.target.value);
            setOpen(true);
          }}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent py-0.5 text-sm outline-none"
        />
      </div>
      {open && options.length > 0 && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
          {options.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-background ${
                s.id === player.playerId ? "font-semibold text-accent" : ""
              }`}
            >
              <PlayerAvatar photo={s.photo} size="h-6 w-6" />
              <span className="w-6 shrink-0 text-xs text-muted">{s.number ?? ""}</span>
              <span className="flex-1 truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReadOnlyLineup({ teamName, lineup }: { teamName: string; lineup: TeamLineup }) {
  const t = useTranslations("dashboard");
  const starting = lineup.players.filter((p) => p.starting && p.name.trim());
  const subs = lineup.players.filter((p) => !p.starting && p.name.trim());

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <h4 className="text-sm font-semibold">{teamName}</h4>

      {starting.length === 0 && subs.length === 0 ? (
        <p className="mt-2 text-xs text-muted">{t("liveStatsLineupEmpty")}</p>
      ) : (
        <>
          {starting.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {starting.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-xs text-muted">{p.number ?? ""}</span>
                  {p.name}
                </li>
              ))}
            </ul>
          )}
          {subs.length > 0 && (
            <>
              <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t("liveStatsSubstitutesLabel")}
              </p>
              <ul className="mt-1 space-y-1 text-sm text-muted">
                {subs.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-xs">{p.number ?? ""}</span>
                    {p.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

// Controlled — the wizard owns the players array so it can save on "Next"
// instead of requiring a separate save-then-advance step.
export default function LineupEditor({
  teamName,
  lineup,
  canEdit,
  onChange,
  squad,
}: {
  teamName: string;
  lineup: TeamLineup;
  canEdit: boolean;
  onChange?: (players: LineupPlayer[]) => void;
  // Our own team only: link each name to the real squad player.
  squad?: LiveSquadPlayer[];
}) {
  const t = useTranslations("dashboard");
  const [confirmFill, setConfirmFill] = useState(false);

  if (!canEdit || !onChange) {
    return <ReadOnlyLineup teamName={teamName} lineup={lineup} />;
  }

  const players = lineup.players;
  const starting = players.filter((p) => p.starting);
  const subs = players.filter((p) => !p.starting);

  function updatePlayer(index: number, field: "number" | "name", value: string) {
    onChange!(
      players.map((p, i) =>
        i === index
          ? {
              ...p,
              [field]: field === "number" ? (value ? Number(value) : null) : value,
              // Typing a name by hand unlinks it from the squad player.
              ...(field === "name" ? { playerId: null } : {}),
            }
          : p,
      ),
    );
  }

  function pickSquadPlayer(index: number, picked: LiveSquadPlayer) {
    onChange!(
      players.map((p, i) =>
        i === index ? { ...p, name: picked.name, number: picked.number, playerId: picked.id } : p,
      ),
    );
  }

  const takenIds = new Set(players.map((p) => p.playerId).filter((id): id is number => id != null));
  const hasNames = players.some((p) => p.name.trim());

  function fillFromSquad() {
    if (!squad?.length) return;
    if (hasNames && !confirmFill) {
      setConfirmFill(true);
      return;
    }
    setConfirmFill(false);
    onChange!(lineupFromSquad(squad));
  }

  function renderNameField(p: LineupPlayer, i: number, placeholder?: string) {
    return squad && squad.length > 0 ? (
      <SquadNameInput
        player={p}
        squad={squad}
        takenIds={takenIds}
        placeholder={placeholder}
        onPick={(picked) => pickSquadPlayer(i, picked)}
        onType={(name) => updatePlayer(i, "name", name)}
      />
    ) : (
      <input
        type="text"
        value={p.name}
        onChange={(e) => updatePlayer(i, "name", e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
    );
  }

  function addSub() {
    onChange!([...players, { number: null, name: "", starting: false, x: null, y: null }]);
  }

  function removeSub(index: number) {
    onChange!(players.filter((_, i) => i !== index));
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{teamName}</h4>
        {squad && squad.length > 0 && (
          <div className="flex items-center gap-2">
            {confirmFill && (
              <button
                type="button"
                onClick={() => setConfirmFill(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                {t("cancelButton")}
              </button>
            )}
            <button
              type="button"
              onClick={fillFromSquad}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                confirmFill
                  ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  : "border-border text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {confirmFill ? t("liveLineupFillConfirm") : t("liveLineupFillFromSquad")}
            </button>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {t("liveStatsStartingXiLabel")}
      </p>
      <div className="mt-1 space-y-1.5">
        {players.map((p, i) =>
          p.starting ? (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={p.number ?? ""}
                onChange={(e) => updatePlayer(i, "number", e.target.value)}
                placeholder="#"
                className="w-12 shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-center text-sm outline-none focus:border-accent"
              />
              {renderNameField(p, i, `${t("liveStatsPlayerLabel")} ${starting.indexOf(p) + 1}/${STARTING_XI_SIZE}`)}
            </div>
          ) : null,
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t("liveStatsSubstitutesLabel")}
        </p>
        <button
          type="button"
          onClick={addSub}
          className="text-xs font-medium text-accent hover:underline"
        >
          + {t("liveStatsAddSubButton")}
        </button>
      </div>
      <div className="mt-1 space-y-1.5">
        {subs.map((p) => {
          const i = players.indexOf(p);
          return (
            <div key={i} className="flex items-center gap-2">
              <input
                type="number"
                value={p.number ?? ""}
                onChange={(e) => updatePlayer(i, "number", e.target.value)}
                placeholder="#"
                className="w-12 shrink-0 rounded-md border border-border bg-surface px-2 py-1.5 text-center text-sm outline-none focus:border-accent"
              />
              {renderNameField(p, i)}
              <button
                type="button"
                onClick={() => removeSub(i)}
                className="shrink-0 text-xs font-medium text-red-500 hover:underline"
              >
                {t("deleteButton")}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
