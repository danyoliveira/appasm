"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// A thin bar across the top that starts the moment an internal link is
// clicked — the server renders the next page before anything else changes
// on screen, and without it a click looked like it did nothing for a
// second or two. It finishes when the new page arrives (path change).
export default function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => {
    function start() {
      clearTimers();
      setProgress(8);
      // Creep towards 90% (never reaching it) while the page loads.
      const steps = [25, 45, 60, 72, 80, 86, 90];
      steps.forEach((value, i) => {
        timers.current.push(window.setTimeout(() => setProgress(value), 150 + i * 450));
      });
      // Safety net: never stay stuck (e.g. a same-page link).
      timers.current.push(window.setTimeout(() => setProgress(null), 15000));
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }

    // Programmatic navigations (router.push) can announce themselves too.
    window.addEventListener("asm:navigation-start", start);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("asm:navigation-start", start);
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  // New page arrived: fill the bar, then fade it out.
  useEffect(() => {
    clearTimers();
    const done = window.setTimeout(() => setProgress((p) => (p == null ? null : 100)), 0);
    const hide = window.setTimeout(() => setProgress(null), 350);
    timers.current.push(done, hide);
  }, [pathname]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
      style={{ opacity: progress == null ? 0 : 1, transition: "opacity 200ms" }}
    >
      <div
        className="h-full bg-accent shadow-[0_0_8px_var(--accent)]"
        style={{ width: `${progress ?? 0}%`, transition: "width 400ms ease-out" }}
      />
    </div>
  );
}

// For router.push/replace calls: shows the bar right away.
export function announceNavigation() {
  window.dispatchEvent(new Event("asm:navigation-start"));
}
