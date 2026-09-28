"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icon";
import { addNote, deleteNote, setNotePinned, updateNote } from "../actions";
import NoteContent from "./NoteContent";
import NoteForm from "./NoteForm";
import {
  formatReminderDay,
  reminderState,
  REMINDER_BADGE_CLASS,
  sortNotes,
  type NoteItem,
  type NoteKind,
  type NotePlayer,
} from "./noteShared";

const VISIBLE_COUNT = 3;

// Notes list for the club ("Meu Clube" → Notas) or one player — pinned
// notes on top, then newest first.
export default function NotesList({
  kind,
  teamId,
  playerId = null,
  notes,
  mentionPlayers,
  mentionedIn = [],
  title,
  emptyText,
  placeholder,
  addLabel,
}: {
  kind: NoteKind;
  teamId: number;
  playerId?: number | null;
  notes: NoteItem[];
  mentionPlayers?: NotePlayer[];
  // Club notes that @mention this player (player page only, read-only).
  mentionedIn?: NoteItem[];
  title: string;
  emptyText: string;
  placeholder: string;
  addLabel: string;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = sortNotes(notes);
  const pinned = sorted.filter((n) => n.pinnedAt);
  const others = sorted.filter((n) => !n.pinnedAt);
  const visibleOthers = expanded ? others : others.slice(0, VISIBLE_COUNT);

  function refreshAfter(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function togglePin(note: NoteItem) {
    setNotice(null);
    startTransition(async () => {
      const result = await setNotePinned(kind, note.id, !note.pinnedAt);
      if (result.error === "pinLimit") setNotice(t("notesPinLimit"));
      router.refresh();
    });
  }

  function renderNote(note: NoteItem) {
    const reminder = reminderState(note.remindAt);
    if (editingId === note.id) {
      return (
        <div key={note.id} className="rounded-xl border border-accent/40 bg-background p-3">
          <NoteForm
            initialContent={note.content}
            initialRemindAt={note.remindAt}
            mentionPlayers={kind === "club" ? mentionPlayers : undefined}
            submitLabel={t("saveNoteButton")}
            pending={isPending}
            autoFocus
            onCancel={() => setEditingId(null)}
            onSubmit={(result) =>
              refreshAfter(async () => {
                await updateNote(kind, note.id, result);
                setEditingId(null);
              })
            }
          />
        </div>
      );
    }
    return (
      <div
        key={note.id}
        className={`group rounded-xl border px-3 py-2.5 ${
          note.pinnedAt ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-background"
        }`}
      >
        <div className="flex items-start gap-2">
          <NoteContent content={note.content} className="min-w-0 flex-1 text-sm" />
          <div className="-mr-1 -mt-1 flex shrink-0 items-center sm:opacity-60 sm:transition-opacity sm:group-hover:opacity-100">
            <button
              type="button"
              disabled={isPending}
              onClick={() => togglePin(note)}
              title={note.pinnedAt ? t("notesUnpin") : t("notesPin")}
              aria-label={note.pinnedAt ? t("notesUnpin") : t("notesPin")}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-surface disabled:opacity-50 ${
                note.pinnedAt ? "text-amber-600 dark:text-amber-400" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon name="pin" className="h-3.5 w-3.5" filled={!!note.pinnedAt} />
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEditingId(note.id)}
              title={t("editButton")}
              aria-label={t("editButton")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
            >
              <Icon name="pencil" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setPendingDeleteId(note.id)}
              title={t("deleteButton")}
              aria-label={t("deleteButton")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-red-500 disabled:opacity-50"
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            {new Date(note.updatedAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
            {note.updatedAt !== note.createdAt && ` (${t("editedLabel")})`}
          </span>
          {reminder && note.remindAt && (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${REMINDER_BADGE_CLASS[reminder]}`}
            >
              <Icon name="bell" className="h-3 w-3" />
              {formatReminderDay(note.remindAt, locale)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="note" className="h-4 w-4 text-muted" />
        {title}
        {notes.length > 0 && (
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted">
            {notes.length}
          </span>
        )}
      </h2>

      {notice && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {notice}
        </p>
      )}

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {pinned.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                <Icon name="pin" className="h-3 w-3" filled />
                {t("notesPinnedTitle")}
              </div>
              {pinned.map(renderNote)}
              {others.length > 0 && <div className="pt-1" />}
            </>
          )}
          {visibleOthers.map(renderNote)}
          {others.length > VISIBLE_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full rounded-lg py-1.5 text-xs font-medium text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              {expanded ? t("showLessButton") : `${t("showMoreButton")} (${others.length - VISIBLE_COUNT})`}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <NoteForm
          mentionPlayers={kind === "club" ? mentionPlayers : undefined}
          showPin
          placeholder={placeholder}
          submitLabel={addLabel}
          pending={isPending}
          onSubmit={(result) => {
            setNotice(null);
            return new Promise<void>((resolve) =>
              startTransition(async () => {
                const res = await addNote({ kind, teamId, playerId, ...result });
                if (res.error === "pinLimit") setNotice(t("notesPinLimitOnAdd"));
                router.refresh();
                resolve();
              }),
            );
          }}
        />
      </div>

      {mentionedIn.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <Icon name="at" className="h-3.5 w-3.5" />
            {t("notesMentionedInTitle")}
          </h3>
          <div className="mt-2 space-y-2">
            {sortNotes(mentionedIn).map((note) => (
              <div key={note.id} className="rounded-xl border border-border bg-background px-3 py-2.5">
                <NoteContent content={note.content} className="text-sm" />
                <div className="mt-1 text-xs text-muted">
                  <Link href="/club" className="font-medium hover:text-accent hover:underline">
                    {t("clubSectionTitle")}
                  </Link>{" "}
                  · {new Date(note.createdAt).toLocaleDateString(locale)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId != null}
        message={t("confirmDeleteMessage")}
        isPending={isPending}
        onConfirm={() => {
          const id = pendingDeleteId;
          if (!id) return;
          refreshAfter(async () => {
            await deleteNote(kind, id);
            setPendingDeleteId(null);
          });
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
