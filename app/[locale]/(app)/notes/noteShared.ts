export type NoteKind = "player" | "club";

export interface NoteItem {
  id: string;
  kind: NoteKind;
  content: string;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | null;
  // "YYYY-MM-DD"
  remindAt: string | null;
  playerId: number | null;
  mentionedPlayerIds: number[];
}

export interface NotePlayer {
  id: number;
  name: string;
  photo: string | null;
}

// How many notes can be pinned per list (the club, or one player) — pinning
// everything would make it meaningless.
export const MAX_PINNED_NOTES = 3;

export const PLAYER_NOTE_COLUMNS = "id, player_id, content, created_at, updated_at, pinned_at, remind_at";
export const CLUB_NOTE_COLUMNS =
  "id, content, created_at, updated_at, pinned_at, remind_at, mentioned_player_ids";

export function playerNoteFromRow(row: {
  id: string;
  player_id: number;
  content: string;
  created_at: string;
  updated_at: string;
  pinned_at: string | null;
  remind_at: string | null;
}): NoteItem {
  return {
    id: row.id,
    kind: "player",
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pinnedAt: row.pinned_at,
    remindAt: row.remind_at,
    playerId: row.player_id,
    mentionedPlayerIds: [],
  };
}

export function clubNoteFromRow(row: {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  pinned_at: string | null;
  remind_at: string | null;
  mentioned_player_ids: number[] | null;
}): NoteItem {
  return {
    id: row.id,
    kind: "club",
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pinnedAt: row.pinned_at,
    remindAt: row.remind_at,
    playerId: null,
    mentionedPlayerIds: row.mentioned_player_ids ?? [],
  };
}

// Pinned first (in the order they were pinned), then newest first.
export function sortNotes(notes: NoteItem[]): NoteItem[] {
  return [...notes].sort((a, b) => {
    if (a.pinnedAt && b.pinnedAt) return a.pinnedAt.localeCompare(b.pinnedAt);
    if (a.pinnedAt) return -1;
    if (b.pinnedAt) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// --- Mentions -------------------------------------------------------------
// Stored inline in the content as "@[Display Name](playerId)" so a note
// still reads right after the player leaves the squad. While editing, the
// textarea shows the friendlier "@Display Name" and a name → id map.

const MENTION_TOKEN = /@\[([^\]]+)\]\((\d+)\)/g;

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; playerId: number };

export function parseNoteContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  let last = 0;
  for (const match of content.matchAll(MENTION_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", text: content.slice(last, index) });
    parts.push({ type: "mention", name: match[1], playerId: Number(match[2]) });
    last = index + match[0].length;
  }
  if (last < content.length) parts.push({ type: "text", text: content.slice(last) });
  return parts;
}

// Plain-text version ("@Name") — for previews and search.
export function noteContentToPlain(content: string) {
  return content.replace(MENTION_TOKEN, (_, name: string) => `@${name}`);
}

export interface ComposerValue {
  text: string;
  mentions: Record<string, number>;
}

export function composerValueFromContent(content: string): ComposerValue {
  const mentions: Record<string, number> = {};
  const text = content.replace(MENTION_TOKEN, (_, name: string, id: string) => {
    mentions[name] = Number(id);
    return `@${name}`;
  });
  return { text, mentions };
}

// Turns "@Name" back into tokens for every mention still present in the
// text; mentions the coach deleted from the text simply drop out.
export function composerValueToContent(value: ComposerValue): {
  content: string;
  mentionedPlayerIds: number[];
} {
  let content = value.text.trim();
  const ids = new Set<number>();
  const names = Object.keys(value.mentions).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const needle = `@${name}`;
    if (!content.includes(needle)) continue;
    const id = value.mentions[name];
    content = content.split(needle).join(`@[${name}](${id})`);
    ids.add(id);
  }
  return { content, mentionedPlayerIds: [...ids] };
}

// --- Reminders ------------------------------------------------------------

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

// "YYYY-MM-DD" for today + `days`.
export function dayKeyFromToday(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

export type ReminderState = "overdue" | "today" | "upcoming";

export function reminderState(remindAt: string | null): ReminderState | null {
  if (!remindAt) return null;
  const today = todayKey();
  if (remindAt < today) return "overdue";
  if (remindAt === today) return "today";
  return "upcoming";
}

export const REMINDER_BADGE_CLASS: Record<ReminderState, string> = {
  overdue: "bg-red-500/10 text-red-700 dark:text-red-400",
  today: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  upcoming: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

// "há 2 horas" / "ontem" style label.
export function timeAgo(iso: string, locale: string) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, "minute");
}

export function formatReminderDay(remindAt: string, locale: string) {
  return new Date(`${remindAt}T00:00:00`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}
