"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// Free-text notes (tactical snapshots, video tags, etc.) can run long, and
// the compact Pré-Jogo grid has no room to show them in full — clamp to a
// few lines by default, only showing a toggle when the text actually
// overflows (measured via scrollHeight vs. the clamped clientHeight, rather
// than guessing from character count).
export default function ExpandableText({ text, className = "" }: { text: string; className?: string }) {
  const t = useTranslations("dashboard");
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={`whitespace-pre-wrap ${expanded ? "" : "line-clamp-3"} ${className}`}
      >
        {text}
      </p>
      {overflowing && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? t("showLessButton") : t("showMoreButton")}
        </button>
      )}
    </div>
  );
}
