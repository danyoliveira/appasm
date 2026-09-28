"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Icon from "@/components/Icon";
import NoteComposer from "./NoteComposer";
import {
  composerValueFromContent,
  composerValueToContent,
  type NotePlayer,
} from "./noteShared";

export interface NoteFormResult {
  content: string;
  mentionedPlayerIds: number[];
  remindAt: string | null;
  pinned: boolean;
}

// Shared add/edit form: text (with @mentions when `mentionPlayers` is
// given), optional reminder day and — for new notes — "pin".
export default function NoteForm({
  initialContent = "",
  initialRemindAt = null,
  mentionPlayers,
  showPin = false,
  placeholder,
  submitLabel,
  pending,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  initialContent?: string;
  initialRemindAt?: string | null;
  mentionPlayers?: NotePlayer[];
  showPin?: boolean;
  placeholder?: string;
  submitLabel: string;
  pending: boolean;
  autoFocus?: boolean;
  onSubmit: (result: NoteFormResult) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const t = useTranslations("dashboard");
  const [value, setValue] = useState(() => composerValueFromContent(initialContent));
  const [remindAt, setRemindAt] = useState(initialRemindAt ?? "");
  const [showReminder, setShowReminder] = useState(initialRemindAt != null);
  const [pinned, setPinned] = useState(false);

  const canSubmit = !pending && value.text.trim().length > 0;

  async function submit() {
    if (!canSubmit) return;
    const { content, mentionedPlayerIds } = composerValueToContent(value);
    await onSubmit({
      content,
      mentionedPlayerIds,
      remindAt: showReminder && remindAt ? remindAt : null,
      pinned,
    });
    if (!initialContent) {
      setValue({ text: "", mentions: {} });
      setRemindAt("");
      setShowReminder(false);
      setPinned(false);
    }
  }

  const toggleClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? "border-accent bg-accent/10 text-accent"
        : "border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-2">
      <NoteComposer
        value={value}
        onChange={setValue}
        mentionPlayers={mentionPlayers}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onSubmitShortcut={submit}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowReminder((v) => !v)}
          aria-pressed={showReminder}
          className={toggleClass(showReminder)}
        >
          <Icon name="bell" className="h-3.5 w-3.5" />
          {t("notesReminderToggle")}
        </button>
        {showReminder && (
          <input
            type="date"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            aria-label={t("notesReminderToggle")}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
          />
        )}
        {showPin && (
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            aria-pressed={pinned}
            className={toggleClass(pinned)}
          >
            <Icon name="pin" className="h-3.5 w-3.5" filled={pinned} />
            {t("notesPinToggle")}
          </button>
        )}

        <div className="ml-auto flex gap-2">
          {onCancel && (
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
            >
              {t("cancelButton")}
            </button>
          )}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
