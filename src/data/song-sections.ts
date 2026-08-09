import type { SongId } from "@/data/game";

export type SectionType = "intro" | "verse" | "chorus" | "bridge" | "outro";

export type SongSection = {
  type: SectionType;
  /** Milliseconds into the shipped audio file, countdown head included. */
  startMs: number;
  endMs: number;
};

/**
 * Where each song changes character, so the board can change with it.
 *
 * These boundaries are read off the shipped beat maps rather than off a score:
 * the charts follow the sung line, so a rest longer than two seconds is a real
 * structural break and note density separates a verse from a refrain. They were
 * then snapped to the nearest bar. Nothing here feeds the hit test — moving a
 * boundary only recolours the background, so they are safe to hand-tune by ear.
 *
 * The sections of a song must be contiguous and cover the whole file;
 * `sectionAt()` in game.ts falls back to "verse" for anything left uncovered.
 */
export const songSections = {
  // Rests at 10.6–23.9 (intro), 111.1–120.3 and 183–197.8 (instrumental breaks).
  mrfy: [
    { type: "intro", startMs: 0, endMs: 24000 },
    { type: "verse", startMs: 24000, endMs: 48000 },
    { type: "chorus", startMs: 48000, endMs: 84000 },
    { type: "verse", startMs: 84000, endMs: 120000 },
    { type: "chorus", startMs: 120000, endMs: 184000 },
    { type: "bridge", startMs: 184000, endMs: 198000 },
    { type: "chorus", startMs: 198000, endMs: 216000 },
    { type: "outro", startMs: 216000, endMs: 219380 },
  ],
  // Rests at 17.1–25.7 (intro), 67.2–80.3, 148.4–161.2 and 206.7–210.7.
  kokosy: [
    { type: "intro", startMs: 0, endMs: 26000 },
    { type: "verse", startMs: 26000, endMs: 68000 },
    { type: "chorus", startMs: 68000, endMs: 108000 },
    { type: "verse", startMs: 108000, endMs: 148000 },
    { type: "chorus", startMs: 148000, endMs: 190000 },
    { type: "bridge", startMs: 190000, endMs: 207000 },
    { type: "outro", startMs: 207000, endMs: 229370 },
  ],
  // Rests at 0–25.3 (intro), 82.4–91.9 and 192–201.4 (instrumental breaks).
  tabu: [
    { type: "intro", startMs: 0, endMs: 25000 },
    { type: "verse", startMs: 25000, endMs: 56000 },
    { type: "chorus", startMs: 56000, endMs: 84000 },
    { type: "verse", startMs: 84000, endMs: 124000 },
    { type: "chorus", startMs: 124000, endMs: 160000 },
    { type: "verse", startMs: 160000, endMs: 192000 },
    { type: "bridge", startMs: 192000, endMs: 202000 },
    { type: "chorus", startMs: 202000, endMs: 234000 },
    { type: "outro", startMs: 234000, endMs: 241750 },
  ],
} satisfies Record<SongId, SongSection[]>;
