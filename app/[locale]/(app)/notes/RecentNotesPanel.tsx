"use client";

import { useEffect, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icon";
import PlayerAvatar from "@/components/PlayerAvatar";
import PlayerCombobox from "@/components/PlayerCombobox";
import { normalize } from "@/lib/text";
import { addNote, deleteNote, setNotePinned, setNoteReminder, updateNote } from "../actions";
import NoteContent from "./NoteContent";
import NoteForm from "./NoteForm";
import {
  formatReminderDay,
  noteContentToPlain,
  reminderState,
  REMINDER_BADGE_CLASS,
  sortNotes,
  timeAgo,
  dayKeyFromToday,
  type NoteItem,
  type NotePlayer,
} from "./noteShared";

type Filter = "all" | "club" | "player" | "pinned" | "reminders";

const VISIBLE_COUNT = 6;
const REMINDER_WINDOW_DAYS = 7;

export default function RecentNotesPanel({
  teamId,
  notes,
  players,
  playerInfo,
  clubLogo,
}: {
  teamId: number;
  notes: NoteItem[];
  // Current squad (squad order) — quick-add picker and @mentions.
  players: NotePlayer[];
  // Name/photo for every player any note refers to (incl. ex-squad).
  playerInfo: Record<number, NotePlayer>;
  clubLogo: string | null;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Popup: the note being shown and the list it's browsed within.
  const [dialog, setDialog] = useState<{ ids: string[]; id: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<"club" | "player">("club");
  const [quickPlayerId, setQuickPlayerId] = useState<number | null>(null);

  const byId = new Map(notes.map((n) => [n.id, n]));
  const nameOf = (note: NoteItem) =>
    note.playerId != null
      ? (playerInfo[note.playerId]?.name ?? `#${note.playerId}`)
      : t("clubSectionTitle");

  // --- Reminders due today/overdue or in the next few days ---------------
  const windowEnd = dayKeyFromToday(REMINDER_WINDOW_DAYS);
  const reminders = notes
    .filter((n) => n.remindAt && n.remindAt <= windowEnd)
    .sort((a, b) => (a.remindAt ?? "").localeCompare(b.remindAt ?? ""));

  // --- Search + filters ---------------------------------------------------
  const q = normalize(query.trim());
  const listNotes = sortNotes(
    notes.filter((n) => {
      if (filter === "club" && n.kind !== "club") return false;
      if (filter === "player" && n.kind !== "player") return false;
      if (filter === "pinned" && !n.pinnedAt) return false;
      if (filter === "reminders" && !n.remindAt) return false;
      if (!q) return true;
      return normalize(`${noteContentToPlain(n.content)} ${nameOf(n)}`).includes(q);
    }),
  );
  const showAll = expanded || q !== "" || filter !== "all";
  const visible = showAll ? listNotes : listNotes.slice(0, VISIBLE_COUNT);

  const current = dialog ? byId.get(dialog.id) ?? null : null;
  const currentIndex = dialog && current ? dialog.ids.indexOf(current.id) : -1;

  function openNote(id: string, ids: string[]) {
    setNotice(null);
    setEditing(false);
    setDialog({ id, ids });
  }

  function step(delta: number) {
    if (!dialog) return;
    const next = dialog.ids[currentIndex + delta];
    if (next) {
      setEditing(false);
      setDialog({ ...dialog, id: next });
    }
  }

  useEffect(() => {
    if (!dialog || editing || confirmDelete) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDialog(null);
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function togglePin(note: NoteItem) {
    setNotice(null);
    startTransition(async () => {
      const result = await setNotePinned(note.kind, note.id, !note.pinnedAt);
      if (result.error === "pinLimit") setNotice(t("notesPinLimit"));
      router.refresh();
    });
  }

  function renderAvatar(note: NoteItem, size = "h-9 w-9") {
    if (note.playerId != null) {
      return <PlayerAvatar photo={playerInfo[note.playerId]?.photo ?? null} size={size} />;
    }
    return clubLogo ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={clubLogo} alt="" className={`${size} shrink-0 object-contain p-0.5`} />
    ) : (
      <span className={`${size} shrink-0 rounded-full bg-border`} />
    );
  }

  function renderKindBadge(note: NoteItem) {
    return (
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          note.kind === "player"
            ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
            : "bg-sky-500/10 text-sky-700 dark:text-sky-400"
        }`}
      >
        {note.kind === "player" ? t("recentNotesPlayerBadge") : t("recentNotesClubBadge")}
      </span>
    );
  }

  function renderReminderBadge(note: NoteItem) {
    const state = reminderState(note.remindAt);
    if (!state || !note.remindAt) return null;
    return (
      <span
        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${REMINDER_BADGE_CLASS[state]}`}
      >
        <Icon name="bell" className="h-3 w-3" />
        {state === "today" ? t("notesReminderToday") : formatReminderDay(note.remindAt, locale)}
      </span>
    );
  }

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t("notesFilterAll") },
    { key: "club", label: t("recentNotesClubBadge") },
    { key: "player", label: t("notesFilterPlayers") },
    { key: "pinned", label: t("notesFilterPinned") },
    { key: "reminders", label: t("notesFilterReminders") },
  ];

  const noteHref = (note: NoteItem) =>
    note.playerId != null ? `/club/player/${note.playerId}` : "/club";

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("recentNotesTitle")}</h2>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setQuickAddOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-foreground shadow-sm hover:opacity-90"
        >
          <Icon name="plus" />
          {t("notesQuickAddButton")}
        </button>
      </div>

      {notice && !dialog && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {notice}
        </p>
      )}

      {/* Reminders */}
      {reminders.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            <Icon name="bell" className="h-3.5 w-3.5" />
            {t("notesRemindersTitle")}
          </div>
          <div className="mt-2 space-y-1.5">
            {reminders.map((note) => (
              <div
                key={note.id}
                className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-2"
              >
                <button
                  type="button"
                  onClick={() => openNote(note.id, reminders.map((r) => r.id))}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  {renderAvatar(note, "h-7 w-7")}
                  {renderReminderBadge(note)}
                  <span className="shrink-0 text-sm font-medium">{nameOf(note)}</span>
                  <span className="truncate text-sm text-muted">
                    {noteContentToPlain(note.content)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => run(() => setNoteReminder(note.kind, note.id, null))}
                  title={t("notesReminderDone")}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted hover:border-emerald-500/50 hover:text-emerald-600 disabled:opacity-50"
                >
                  <Icon name="check" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t("notesReminderDone")}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filters */}
      {notes.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
              <Icon name="search" />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("notesSearchPlaceholder")}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-background p-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === f.key ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("recentNotesEmpty")}</p>
      ) : listNotes.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">{t("notesNoResults")}</p>
      ) : (
        <>
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {visible.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => openNote(note.id, listNotes.map((n) => n.id))}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:border-accent ${
                  note.pinnedAt ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background"
                }`}
              >
                {renderAvatar(note)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{nameOf(note)}</span>
                      {renderKindBadge(note)}
                      {note.pinnedAt && (
                        <span className="text-amber-600 dark:text-amber-400" title={t("notesPinnedTitle")}>
                          <Icon name="pin" className="h-3.5 w-3.5" filled />
                        </span>
                      )}
                    </span>
                    <span
                      className="shrink-0 text-xs text-muted"
                      title={new Date(note.createdAt).toLocaleString(locale)}
                    >
                      {timeAgo(note.createdAt, locale)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-muted">
                    {noteContentToPlain(note.content)}
                  </p>
                  {note.remindAt && (
                    <div className="mt-1.5 flex">
                      {renderReminderBadge(note)}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
          {!showAll && listNotes.length > VISIBLE_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 w-full rounded-lg py-1.5 text-xs font-medium text-muted hover:bg-background hover:text-foreground"
            >
              {t("showMoreButton")} ({listNotes.length - VISIBLE_COUNT})
            </button>
          )}
          {expanded && q === "" && filter === "all" && listNotes.length > VISIBLE_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-3 w-full rounded-lg py-1.5 text-xs font-medium text-muted hover:bg-background hover:text-foreground"
            >
              {t("showLessButton")}
            </button>
          )}
        </>
      )}

      {/* Note popup */}
      {dialog && current && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => !editing && setDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              {renderAvatar(current, "h-10 w-10")}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={noteHref(current)}
                    className="truncate text-base font-semibold hover:text-accent hover:underline"
                  >
                    {nameOf(current)}
                  </Link>
                  {renderKindBadge(current)}
                </div>
                <div className="text-xs text-muted">
                  {new Date(current.createdAt).toLocaleString(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {current.updatedAt !== current.createdAt &&
                    ` · ${t("editedLabel")} ${new Date(current.updatedAt).toLocaleDateString(locale)}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                aria-label={t("cancelButton")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
              >
                <Icon name="x" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {notice && (
                <p className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  {notice}
                </p>
              )}
              {editing ? (
                <NoteForm
                  key={current.id}
                  initialContent={current.content}
                  initialRemindAt={current.remindAt}
                  mentionPlayers={current.kind === "club" ? players : undefined}
                  submitLabel={t("saveNoteButton")}
                  pending={isPending}
                  autoFocus
                  onCancel={() => setEditing(false)}
                  onSubmit={(result) =>
                    run(async () => {
                      await updateNote(current.kind, current.id, result);
                      setEditing(false);
                    })
                  }
                />
              ) : (
                <>
                  <NoteContent content={current.content} className="text-[15px] leading-relaxed" />
                  {(current.pinnedAt || current.remindAt) && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {current.pinnedAt && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          <Icon name="pin" className="h-3 w-3" filled />
                          {t("notesPinnedTitle")}
                        </span>
                      )}
                      {renderReminderBadge(current)}
                      {current.remindAt && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => run(() => setNoteReminder(current.kind, current.id, null))}
                          className="text-xs font-medium text-muted hover:text-emerald-600 hover:underline disabled:opacity-50"
                        >
                          {t("notesReminderDone")}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!editing && (
              <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2.5">
                <button
                  type="button"
                  disabled={currentIndex <= 0}
                  onClick={() => step(-1)}
                  aria-label={t("notesPrevious")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground disabled:opacity-30"
                >
                  <Icon name="chevronLeft" />
                </button>
                <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted">
                  {currentIndex + 1} / {dialog.ids.length}
                </span>
                <button
                  type="button"
                  disabled={currentIndex >= dialog.ids.length - 1}
                  onClick={() => step(1)}
                  aria-label={t("notesNext")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground disabled:opacity-30"
                >
                  <Icon name="chevron" />
                </button>

                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => togglePin(current)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-background disabled:opacity-50 ${
                      current.pinnedAt ? "text-amber-600 dark:text-amber-400" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <Icon name="pin" className="h-3.5 w-3.5" filled={!!current.pinnedAt} />
                    {current.pinnedAt ? t("notesUnpin") : t("notesPin")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-background hover:text-foreground"
                  >
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                    {t("editButton")}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setConfirmDelete(true)}
                    aria-label={t("deleteButton")}
                    title={t("deleteButton")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-red-500 disabled:opacity-50"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick add */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-semibold">{t("notesQuickAddTitle")}</h3>
              <button
                type="button"
                onClick={() => setQuickAddOpen(false)}
                aria-label={t("cancelButton")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-background hover:text-foreground"
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex rounded-lg border border-border bg-background p-0.5">
                {(["club", "player"] as const).map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setQuickTarget(target)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      quickTarget === target ? "bg-surface text-foreground shadow-sm" : "text-muted"
                    }`}
                  >
                    <Icon name={target === "club" ? "shield" : "user"} className="h-3.5 w-3.5" />
                    {target === "club" ? t("clubSectionTitle") : t("recentNotesPlayerBadge")}
                  </button>
                ))}
              </div>

              {quickTarget === "player" && (
                <PlayerCombobox
                  players={players}
                  value={quickPlayerId}
                  onChange={setQuickPlayerId}
                  placeholder={t("dossierPlayerPlaceholder")}
                  noResultsLabel={t("dossierNoPlayersFound")}
                />
              )}

              <NoteForm
                key={quickTarget}
                mentionPlayers={quickTarget === "club" ? players : undefined}
                showPin
                autoFocus={quickTarget === "club"}
                placeholder={
                  quickTarget === "club" ? t("clubNotesPlaceholder") : t("playerNotesPlaceholder")
                }
                submitLabel={t("notesSaveButton")}
                pending={isPending || (quickTarget === "player" && quickPlayerId == null)}
                onCancel={() => setQuickAddOpen(false)}
                onSubmit={(result) =>
                  new Promise<void>((resolve) =>
                    startTransition(async () => {
                      const res = await addNote({
                        kind: quickTarget,
                        teamId,
                        playerId: quickTarget === "player" ? quickPlayerId : null,
                        ...result,
                      });
                      setNotice(res.error === "pinLimit" ? t("notesPinLimitOnAdd") : null);
                      setQuickAddOpen(false);
                      setQuickPlayerId(null);
                      router.refresh();
                      resolve();
                    }),
                  )
                }
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        message={t("confirmDeleteMessage")}
        isPending={isPending}
        onConfirm={() => {
          if (!current) return;
          const note = current;
          run(async () => {
            await deleteNote(note.kind, note.id);
            setConfirmDelete(false);
            setDialog(null);
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
