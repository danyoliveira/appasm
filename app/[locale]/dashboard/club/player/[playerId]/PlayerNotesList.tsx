"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { addPlayerNote, updatePlayerNote, deletePlayerNote } from "../../../actions";

export interface PlayerNote {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function PlayerNotesList({
  teamId,
  playerId,
  notes,
}: {
  teamId: number;
  playerId: number;
  notes: PlayerNote[];
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  function handleAdd() {
    const content = newContent.trim();
    if (!content) return;
    startTransition(async () => {
      await addPlayerNote(teamId, playerId, content);
      setNewContent("");
      router.refresh();
    });
  }

  function startEdit(note: PlayerNote) {
    setEditingId(note.id);
    setEditingContent(note.content);
  }

  function handleSaveEdit() {
    const content = editingContent.trim();
    if (!editingId || !content) return;
    startTransition(async () => {
      await updatePlayerNote(editingId, content);
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deletePlayerNote(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-muted">📝 {t("playerNotesTitle")}</h2>

      {notes.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{t("noNotesFound")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-lg border border-border bg-background p-3">
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
                <>
                  <p className="whitespace-pre-wrap text-sm">{note.content}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">
                      {new Date(note.updated_at).toLocaleString(locale)}
                      {note.updated_at !== note.created_at && ` (${t("editedLabel")})`}
                    </span>
                    <div className="flex shrink-0 gap-3">
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
                        onClick={() => handleDelete(note.id)}
                        className="text-xs font-medium text-red-500 hover:underline disabled:opacity-50"
                      >
                        {t("deleteButton")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
          placeholder={t("playerNotesPlaceholder")}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={isPending || !newContent.trim()}
          onClick={handleAdd}
          className="w-fit rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          {t("addNoteButton")}
        </button>
      </div>
    </div>
  );
}
