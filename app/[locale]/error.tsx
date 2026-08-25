"use client";

import { useEffect } from "react";
import ErrorRetry from "@/components/ErrorRetry";

// Every page-level error.tsx below this one only catches errors from its
// own page, not from dashboard/layout.tsx (the sidebar/auth check) — a
// segment's error.tsx never catches errors thrown by that same segment's
// own layout.tsx. This one, one level up, is what catches those instead.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorRetry onRetry={reset} />;
}
