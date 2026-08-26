"use client";

import { useRouter } from "@/i18n/navigation";

// Every "back" link in the dashboard used to point at one fixed page (e.g.
// always "my club"), so hopping club → club → club could only ever go back
// one fixed step, never retrace the path actually taken. This uses real
// browser history instead, falling back to `href` only when there's no
// in-app history to go back to (a direct link or a page refresh).
export default function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(href);
      }}
      className="text-sm text-muted hover:text-foreground"
    >
      ← {label}
    </button>
  );
}
