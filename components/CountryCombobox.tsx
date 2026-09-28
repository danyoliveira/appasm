"use client";

import { useId, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { normalize } from "@/lib/text";
import { countryDisplayName } from "@/lib/api-football/flags";
import Icon from "./Icon";

export interface ComboboxCountry {
  name: string;
  flag: string | null;
  // ISO-ish code from API-Football ("PT", "GB-ENG"…) — used for the
  // localized label.
  code: string | null;
}

function Flag({ url }: { url: string | null }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-4 w-6 shrink-0 rounded-sm object-cover ring-1 ring-border" />
  ) : (
    <span className="h-4 w-6 shrink-0 rounded-sm bg-border" />
  );
}

// Type-to-filter country picker with flags. `value` is the country's name
// exactly as API-Football's /countries has it, so the same flag lookup used
// for API players works for it too.
export default function CountryCombobox({
  countries,
  value,
  onChange,
  placeholder,
  noResultsLabel,
}: {
  countries: ComboboxCountry[];
  value: string | null;
  onChange: (name: string | null) => void;
  placeholder: string;
  noResultsLabel: string;
}) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const locale = useLocale();
  // Label in the app's language (Intl knows every 2-letter region code);
  // API-Football's English name as the fallback and as a second search key.
  const options = useMemo(() => {
    let regionNames: Intl.DisplayNames | null = null;
    try {
      regionNames = new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      regionNames = null;
    }
    return countries
      .map((c) => {
        let label = countryDisplayName(c.name);
        if (regionNames && c.code && /^[A-Z]{2}$/.test(c.code)) {
          label = regionNames.of(c.code) ?? label;
        }
        return { ...c, label, search: normalize(`${label} ${countryDisplayName(c.name)}`) };
      })
      .sort((a, b) => a.label.localeCompare(b.label, locale));
  }, [countries, locale]);

  const selected = options.find((c) => c.name === value) ?? null;
  const q = normalize(query.trim());
  const filtered = (q ? options.filter((c) => c.search.includes(q)) : options).slice(0, 80);

  function choose(name: string, input?: HTMLInputElement) {
    onChange(name);
    setOpen(false);
    setQuery("");
    input?.blur();
  }

  return (
    <div className="relative">
      <div
        className={`relative z-20 flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-foreground transition-colors ${
          open ? "border-accent" : "border-border"
        }`}
      >
        {selected && !open ? (
          <Flag url={selected.flag} />
        ) : (
          <span className="flex w-6 justify-center text-muted">
            <Icon name="search" />
          </span>
        )}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={open ? query : (selected?.label ?? "")}
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
              const c = filtered[highlighted];
              if (c) choose(c.name, e.currentTarget);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              e.currentTarget.blur();
            }
          }}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        />
        {selected && !open && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="×"
            className="text-muted hover:text-foreground"
          >
            <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            id={listboxId}
            role="listbox"
            className="absolute bottom-full z-20 mb-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg"
          >
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-muted">{noResultsLabel}</p>
            ) : (
              filtered.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  role="option"
                  aria-selected={c.name === value}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => choose(c.name)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${
                    i === highlighted ? "bg-background" : ""
                  } ${c.name === value ? "font-semibold text-accent" : ""}`}
                >
                  <Flag url={c.flag} />
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.name === value && <Icon name="check" className="h-3.5 w-3.5" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
