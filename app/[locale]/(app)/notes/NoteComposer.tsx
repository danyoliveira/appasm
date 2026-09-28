"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { normalize } from "@/lib/text";
import PlayerAvatar from "@/components/PlayerAvatar";
import type { ComposerValue, NotePlayer } from "./noteShared";

const MAX_SUGGESTIONS = 6;

// Textarea for a note. When `mentionPlayers` is given, typing "@" opens a
// player autocomplete; picking one inserts "@Name" and remembers its id.
export default function NoteComposer({
  value,
  onChange,
  mentionPlayers,
  placeholder,
  rows = 3,
  autoFocus = false,
  onSubmitShortcut,
}: {
  value: ComposerValue;
  onChange: (value: ComposerValue) => void;
  mentionPlayers?: NotePlayer[];
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  onSubmitShortcut?: () => void;
}) {
  const t = useTranslations("dashboard");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Where the "@" being typed starts, and what's been typed after it.
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const q = mention ? normalize(mention.query) : "";
  const suggestions =
    mention && mentionPlayers
      ? mentionPlayers
          .filter((p) => !q || normalize(p.name).split(/[\s.]+/).some((w) => w.startsWith(q)) || normalize(p.name).includes(q))
          .slice(0, MAX_SUGGESTIONS)
      : [];

  function detectMention(text: string, caret: number) {
    if (!mentionPlayers?.length) return setMention(null);
    const before = text.slice(0, caret);
    const match = before.match(/(?:^|\s)@([^\s@]{0,30})$/);
    if (match) {
      setMention({ start: caret - match[1].length - 1, query: match[1] });
      setHighlighted(0);
    } else {
      setMention(null);
    }
  }

  function pick(player: NotePlayer) {
    const el = textareaRef.current;
    if (!mention || !el) return;
    const caret = el.selectionStart;
    const inserted = `@${player.name} `;
    const text = value.text.slice(0, mention.start) + inserted + value.text.slice(caret);
    onChange({ text, mentions: { ...value.mentions, [player.name]: player.id } });
    setMention(null);
    const nextCaret = mention.start + inserted.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  }

  const open = mention != null && suggestions.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value.text}
        rows={rows}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          onChange({ ...value, text: e.target.value });
          detectMention(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => detectMention(value.text, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((i) => Math.min(i + 1, suggestions.length - 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((i) => Math.max(i - 1, 0));
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(suggestions[highlighted]);
              return;
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setMention(null);
              return;
            }
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmitShortcut) {
            e.preventDefault();
            onSubmitShortcut();
          }
        }}
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent"
      />
      {mentionPlayers && mentionPlayers.length > 0 && !open && (
        <p className="mt-1 text-[11px] text-muted">{t("notesMentionHint")}</p>
      )}
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-lg"
        >
          {suggestions.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                i === highlighted ? "bg-background" : ""
              }`}
            >
              <PlayerAvatar photo={p.photo} size="h-6 w-6" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
