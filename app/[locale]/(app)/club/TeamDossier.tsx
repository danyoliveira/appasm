"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { addDossierFile, deleteDossierFile, type DossierCategory } from "../actions";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon, { type IconName } from "@/components/Icon";
import PlayerAvatar from "@/components/PlayerAvatar";
import PlayerCombobox from "@/components/PlayerCombobox";
import { normalize, capitalize } from "@/lib/text";
import { CLUB_DOSSIER_CATEGORIES } from "./dossierShared";

export interface DossierFile {
  id: string;
  category: DossierCategory;
  variant: "projected" | "real" | null;
  period: string | null;
  title: string;
  fileSize: number | null;
  createdAt: string;
  url: string | null;
  playerId: number | null;
  playerName: string | null;
}

export interface DossierPlayer {
  id: number;
  name: string;
  photo: string | null;
}

const MAX_BYTES = 20 * 1024 * 1024;
const PAGE_SIZE = 5;
const MONTHS_PAGE_SIZE = 3;

type CreatedFilter = "" | "7d" | "30d" | "month" | "custom";

function toDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

// Upload timestamp as a local "YYYY-MM-DD", so day filters match what the
// coach sees on screen rather than the UTC day.
function localDay(iso: string) {
  return toDayKey(new Date(iso));
}

// Inclusive [from, to] day range for the "data de criação" filter, or null
// when it isn't narrowing anything.
function createdRangeFor(
  filter: CreatedFilter,
  from: string,
  to: string,
): { from: string | null; to: string | null } | null {
  const today = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return toDayKey(d);
  };
  switch (filter) {
    case "7d":
      return { from: daysAgo(6), to: null };
    case "30d":
      return { from: daysAgo(29), to: null };
    case "month":
      return { from: toDayKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: null };
    case "custom":
      return from || to ? { from: from || null, to: to || null } : null;
    default:
      return null;
  }
}

