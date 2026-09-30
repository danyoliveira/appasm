"use client";

import { useEffect, useState } from "react";
import { contrastTextColor, getVividLogoColor } from "@/lib/logoColor";

// Same look as the club banners (ClubHeaderAccent): the app's own surface
// tinted with the player's current club color — a soft wash from the
// corner, an accent bar on the left, faint pitch stripes — with the
// headline bio figures folded into the same card. Light by design, so it
// sits with the rest of the pages instead of a solid block of color.
export default function PlayerHero({
  clubLogoUrl,
  photoUrl,
  number,
  stats,
  children,
}: {
  clubLogoUrl: string | null;
  photoUrl: string | null | undefined;
  number: number | null | undefined;
  // `hint` is a small second line under the value (e.g. the second
  // position); `wide` gives the tile two columns.
  stats?: { label: string; value: React.ReactNode; hint?: string; wide?: boolean }[];
  children: React.ReactNode;
}) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!clubLogoUrl) return;
    let cancelled = false;
    getVividLogoColor(clubLogoUrl).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [clubLogoUrl]);

  // #rrggbb + alpha byte.
  const tint = (alpha: number) =>
    color ? `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` : "transparent";
  const badgeStyle = color ? { background: color, color: contrastTextColor(color) } : undefined;

  return (
    <div
      className="relative isolate mt-4 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
      style={color ? { borderColor: tint(0.25) } : undefined}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(120% 140% at 0% 0%, ${tint(0.22)} 0%, ${tint(0.08)} 45%, transparent 75%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] dark:opacity-[0.02]"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 48px, transparent 48px 96px)" }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5 transition-colors duration-500"
        style={{ background: color ?? "var(--accent)" }}
      />

      <div className="flex flex-wrap items-center gap-5 p-5 pl-6 sm:p-6 sm:pl-8">
        {photoUrl && (
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt=""
              className="h-24 w-24 rounded-full object-cover shadow-md ring-4 ring-surface"
              style={color ? { boxShadow: `0 8px 24px -8px ${tint(0.45)}` } : undefined}
            />
            {number != null && (
              <span
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground ring-4 ring-surface"
                style={badgeStyle}
              >
                {number}
              </span>
            )}
          </div>
        )}

        <div className="min-w-0">{children}</div>

        {stats && stats.length > 0 && (
          <div
            className="grid w-full grid-cols-2 gap-2 min-[420px]:grid-cols-3 sm:[grid-template-columns:repeat(var(--tiles),minmax(0,1fr))]"
            style={{ ["--tiles" as string]: stats.reduce((n, s) => n + (s.wide ? 2 : 1), 0) }}
          >
            {stats.map((s) => (
              <div
                key={s.label}
                className={`flex flex-col items-center justify-center rounded-xl border border-border bg-background/70 px-2.5 py-2 text-center backdrop-blur-sm ${
                  s.wide ? "col-span-2" : ""
                }`}
                style={color ? { borderTopColor: color, borderTopWidth: 2 } : undefined}
              >
                <div className="flex items-center justify-center text-sm font-bold leading-tight">{s.value}</div>
                {s.hint && <div className="mt-0.5 text-[11px] leading-tight text-muted">{s.hint}</div>}
                <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
