"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { addClubNote, updateClubNote, deleteClubNote } from "../actions";
import ConfirmDialog from "@/components/ConfirmDialog";

export interface ClubNote {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const VISIBLE_COUNT = 3;

export default function ClubNotesList({ teamId, notes }: { teamId: number; notes: ClubNote[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  function handleAdd() {
    const content = newContent.trim();
    if (!content) return;
    startTransition(async () => {
      await addClubNote(teamId, content);
      setNewContent("");
      router.refresh();
    });
  }

  function startEdit(note: ClubNote) {
    setEditingId(note.id);
    setEditingContent(note.content);
  }

  function handleSaveEdit() {
    const content = editingContent.trim();
    if (!editingId || !content) return;
    startTransition(async () => {
      await updateClubNote(editingId, content);
      setEditingId(null);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    startTransition(async () => {
      await deleteClubNote(id);
      setPendingDeleteId(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-muted">
        📝 {t("clubNotesTitle")}
        {notes.length > 0 && ` (${notes.length})`}
      </h2>

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("noClubNotesFound")}</p>
      ) : (
        <>
          {notes.length > VISIBLE_COUNT && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-3 text-xs font-medium text-accent hover:underline"
            >
              {t("showMoreButton")} ({notes.length - VISIBLE_COUNT})
            </button>
          )}

          <div className="mt-2 space-y-1.5">
            {(expanded ? notes : notes.slice(-VISIBLE_COUNT)).map((note) => (
              <div key={note.id} className="rounded-lg border border-border bg-background px-3 py-2">
                {editingId === note.id ? (
                  <>
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={isPending || !editingContent.trim()}
                        onClick={handleSaveEdit}
                        className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50"
                      >
                        {t("saveNoteButton")}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setEditingId(null)}
                        className="rounded-full border border-border px-3 py-1 text-xs font-medium disabled:opacity-50"
                      >
                        {t("cancelButton")}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="min-w-[140px] flex-1 whitespace-pre-wrap text-sm">{note.content}</p>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted">
                        {new Date(note.updated_at).toLocaleString(locale)}
                        {note.updated_at !== note.created_at && ` (${t("editedLabel")})`}
                      </span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => startEdit(note)}
                        className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                      >
                        {t("editButton")}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setPendingDeleteId(note.id)}
                        title={t("deleteButton")}
                        className="text-xs font-medium text-muted hover:text-red-500 hover:underline disabled:opacity-50"
                      >
                        {t("deleteButton")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
          placeholder={t("clubNotesPlaceholder")}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={isPending || !newContent.trim()}
          onClick={handleAdd}
          className="w-fit rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {t("addClubNoteButton")}
        </button>
      </div>

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
