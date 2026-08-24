"use client";

import { useTranslations } from "next-intl";
import { STARTING_XI_SIZE, type LineupPlayer, type TeamLineup } from "./liveStatsShared";

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
}: {
  teamName: string;
  lineup: TeamLineup;
  canEdit: boolean;
  onChange?: (players: LineupPlayer[]) => void;
}) {
  const t = useTranslations("dashboard");

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
          ? { ...p, [field]: field === "number" ? (value ? Number(value) : null) : value }
          : p,
      ),
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
      <h4 className="text-sm font-semibold">{teamName}</h4>

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
              <input
                type="text"
                value={p.name}
                onChange={(e) => updatePlayer(i, "name", e.target.value)}
                placeholder={`${t("liveStatsPlayerLabel")} ${starting.indexOf(p) + 1}/${STARTING_XI_SIZE}`}
                className="w-full min-w-0 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
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
              <input
                type="text"
                value={p.name}
                onChange={(e) => updatePlayer(i, "name", e.target.value)}
                className="w-full min-w-0 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
              />
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
