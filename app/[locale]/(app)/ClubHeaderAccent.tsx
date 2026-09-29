"use client";

import { useEffect, useState } from "react";
import { getVividLogoColor } from "@/lib/logoColor";

// The hero for whichever club is loaded (dashboard greeting, Meu Clube,
// an opponent's page, an archived stint). Light by design: the app's own
// surface (so it follows light/dark theme), tinted with the club's crest
// color (same extractor as the tactical board's team pins, lib/logoColor.ts)
// — a soft wash from the corner, an accent bar on the left, faint pitch
// stripes and an oversized crest watermark bleeding off the right edge.
// Text stays the regular foreground color, so it's readable for any crest.
export default function ClubHeaderAccent({
  logoUrl,
  eyebrow,
  stats,
  children,
}: {
  logoUrl: string | null;
  // Small line above the title (a date, "Meu Clube", a country…).
  eyebrow?: React.ReactNode;
  stats?: { label: string; value: string | number }[];
  children: React.ReactNode;
}) {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!logoUrl) return;
    let cancelled = false;
    // The vivid color, not the dominant one — the dominant pixel of many
    // crests is a grey/white outline (Benfica's comes out #b7b6b6).
    getVividLogoColor(logoUrl).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  // #rrggbb + alpha byte.
  const tint = (alpha: number) =>
    color ? `${color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` : "transparent";

  return (
    <div
      className="relative isolate overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
      style={color ? { borderColor: tint(0.25) } : undefined}
    >
      {/* Club-color wash from the top-left corner, fading into the surface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 transition-opacity duration-500"
        style={{
          background: `radial-gradient(120% 140% at 0% 0%, ${tint(0.22)} 0%, ${tint(0.08)} 45%, transparent 75%)`,
        }}
      />
      {/* Faint pitch stripes. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.035] dark:opacity-[0.02]"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 48px, transparent 48px 96px)",
        }}
      />
      {/* Accent bar in the club color. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5 transition-colors duration-500"
        style={{ background: color ?? "var(--accent)" }}
      />
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-10 top-1/2 -z-10 h-64 w-64 -translate-y-1/2 rotate-[-12deg] object-contain opacity-[0.07] sm:-right-6 sm:h-72 sm:w-72"
        />
      )}

      <div className="flex flex-col gap-5 p-5 pl-6 sm:flex-row sm:items-center sm:p-7 sm:pl-8">
        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
          {logoUrl && (
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white p-2.5 shadow-md ring-1 sm:h-20 sm:w-20"
              style={{ boxShadow: color ? `0 8px 24px -8px ${tint(0.45)}` : undefined, ["--tw-ring-color" as string]: tint(0.3) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <div className="mb-1 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {eyebrow}
              </div>
            )}
            {children}
          </div>
        </div>

        {stats && stats.length > 0 && (
          <div className="grid shrink-0 grid-cols-2 gap-2 min-[480px]:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="min-w-[4.25rem] rounded-xl border border-border bg-background/70 px-2.5 py-2 text-center backdrop-blur-sm [&>div:first-child]:whitespace-nowrap"
                style={color ? { borderTopColor: color, borderTopWidth: 2 } : undefined}
              >
                <div className="text-lg font-bold leading-tight tabular-nums">{s.value}</div>
                <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-muted">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
