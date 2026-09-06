// Ročno odmerjeno po posluhu — NE poganjaj `build-charts.py --sections-output`
// čez to datoteko, ne da bi znova preveril meje spodaj.
//
// Samodejno sklepanje iz gostote ploščic je refrene zgrešilo za pol kitice, zato
// so meje zdaj odmerjene po komadu samem. Čas v komadu + `countdownLead` (3 s
// tihe glave, ki je vštet v datoteko) = `startMs` tukaj; iste vrednosti nosi
// `SECTION_GUIDES` v `scripts/build-charts.py`, da jih ponovni izris ne povozi.

import type { SongId } from "@/data/game";

export type SectionType = "intro" | "verse" | "chorus" | "bridge" | "outro";

export type SongSection = {
  type: SectionType;
  /** Milliseconds into the shipped audio file, countdown head included. */
  startMs: number;
  endMs: number;
};

/**
 * Meje po delih komada. Refren pobarva igrišče v barvo benda, vse ostalo je
 * črno, zato so v praksi pomembni prav prehodi v refren in iz njega.
 *
 * Zadnji refren vsakega komada teče do konca posnetka — tam ostane barva, tam
 * pa je tudi `finaleStart` in z njim zaključni bonus.
 */
export const songSections = {
  // Refren 1:24–1:55, refren 2:27 do konca (čas v komadu).
  mrfy: [
    { type: "intro", startMs: 0, endMs: 23963 },
    { type: "verse", startMs: 23963, endMs: 87000 },
    { type: "chorus", startMs: 87000, endMs: 118000 },
    { type: "verse", startMs: 118000, endMs: 150000 },
    { type: "chorus", startMs: 150000, endMs: 219384 },
  ],
  // Refren 1:00–1:21, refren 2:21 do konca — od 3:01 naprej torej roza.
  kokosy: [
    { type: "intro", startMs: 0, endMs: 25078 },
    { type: "verse", startMs: 25078, endMs: 63000 },
    { type: "chorus", startMs: 63000, endMs: 84000 },
    { type: "verse", startMs: 84000, endMs: 144000 },
    { type: "chorus", startMs: 144000, endMs: 229368 },
  ],
  // Refren 0:49–1:28, refren 2:10 do konca.
  tabu: [
    { type: "intro", startMs: 0, endMs: 24706 },
    { type: "verse", startMs: 24706, endMs: 52000 },
    { type: "chorus", startMs: 52000, endMs: 91000 },
    { type: "verse", startMs: 91000, endMs: 133000 },
    { type: "chorus", startMs: 133000, endMs: 241752 },
  ],
} satisfies Record<SongId, SongSection[]>;
