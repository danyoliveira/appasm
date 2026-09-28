"use client";

import { useId, useState } from "react";
import { normalize } from "@/lib/text";
import Icon from "./Icon";
import PlayerAvatar from "./PlayerAvatar";

export interface ComboboxPlayer {
  id: number;
  name: string;
  photo: string | null;
}

// Type-to-filter player picker with photos. The list keeps the order it's
// given (e.g. squad order, goalkeepers first).
export default function PlayerCombobox({
  players,
  value,
  onChange,
  placeholder,
  noResultsLabel,
  className = "",
}: {
  players: ComboboxPlayer[];
  value: number | null;
  onChange: (id: number) => void;
  placeholder: string;
  noResultsLabel: string;
  className?: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const selected = players.find((p) => p.id === value) ?? null;
  const q = normalize(query.trim());
  const filtered = q ? players.filter((p) => normalize(p.name).includes(q)) : players;

  function choose(id: number, input?: HTMLInputElement) {
    onChange(id);
    setOpen(false);
    setQuery("");
    input?.blur();
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className={`relative z-20 flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground transition-colors ${
          open ? "border-accent" : "border-border"
        }`}
      >
        {selected && !open ? (
          <PlayerAvatar photo={selected.photo} />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center text-muted">
            <Icon name="search" />
          </span>
        )}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={open ? query : (selected?.name ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            setQuery("");
            setHighlighted(0);
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const p = filtered[highlighted];
              if (p) choose(p.id, e.currentTarget);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-1 outline-none placeholder:text-muted"
        />
        {selected && !open && (
          <span className="text-emerald-600 dark:text-emerald-400">
            <Icon name="check" className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted">{noResultsLabel}</p>
            ) : (
              filtered.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={p.id === value}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => choose(p.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                    i === highlighted ? "bg-background" : ""
                  } ${p.id === value ? "font-semibold text-accent" : ""}`}
                >
                  <PlayerAvatar photo={p.photo} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.id === value && <Icon name="check" className="h-3.5 w-3.5" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