function inRange(day: string, range: { from: string | null; to: string | null }) {
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

function toggleInSet(set: Set<string>, key: string) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// Each category gets its own tint so the overview, section headers and
// the upload picker read as the same thing at a glance.
const ALL_CATEGORIES: { key: DossierCategory; icon: IconName; tint: string }[] = [
  { key: "monthly_plan", icon: "calendar", tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { key: "individual_eval", icon: "user", tint: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { key: "collective_eval", icon: "users", tint: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { key: "training_unit", icon: "clipboard", tint: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { key: "individual_plan", icon: "target", tint: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { key: "medical_report", icon: "heartPulse", tint: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  { key: "player_other", icon: "file", tint: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
];

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatSize(bytes: number | null) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent";

const iconButtonClass =
  "flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-50";

// Used for both the club's dossier and a player's (`fixedPlayer` set:
// every upload belongs to that player and there's no player picker).
export default function TeamDossier({
  teamId,
  files,
  players,
  isCoach,
  categories = CLUB_DOSSIER_CATEGORIES,
  fixedPlayer = null,
  title: heading,
  subtitle,
}: {
  teamId: number;
  files: DossierFile[];
  players: DossierPlayer[];
  isCoach: boolean;
  categories?: DossierCategory[];
  fixedPlayer?: { id: number; name: string } | null;
  title?: string;
  subtitle?: string;
}) {
  const CATEGORIES = ALL_CATEGORIES.filter((c) => categories.includes(c.key));
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState<DossierCategory>(categories[0]);
  const [variant, setVariant] = useState<"projected" | "real">("projected");
  const [month, setMonth] = useState(currentMonthKey().slice(5));
  const [year, setYear] = useState(currentMonthKey().slice(0, 4));
  const [playerId, setPlayerId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<DossierCategory | "all">("all");
  const [createdFilter, setCreatedFilter] = useState<CreatedFilter>("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [openPlayers, setOpenPlayers] = useState<Set<string>>(new Set());

  const monthLabel = (period: string) =>
    capitalize(
      new Date(`${period.slice(0, 7)}-15T00:00:00`).toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
      }),
    );
  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1].map(String);
  const months = Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label: capitalize(new Date(2000, i, 15).toLocaleDateString(locale, { month: "long" })),
  }));

  function openForm(
    presetCategory?: DossierCategory,
    presetVariant?: "projected" | "real",
    presetPeriod?: string,
    presetPlayerId?: number,
  ) {
    if (presetCategory) setCategory(presetCategory);
    if (presetPlayerId != null) setPlayerId(String(presetPlayerId));
    if (presetVariant) setVariant(presetVariant);
    if (presetPeriod) {
      setYear(presetPeriod.slice(0, 4));
      setMonth(presetPeriod.slice(5, 7));
    }
    setError(null);
    setFormOpen(true);
  }

  function resetForm() {
    setFormOpen(false);
    setPlayerId("");
    setTitle("");
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickFile(picked: File | null) {
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (picked.type !== "application/pdf" && !picked.name.toLowerCase().endsWith(".pdf")) {
      setError(t("dossierErrorNotPdf"));
      setFile(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(t("dossierErrorTooLarge"));
      setFile(null);
      return;
    }
    setFile(picked);
    if (!title.trim()) setTitle(picked.name.replace(/\.pdf$/i, ""));
  }

  const selectedPlayer = players.find((p) => String(p.id) === playerId) ?? null;
  const needsPlayer = !fixedPlayer && category === "individual_eval";
  const canSave = !!file && !!title.trim() && (!needsPlayer || !!selectedPlayer);

  async function handleUpload() {
    if (!file || !canSave) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      const storagePath = `${teamId}/${category}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("team-dossier")
        .upload(storagePath, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      await addDossierFile(teamId, {
        category,
        variant: category === "monthly_plan" ? variant : null,
        period: `${year}-${month}`,
        title: title.trim(),
        storagePath,
        fileSize: file.size,
        player:
          fixedPlayer ??
          (needsPlayer && selectedPlayer ? { id: selectedPlayer.id, name: selectedPlayer.name } : null),
      });
      resetForm();
      router.refresh();
    } catch {
      setError(t("dossierErrorUpload"));
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startTransition(async () => {
      await deleteDossierFile(id);
      setPendingDeleteId(null);
      router.refresh();
    });
  }

  function renderFile(f: DossierFile, showMonth = true) {
    return (
      <div
        key={f.id}
        className="group flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5 transition-colors hover:border-accent/30 hover:bg-background"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
          <Icon name="file" />
        </span>
        <div className="min-w-0 flex-1">
          {f.url ? (
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block truncate text-sm font-medium hover:text-accent"
            >
              {f.title}
            </a>
          ) : (
            <span className="block truncate text-sm font-medium">{f.title}</span>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {showMonth && f.period && (
              <span className="flex items-center gap-1" title={t("dossierReportDateLabel")}>
                <Icon name="calendar" className="h-3 w-3" />
                {monthLabel(f.period)}
              </span>
            )}
            <span className="flex items-center gap-1" title={t("dossierCreatedDateLabel")}>
              <Icon name="upload" className="h-3 w-3" />
              {dayLabel(f.createdAt)}
            </span>
            {f.fileSize != null && <span>{formatSize(f.fileSize)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:opacity-60 sm:transition-opacity sm:group-hover:opacity-100">
          {f.url && (
            <a
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              title={t("dossierOpenButton")}
              aria-label={t("dossierOpenButton")}
              className={iconButtonClass}
            >
              <Icon name="external" />
            </a>
          )}
          {isCoach && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setPendingDeleteId(f.id)}
              title={t("deleteButton")}
              aria-label={t("deleteButton")}
              className={`${iconButtonClass} hover:text-red-500`}
            >
              <Icon name="trash" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const q = normalize(query.trim());
  const createdRange = createdRangeFor(createdFilter, createdFrom, createdTo);
  const filtersActive =
    q !== "" || monthFilter !== "" || categoryFilter !== "all" || createdRange !== null;

  const availableMonths = [...new Set(files.map((f) => (f.period ?? "").slice(0, 7)))]
    .filter(Boolean)
    .sort()
    .reverse();

  const visibleFiles = files.filter(
    (f) =>
      (categoryFilter === "all" || f.category === categoryFilter) &&
      (!monthFilter || !!f.period?.startsWith(monthFilter)) &&
      (!createdRange || inRange(localDay(f.createdAt), createdRange)) &&
      (!q || normalize(`${f.title} ${f.playerName ?? ""}`).includes(q)),
  );

  function clearFilters() {
    setQuery("");
    setMonthFilter("");
    setCategoryFilter("all");
    setCreatedFilter("");
    setCreatedFrom("");
    setCreatedTo("");
  }

  const createdPresetLabel: Record<CreatedFilter, string> = {
    "": t("dossierCreatedAny"),
    "7d": t("dossierCreatedLast7"),
    "30d": t("dossierCreatedLast30"),
    month: t("dossierCreatedThisMonth"),
    custom: t("dossierCreatedCustom"),
  };

  // Removable summary of what's currently narrowing the list.
  const activeChips: { key: string; label: string; clear: () => void }[] = [
    ...(q ? [{ key: "q", label: `“${query.trim()}”`, clear: () => setQuery("") }] : []),
    ...(categoryFilter !== "all"
      ? [
          {
            key: "category",
            label: t(`dossierCategory_${categoryFilter}`),
            clear: () => setCategoryFilter("all"),
          },
        ]
      : []),
    ...(monthFilter
      ? [
          {
            key: "report",
            label: `${t("dossierReportDateLabel")}: ${monthLabel(monthFilter)}`,
            clear: () => setMonthFilter(""),
          },
        ]
      : []),
    ...(createdRange
      ? [
          {
            key: "created",
            label: `${t("dossierCreatedDateLabel")}: ${
              createdFilter === "custom"
                ? [createdFrom, createdTo]
                    .map((d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(locale) : "…"))
                    .join(" – ")
                : createdPresetLabel[createdFilter]
            }`,
            clear: () => {
              setCreatedFilter("");
              setCreatedFrom("");
              setCreatedTo("");
            },
          },
        ]
      : []),
  ];

  // Long lists only show the first few entries until "Ver mais" — unless
  // a search/filter is active, which already narrows things down.
  function limited<T>(list: T[], key: string, size = PAGE_SIZE) {
    return filtersActive || expandedLists.has(key) ? list : list.slice(0, size);
  }

  function renderShowMore(total: number, key: string, size = PAGE_SIZE) {
    if (filtersActive || total <= size) return null;
    const expanded = expandedLists.has(key);
    return (
      <button
        type="button"
        onClick={() => setExpandedLists((prev) => toggleInSet(prev, key))}
        className="mt-3 w-full rounded-lg py-1.5 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
      >
        {expanded ? t("showLessButton") : `${t("showMoreButton")} (${total - size})`}
      </button>
    );
  }

  // Monthly planning is laid out as one block per month with the projected
  // and real plans next to each other, so gaps (a month with no "real")
  // stand out.
  const planFiles = visibleFiles.filter((f) => f.category === "monthly_plan");
  const planMonths = [...new Set(planFiles.map((f) => (f.period ?? "").slice(0, 7)))]
    .filter(Boolean)
    .sort()
    .reverse();

  // Individual evaluations grouped by player, in squad order (goalkeepers
  // first); players no longer in the squad go last. Each player is a
  // collapsed row until opened, so a full squad stays scannable.
  const squadIndex = new Map(players.map((p, i) => [p.id, i]));
  const photoById = new Map(players.map((p) => [p.id, p.photo]));
  const individualGroups = [
    ...visibleFiles
      .filter((f) => f.category === "individual_eval")
      .reduce((acc, f) => {
        const key = f.playerId != null ? String(f.playerId) : "none";
        const group = acc.get(key) ?? {
          key,
          playerId: f.playerId,
          name: f.playerName ?? t("dossierNoPlayer"),
          files: [] as DossierFile[],
        };
        group.files.push(f);
        acc.set(key, group);
        return acc;
      }, new Map<string, { key: string; playerId: number | null; name: string; files: DossierFile[] }>())
      .values(),
  ].sort(
    (a, b) =>
      (squadIndex.get(a.playerId ?? -1) ?? Infinity) - (squadIndex.get(b.playerId ?? -1) ?? Infinity) ||
      a.name.localeCompare(b.name, locale),
  );

  const visibleCategories = CATEGORIES.filter(
    (c) =>
      (categoryFilter === "all" || c.key === categoryFilter) &&
      (!filtersActive || visibleFiles.some((f) => f.category === c.key)),
  );

  const selectWithIconClass = (active: boolean) =>
    `${inputClass} appearance-none bg-surface pl-9 pr-8 ${active ? "border-accent text-accent" : ""}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{heading ?? t("clubTabDossier")}</h2>
          <p className="text-sm text-muted">{subtitle ?? t("dossierSubtitle")}</p>
        </div>
        {isCoach && (
          <button
            type="button"
            onClick={() => openForm()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground shadow-sm transition-opacity hover:opacity-90"
          >
            <Icon name="upload" />
            {t("dossierUploadButton")}
          </button>
        )}
      </div>

      {/* Overview — also the category filter */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CATEGORIES.map((c) => {
          const categoryAll = files.filter((f) => f.category === c.key);
          const last = categoryAll.reduce<string | null>(
            (acc, f) => (!acc || f.createdAt > acc ? f.createdAt : acc),
            null,
          );
          const active = categoryFilter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategoryFilter(active ? "all" : c.key)}
              aria-pressed={active}
              className={`flex flex-col gap-3 rounded-2xl border bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                active ? "border-accent ring-1 ring-accent" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.tint}`}>
                  <Icon name={c.icon} />
                </span>
                <span className="text-2xl font-semibold tabular-nums">{categoryAll.length}</span>
              </div>
              <div>
                <div className="text-sm font-medium leading-snug">{t(`dossierCategory_${c.key}`)}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {last ? t("dossierLastUpload", { date: dayLabel(last) }) : t("dossierEmpty")}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search + date filters */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                <Icon name="search" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("dossierSearchPlaceholder")}
                className={`${inputClass} bg-surface pl-9`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 md:w-[420px]">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  <Icon name="calendar" />
                </span>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  aria-label={t("dossierReportDateLabel")}
                  title={t("dossierReportDateLabel")}
                  className={selectWithIconClass(!!monthFilter)}
                >
                  <option value="">{t("dossierReportDateLabel")}</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {monthLabel(m)}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-muted">
                  <Icon name="chevron" className="h-3.5 w-3.5" />
                </span>
              </div>

              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                  <Icon name="upload" />
                </span>
                <select
                  value={createdFilter}
                  onChange={(e) => setCreatedFilter(e.target.value as CreatedFilter)}
                  aria-label={t("dossierCreatedDateLabel")}
                  title={t("dossierCreatedDateLabel")}
                  className={selectWithIconClass(!!createdFilter)}
                >
                  <option value="">{t("dossierCreatedDateLabel")}</option>
                  {(Object.keys(createdPresetLabel) as CreatedFilter[])
                    .filter((key) => key !== "")
                    .map((key) => (
                      <option key={key} value={key}>
                        {createdPresetLabel[key]}
                      </option>
                    ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-muted">
                  <Icon name="chevron" className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>

          {createdFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <span className="text-xs font-medium text-muted">{t("dossierCreatedDateLabel")}</span>
              <input
                type="date"
                value={createdFrom}
                max={createdTo || undefined}
                onChange={(e) => setCreatedFrom(e.target.value)}
                aria-label={t("dossierFromLabel")}
                className={`${inputClass} w-auto py-1.5`}
              />
              <span className="text-muted">→</span>
              <input
                type="date"
                value={createdTo}
                min={createdFrom || undefined}
                onChange={(e) => setCreatedTo(e.target.value)}
                aria-label={t("dossierToLabel")}
                className={`${inputClass} w-auto py-1.5`}
              />
            </div>
          )}

          {filtersActive && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold">
                {t("dossierResultsCount", { count: visibleFiles.length })}
              </span>
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  className="flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 py-0.5 pl-2.5 pr-1 text-xs text-accent"
                >
                  <span className="max-w-[220px] truncate">{chip.label}</span>
                  <button
                    type="button"
                    onClick={chip.clear}
                    aria-label={t("dossierClearFilters")}
                    className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-accent/15"
                  >
                    <Icon name="x" className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-xs font-medium text-muted hover:text-foreground"
              >
                {t("dossierClearFilters")}
              </button>
            </div>
          )}
        </div>
      )}

      {filtersActive && visibleCategories.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted">
            <Icon name="search" />
          </span>
          <p className="text-sm text-muted">{t("dossierNoResults")}</p>
        </div>
      )}

      {/* Category sections */}
      <div className="space-y-4">
        {visibleCategories.map((c) => {
          const categoryFiles = visibleFiles.filter((f) => f.category === c.key);
          const isOpen = filtersActive || !collapsed.has(c.key);
          return (
            <section key={c.key} className="rounded-2xl border border-border bg-surface shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setCollapsed((prev) => toggleInSet(prev, c.key))}
                  aria-expanded={isOpen}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.tint}`}>
                    <Icon name={c.icon} />
                  </span>
                  <span className="truncate text-sm font-semibold">{t(`dossierCategory_${c.key}`)}</span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
                    {categoryFiles.length}
                  </span>
                  <span
                    className={`ml-auto text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
                  >
                    <Icon name="chevron" />
                  </span>
                </button>
                {isCoach && (
                  <button
                    type="button"
                    onClick={() => openForm(c.key)}
                    title={t("dossierAddShort")}
                    aria-label={t("dossierAddShort")}
                    className={iconButtonClass}
                  >
                    <Icon name="plus" />
                  </button>
                )}
              </div>

              {isOpen && (
                <div className="border-t border-border px-4 py-4">
                  {categoryFiles.length === 0 ? (
                    isCoach ? (
                      <button
                        type="button"
                        onClick={() => openForm(c.key)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-5 text-sm text-muted transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        <Icon name="upload" />
                        {t("dossierEmptyCta")}
                      </button>
                    ) : (
                      <p className="py-2 text-center text-sm text-muted">{t("dossierEmpty")}</p>
                    )
                  ) : c.key === "monthly_plan" ? (
                    <>
                      <div className="space-y-3">
                        {limited(planMonths, "months", MONTHS_PAGE_SIZE).map((m) => (
                          <div key={m} className="rounded-xl border border-border">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
                              <span className="text-sm font-semibold">{monthLabel(m)}</span>
                              <div className="flex gap-1.5">
                                {(["projected", "real"] as const).map((v) => {
                                  const done = planFiles.some(
                                    (f) => f.variant === v && f.period?.startsWith(m),
                                  );
                                  return (
                                    <span
                                      key={v}
                                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                        done
                                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                          : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                      }`}
                                    >
                                      {done && <Icon name="check" className="h-3 w-3" />}
                                      {t(`dossierVariant_${v}`)}
                                      {!done && ` · ${t("dossierPending")}`}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="grid gap-3 p-3 sm:grid-cols-2">
                              {(["projected", "real"] as const).map((v) => {
                                const slot = planFiles.filter(
                                  (f) => f.variant === v && f.period?.startsWith(m),
                                );
                                return (
                                  <div key={v} className="min-w-0">
                                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                      {t(`dossierVariant_${v}`)}
                                    </div>
                                    {slot.length === 0 ? (
                                      isCoach ? (
                                        <button
                                          type="button"
                                          onClick={() => openForm("monthly_plan", v, m)}
                                          className="flex h-[58px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
                                        >
                                          <Icon name="plus" className="h-3.5 w-3.5" />
                                          {t("dossierAddShort")}
                                        </button>
                                      ) : (
                                        <p className="text-xs text-muted">—</p>
                                      )
                                    ) : (
                                      <div className="space-y-2">{slot.map((f) => renderFile(f, false))}</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {renderShowMore(planMonths.length, "months", MONTHS_PAGE_SIZE)}
                    </>
                  ) : c.key === "individual_eval" && !fixedPlayer ? (
                    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                      {individualGroups.map((group) => {
                        const playerOpen = q !== "" || openPlayers.has(group.key);
                        return (
                          <div key={group.key}>
                            <div className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-background/60">
                              <button
                                type="button"
                                onClick={() => setOpenPlayers((prev) => toggleInSet(prev, group.key))}
                                aria-expanded={playerOpen}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                {group.playerId != null ? (
                                  <PlayerAvatar photo={photoById.get(group.playerId) ?? null} size="h-8 w-8" />
                                ) : (
                                  <span className="h-8 w-8 shrink-0 rounded-full bg-border" />
                                )}
                                <span className="truncate text-sm font-medium">{group.name}</span>
                                <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                                  {group.files.length}
                                </span>
                                <span
                                  className={`ml-auto text-muted transition-transform ${playerOpen ? "rotate-90" : ""}`}
                                >
                                  <Icon name="chevron" />
                                </span>
                              </button>
                              {isCoach && group.playerId != null && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openForm("individual_eval", undefined, undefined, group.playerId!)
                                  }
                                  title={t("dossierAddShort")}
                                  aria-label={t("dossierAddShort")}
                                  className={iconButtonClass}
                                >
                                  <Icon name="plus" />
                                </button>
                              )}
                            </div>
                            {playerOpen && (
                              <div className="bg-background/40 px-3 pb-3 pt-1">
                                <div className="space-y-2">
                                  {limited(group.files, `player-${group.key}`).map((f) => renderFile(f))}
                                </div>
                                {renderShowMore(group.files.length, `player-${group.key}`)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {limited(categoryFiles, c.key).map((f) => renderFile(f))}
                      </div>
                      {renderShowMore(categoryFiles.length, c.key)}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Upload dialog */}
      {isCoach && formOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dossier-upload-title"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 id="dossier-upload-title" className="text-base font-semibold">
                {t("dossierNewDocument")}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                disabled={uploading}
                aria-label={t("cancelButton")}
                className={iconButtonClass}
              >
                <Icon name="x" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div>
                <span className="mb-1.5 block text-xs font-medium text-muted">
                  {t("dossierCategoryLabel")}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((c) => {
                    const active = category === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategory(c.key)}
                        aria-pressed={active}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-medium transition-colors ${
                          active
                            ? "border-accent bg-accent/5 ring-1 ring-accent"
                            : "border-border hover:border-accent/40"
                        }`}
                      >
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.tint}`}>
                          <Icon name={c.icon} className="h-3.5 w-3.5" />
                        </span>
                        <span className="leading-tight">{t(`dossierCategory_${c.key}`)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {category === "monthly_plan" && (
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    {t("dossierVariantLabel")}
                  </span>
                  <div className="flex rounded-lg border border-border bg-background p-0.5">
                    {(["projected", "real"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVariant(v)}
                        className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          variant === v ? "bg-surface text-foreground shadow-sm" : "text-muted"
                        }`}
                      >
                        {t(`dossierVariant_${v}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {needsPlayer && (
                <div className="relative">
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    {t("dossierPlayerLabel")}
                  </span>
                  <PlayerCombobox
                    players={players}
                    value={selectedPlayer?.id ?? null}
                    onChange={(id) => setPlayerId(String(id))}
                    placeholder={t("dossierPlayerPlaceholder")}
                    noResultsLabel={t("dossierNoPlayersFound")}
                  />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    {t("dossierMonthLabel")}
                  </span>
                  <div className="flex gap-2">
                    <select
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      aria-label={t("dossierMonthLabel")}
                      className={inputClass}
                    >
                      {months.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      aria-label={t("dossierMonthLabel")}
                      className={`${inputClass} w-24`}
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    {t("dossierTitleLabel")}
                  </span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("dossierTitlePlaceholder")}
                    className={inputClass}
                  />
                </label>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  dragOver
                    ? "border-accent bg-accent/5"
                    : file
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-border hover:border-accent/50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                {file ? (
                  <>
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                      <Icon name="file" className="h-5 w-5" />
                    </span>
                    <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted">
                      {formatSize(file.size)} · {t("dossierChangeFile")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-muted">
                      <Icon name="upload" className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium">{t("dossierDropHint")}</span>
                    <span className="text-xs text-muted">{t("dossierDropLimits")}</span>
                  </>
                )}
              </label>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                disabled={uploading}
                onClick={resetForm}
                className="rounded-full px-4 py-2 text-sm font-medium text-muted hover:text-foreground disabled:opacity-50"
              >
                {t("cancelButton")}
              </button>
              <button
                type="button"
                disabled={uploading || !canSave}
                onClick={handleUpload}
                className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground shadow-sm disabled:opacity-50"
              >
                <Icon name="upload" />
                {uploading ? t("dossierUploading") : t("dossierSaveButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId != null}
        message={t("confirmDeleteMessage")}
        isPending={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
