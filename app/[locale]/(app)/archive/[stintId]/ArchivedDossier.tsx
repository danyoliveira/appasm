"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import PlayerAvatar from "@/components/PlayerAvatar";
import { capitalize, normalize } from "@/lib/text";
import type { DossierCategory } from "../../actions";
import type { DossierFile } from "../../club/TeamDossier";

// Club-wide documents; everything else in the dossier belongs to a player.
const TEAM_CATEGORIES: DossierCategory[] = ["monthly_plan", "collective_eval", "training_unit"];

// A season's dossier runs to dozens of PDFs — every list starts short and
// grows only when asked, and the search box narrows all of them at once.
const FILES_SHOWN = 3;
const PLAYERS_SHOWN = 5;
const SEARCH_FROM = 7;

function formatSize(bytes: number | null) {
  if (bytes == null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The spell's dossier as it was left — the team's documents by category and
// each player's own (evaluations, individual plans, medical reports), all
// read-only: the PDFs open, nothing can be added or removed from here.
export default function ArchivedDossier({
  files,
  photos,
}: {
  files: DossierFile[];
  // Player id → photo, from the spell's saved squad.
  photos: Record<number, string | null>;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  // Keys of the lists the coach asked to see in full.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (files.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
        {t("archiveDossierEmpty")}
      </p>
    );
  }

  const monthLabel = (period: string) =>
    capitalize(
      new Date(`${period.slice(0, 7)}-15T00:00:00`).toLocaleDateString(locale, { month: "long", year: "numeric" }),
    );

  const q = normalize(query.trim());
  const searching = q !== "";
  const visibleFiles = searching
    ? files.filter((f) => normalize(`${f.title} ${f.playerName ?? ""}`).includes(q))
    : files;

  const teamGroups = TEAM_CATEGORIES.map((category) => ({
    category,
    files: visibleFiles.filter((f) => f.category === category),
  })).filter((g) => g.files.length > 0);

  const playerFiles = visibleFiles.filter((f) => !TEAM_CATEGORIES.includes(f.category));
  const playerGroups = Array.from(
    playerFiles
      .reduce((groups, f) => {
        const key = f.playerId != null ? String(f.playerId) : `name:${f.playerName ?? ""}`;
        const group = groups.get(key) ?? {
          key,
          playerId: f.playerId,
          name: f.playerName ?? t("dossierNoPlayer"),
          files: [] as DossierFile[],
        };
        group.files.push(f);
        return groups.set(key, group);
      }, new Map<string, { key: string; playerId: number | null; name: string; files: DossierFile[] }>())
      .values(),
  ).sort((a, b) => a.name.localeCompare(b.name));

  // A search shows every match; otherwise a list is cut at `size` until its
  // "Ver todos" is pressed.
  function limited<T>(items: T[], key: string, size: number) {
    return searching || expanded.has(key) ? items : items.slice(0, size);
  }

  function showMore(total: number, key: string, size: number) {
    if (searching || total <= size) return null;
    const open = expanded.has(key);
    return (
      <button
        type="button"
        onClick={() =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (open) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        className="w-full px-3 py-2 text-center text-xs font-medium text-muted transition-colors hover:text-foreground"
      >
        {open ? t("archiveShowLess") : t("archiveShowAll", { count: total })}
      </button>
    );
  }

  function renderFile(f: DossierFile, showCategory: boolean) {
    const details = [
      showCategory ? t(`dossierCategory_${f.category}`) : null,
      f.variant ? t(`dossierVariant_${f.variant}`) : null,
      f.period ? monthLabel(f.period) : null,
      formatSize(f.fileSize),
    ].filter(Boolean);
    const row = (
      <>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
          <Icon name="file" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{f.title}</span>
          <span className="block truncate text-xs text-muted">{details.join(" · ")}</span>
        </span>
        {f.url && <span className="shrink-0 text-xs font-medium text-accent">{t("dossierOpenButton")} ↗</span>}
      </>
    );
    return f.url ? (
      <a
        key={f.id}
        href={f.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 px-3 py-2 transition-colors hover:bg-background"
      >
        {row}
      </a>
    ) : (
      <div key={f.id} className="flex items-center gap-3 px-3 py-2">
        {row}
      </div>
    );
  }

  const groupClass = "group overflow-hidden rounded-xl border border-border bg-surface shadow-sm";
  const summaryClass = "flex cursor-pointer select-none list-none items-center gap-3 px-3 py-2.5";
  const countClass =
    "rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted ring-1 ring-border";
  const chevron = <span className="ml-auto text-muted transition-transform group-open:rotate-180">▾</span>;
  // Remounted when a search starts or ends, so every group opens on its
  // matches and goes back to its resting state afterwards.
  const mode = searching ? "search" : "rest";

  return (
    <div className="mt-3">
      {files.length >= SEARCH_FROM && (
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("dossierSearchPlaceholder")}
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus:border-accent"
          />
        </div>
      )}

      {searching && visibleFiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-4 text-center text-sm text-muted">
          {t("dossierNoResults")}
        </p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("archiveDossierTeam")} · {visibleFiles.length - playerFiles.length}
            </h3>
            {teamGroups.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("dossierEmpty")}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {teamGroups.map((g) => (
                  <details key={`${mode}-${g.category}`} open className={groupClass}>
                    <summary className={summaryClass}>
                      <span className="truncate text-sm font-semibold">{t(`dossierCategory_${g.category}`)}</span>
                      <span className={countClass}>{g.files.length}</span>
                      {chevron}
                    </summary>
                    <div className="divide-y divide-border border-t border-border">
                      {limited(g.files, g.category, FILES_SHOWN).map((f) => renderFile(f, false))}
                      {showMore(g.files.length, g.category, FILES_SHOWN)}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("archiveDossierPlayers")} · {playerFiles.length}
            </h3>
            {playerGroups.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("dossierEmpty")}</p>
            ) : (
              <div className="mt-2 space-y-2">
                {/* Closed until opened (or searched for). */}
                {limited(playerGroups, "players", PLAYERS_SHOWN).map((g) => (
                  <details key={`${mode}-${g.key}`} open={searching} className={groupClass}>
                    <summary className={summaryClass}>
                      <PlayerAvatar photo={g.playerId != null ? (photos[g.playerId] ?? null) : null} size="h-8 w-8" />
                      <span className="truncate text-sm font-semibold">{g.name}</span>
                      <span className={countClass}>{g.files.length}</span>
                      {chevron}
                    </summary>
                    <div className="divide-y divide-border border-t border-border">
                      {limited(g.files, `player-${g.key}`, FILES_SHOWN).map((f) => renderFile(f, true))}
                      {showMore(g.files.length, `player-${g.key}`, FILES_SHOWN)}
                    </div>
                  </details>
                ))}
                {playerGroups.length > PLAYERS_SHOWN && !searching && (
                  <div className="rounded-xl border border-border bg-surface">
                    {showMore(playerGroups.length, "players", PLAYERS_SHOWN)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
