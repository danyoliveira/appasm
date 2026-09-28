import { describe, expect, it } from "vitest";
import {
  composerValueFromContent,
  composerValueToContent,
  noteContentToPlain,
  parseNoteContent,
  sortNotes,
  type NoteItem,
} from "./noteShared";

describe("note mentions", () => {
  const stored = "Falar com @[V. Pavlidis](123) e @[Otamendi](9) sobre a pressão";

  it("parses mention tokens into parts", () => {
    expect(parseNoteContent(stored)).toEqual([
      { type: "text", text: "Falar com " },
      { type: "mention", name: "V. Pavlidis", playerId: 123 },
      { type: "text", text: " e " },
      { type: "mention", name: "Otamendi", playerId: 9 },
      { type: "text", text: " sobre a pressão" },
    ]);
  });

  it("renders plain text with @Name", () => {
    expect(noteContentToPlain(stored)).toBe("Falar com @V. Pavlidis e @Otamendi sobre a pressão");
  });

  it("round-trips through the composer", () => {
    const value = composerValueFromContent(stored);
    expect(value.text).toBe("Falar com @V. Pavlidis e @Otamendi sobre a pressão");
    expect(composerValueToContent(value)).toEqual({
      content: stored,
      mentionedPlayerIds: [123, 9],
    });
  });

  it("drops mentions removed from the text", () => {
    const value = composerValueFromContent(stored);
    const edited = { ...value, text: "Falar com @V. Pavlidis" };
    expect(composerValueToContent(edited)).toEqual({
      content: "Falar com @[V. Pavlidis](123)",
      mentionedPlayerIds: [123],
    });
  });
});

describe("sortNotes", () => {
  const note = (id: string, createdAt: string, pinnedAt: string | null = null): NoteItem => ({
    id,
    kind: "club",
    content: id,
    createdAt,
    updatedAt: createdAt,
    pinnedAt,
    remindAt: null,
    playerId: null,
    mentionedPlayerIds: [],
  });

  it("puts pinned notes first (in pin order), then newest first", () => {
    const sorted = sortNotes([
      note("old", "2026-01-01"),
      note("pinnedLate", "2026-01-02", "2026-03-02"),
      note("new", "2026-02-01"),
      note("pinnedEarly", "2026-01-03", "2026-03-01"),
    ]);
    expect(sorted.map((n) => n.id)).toEqual(["pinnedEarly", "pinnedLate", "new", "old"]);
  });
});
