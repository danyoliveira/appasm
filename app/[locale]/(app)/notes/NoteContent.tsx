"use client";

import { Link } from "@/i18n/navigation";
import { parseNoteContent } from "./noteShared";

// A note's text with "@mentions" rendered as links to the player's page.
export default function NoteContent({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {parseNoteContent(content).map((part, i) =>
        part.type === "text" ? (
          <span key={i}>{part.text}</span>
        ) : (
          <Link
            key={i}
            href={`/club/player/${part.playerId}`}
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-accent/10 px-1 font-medium text-accent hover:underline"
          >
            @{part.name}
          </Link>
        ),
      )}
    </p>
  );
}
