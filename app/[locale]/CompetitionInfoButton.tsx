"use client";

import { useState } from "react";

export default function CompetitionInfoButton({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-sm transition-colors hover:border-accent"
      >
        📊
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-surface p-4 text-sm shadow-lg">
            <p className="font-semibold">{title}</p>
            <p className="mt-2 text-xs text-muted">{body}</p>
          </div>
        </>
      )}
    </div>
  );
}
