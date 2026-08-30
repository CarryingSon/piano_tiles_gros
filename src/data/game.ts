import { songCharts } from "@/data/charts";
import { event, site, tickets } from "@/data/event";
import { songSections, type SongSection } from "@/data/song-sections";

export type { SectionType, SongSection } from "@/data/song-sections";

export type Lane = 0 | 1 | 2 | 3;

export type Note = {
  /** Absolute position in the audio file, in seconds. */
  time: number;
  lane: Lane;
  /** Seconds the lane has to stay pressed; 0 for a plain tap. */
  hold: number;
};

export type SongId = "mrfy" | "kokosy" | "tabu";

export type GameSong = {
  id: SongId;
  artist: string;
  title: string;
  /** Band behind the track — the colour of the whole board comes from it. */
  band: string;
  file: string;
  bpm: number;
  /** Length of the audio file including the silent countdown head. */
  duration: number;
  /** The band's colour. Every other shade on the board is mixed from it in CSS. */
  baseColor: string;
  notes: Note[];
  sections: SongSection[];
  /** Absolute second the closing stretch starts at; see finaleStartSeconds(). */
  finaleStart: number;
  maxScore: number;
};

/** Silent head encoded into every track so the countdown runs before bar one. */
export const countdownLead = 3;

const BASE32 = "0123456789abcdefghijklmnopqrstuv";
const TAP_LANES = "wxyz";
const HOLD_LANES = "WXYZ";
const TICK = 0.01;

/**
 * Expands a chart string written by scripts/build-charts.py. Each note is a
 * base32 tick delta followed by a lane character — w–z for taps, W–Z for holds,
 * where a hold adds two more base32 digits for its length.
 */
function decodeChart(code: string): Note[] {
  const notes: Note[] = [];
  let tick = 0;
  let delta = 0;

  for (let i = 0; i < code.length; i += 1) {
    const char = code[i];
    const digit = BASE32.indexOf(char);
    if (digit >= 0) {
      delta = delta * 32 + digit;
      continue;
    }

    const tap = TAP_LANES.indexOf(char);
    const held = HOLD_LANES.indexOf(char);
    const lane = (tap >= 0 ? tap : held) as Lane;
    tick += delta;
    delta = 0;

    let hold = 0;
    if (held >= 0) {
      hold = (BASE32.indexOf(code[i + 1]) * 32 + BASE32.indexOf(code[i + 2])) * TICK;
      i += 2;
    }
    notes.push({ time: tick * TICK, lane, hold });
  }

  return notes;
}

/**
 * Where the closing stretch begins: the start of the last chorus, and with it
 * everything the song has left. That boundary is already what the speed ramp
 * leans on, so the tiles at their fastest and the tiles worth the finale bonus
 * are one and the same stretch. A song with no chorus never pays the bonus.
 */
function finaleStartSeconds(sections: SongSection[]) {
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    if (sections[i].type === "chorus") return sections[i].startMs / 1000;
  }
  return Infinity;
}

/**
 * What a note struck in the closing stretch is worth, as a factor on top of the
 * combo multiplier. Taken from the note's own time, never the clock, so a hold
 * that straddles the boundary pays one rate end to end — the same rate
 * maxPossibleScore() and the server ceiling assume for it.
 */
export function finaleFactor(song: GameSong, noteTime: number) {
  return noteTime >= song.finaleStart ? 1 + scoring.finaleBonus : 1;
}

/**
 * Every note played at its best: taps as Perfect, holds carried the whole way
 * and released inside the grace window, with the combo multiplier climbing from
 * the start and the finale bonus on everything from the last chorus on.
 *
 * `submit_leaderboard_score` in supabase/migrations mirrors this ceiling and the
 * note count per song, and rejects anything above it. A new beat map — or a
 * change to the numbers in `scoring` — means both sides have to move together;
 * `node scripts/verify-game-data.mjs` recomputes the ceiling and fails when the
 * SQL still carries the old one.
 */
function maxPossibleScore(notes: Note[], finaleStart: number) {
  let total = 0;
  for (let i = 0; i < notes.length; i += 1) {
    const multiplier = comboMultiplier(i + 1)
      * (notes[i].time >= finaleStart ? 1 + scoring.finaleBonus : 1);
    total += notes[i].hold > 0
      ? scoring.hold * (1 + scoring.holdGraceBonus) * multiplier
      : scoring.perfect * multiplier;
  }
  return Math.floor(total);
}

export function comboMultiplier(combo: number) {
  return Math.min(scoring.maxMultiplier, 1 + Math.floor(combo / scoring.multiplierEvery));
}

/**
 * Points a hold pays per second it is actually held. A hold carried end to end
 * is worth `scoring.hold` however long it is, so a short hold simply pays faster
 * — letting go early keeps whatever was earned up to that point.
 */
export function holdPointsPerSecond(holdSeconds: number) {
  return holdSeconds > 0 ? scoring.hold / holdSeconds : 0;
}

const scoring = {
  perfect: 100,
  good: 55,
  /** A hold carried the whole way, before the combo multiplier. */
  hold: 300,
  /** Releasing this close to the end of a hold counts as the full hold … */
  holdGraceMs: 120,
  /** … and pays this much on top, for hitting the release on the beat. */
  holdGraceBonus: 0.1,
  /**
   * What every note from the last chorus on pays on top. The closing stretch is
   * where the tiles run fastest and the windows are tightest, so it is also the
   * only place the big scores are made.
   */
  finaleBonus: 0.25,
  multiplierEvery: 10,
  maxMultiplier: 4,
} as const;

type SongMeta = Pick<GameSong, "id" | "artist" | "title" | "band" | "file" | "baseColor">;

function createSong(meta: SongMeta): GameSong {
  const chart = songCharts[meta.id];
  const notes = decodeChart(chart.chart);
  const sections = songSections[meta.id];
  const finaleStart = finaleStartSeconds(sections);
  return {
    ...meta,
    bpm: chart.bpm,
    duration: chart.duration,
    notes,
    sections,
    finaleStart,
    maxScore: maxPossibleScore(notes, finaleStart),
  };
}

export const gameSongs: GameSong[] = [
  createSong({
    id: "mrfy",
    artist: "MRFY",
    band: "MRFY",
    title: "Prjatučki",
    file: "/media/game/mrfy-prjatucki.m4a",
    baseColor: "#F4510B",
  }),
  createSong({
    id: "kokosy",
    artist: "Kokosy",
    band: "KOKOSY",
    title: "Planeti se vrtijo",
    file: "/media/game/kokosy-planeti-se-vrtijo.m4a",
    baseColor: "#E38DCE",
  }),
  createSong({
    id: "tabu",
    artist: "Tabu",
    band: "TABU",
    title: "Poljubljena",
    file: "/media/game/tabu-poljubljena.m4a",
    baseColor: "#FCDB27",
  }),
];

/** The part of the song playing at `songTime` seconds; "verse" outside the map. */
export function sectionAt(song: GameSong, songTime: number): SongSection["type"] {
  const ms = songTime * 1000;
  for (const section of song.sections) {
    if (ms >= section.startMs && ms < section.endMs) return section.type;
  }
  return "verse";
}

/** One breath of the chorus pulse: four bars of 4/4 at the song's tempo. */
export function chorusPulseSeconds(song: GameSong) {
  return song.bpm > 0 ? (60 / song.bpm) * 16 : 8;
}

export const gameConfig = {
  name: "Ujemi ritem",
  supportingText: "Najdi svoj ritem in pridi do Glasbenega Atlasa.",
  destination: "GLASBENI ATLAS — IVANČNA GORICA",
  event: {
    name: event.name,
    date: event.dateHuman,
    location: `${event.venue}, ${event.city}`,
  },
  ticketUrl: tickets.url,
  ticketLabel: "Preveri vstopnice na Eventimu",
  competition: {
    enabled: true,
    winnerCount: 3,
    /** Nagrada za prve tri po skupnem seštevku. */
    prizeLabel: "Zastonj karta",
    headline: "Prvi trije dobijo zastonj karto",
    note: "Pri izenačenju odloča prej oddan rezultat. Velja po potrditvi rezultata in skladno s pravili organizatorja.",
  },
  siteUrl: `${site.url}/igra`,
  /**
   * Napake, ki jih igra dovoli, preden je konec. Zgrešena ploščica in tap v
   * prazno stezo štejeta enako — vsaka napaka je eno življenje.
   */
  lives: 3,
  play: {
    /** Sekunde, ki jih ploščica potrebuje čez igrišče na začetku komada. */
    travel: 1.55,
    /** Ob koncu komada ploščice padajo toliko hitreje. */
    endSpeed: 2.9,
    /**
     * Čas pred/po noto, v katerem zadetek šteje za Perfect, na začetku komada.
     *
     * Ploščico lahko tapneš, odkar se prikaže, zato je to okno tisto, kar loči
     * Perfect od Good: široko okno pomeni, da je vsak zadetek Perfect. Ker je
     * ploščica pri končni hitrosti na zaslonu komaj `travel / endSpeed` sekunde,
     * bi fiksnih 530 ms proti koncu razglasilo za Perfect čisto vsak tap — zato
     * se okno vzdolž komada zoži na `perfectWindowEndMs` po isti krivulji kot
     * hitrost. Konec komada tako zahteva, da ploščico počakaš nižje.
     */
    perfectWindowMs: 530,
    /** … in toliko meri, ko je hitrost na vrhu. */
    perfectWindowEndMs: 250,
    /** Koliko časa po črti je ploščica še igralna, na začetku komada. */
    lateWindowMs: 260,
    /** … in toliko ob koncu, po isti krivulji kot Perfect okno. */
    lateWindowEndMs: 160,
    /** Dva tapa v isti stezi bližje kot toliko sta pomotoma sprožen dvojni tap. */
    doubleTapGuard: 0.08,
    /**
     * Višina ploščice glede na širino steze. Edini gumb za velikost ploščic.
     *
     * Prej je bila višina omejena z `min(96px, 14 % igrišča)`, kar na telefonu
     * (steza ~100 px) pomeni že ~0,95 širine steze — zato bi razmerje 0,95
     * ploščice pomanjšalo. 1,28 = 0,95 × 1,35 in da dejansko 35 % višje
     * ploščice. Najtesnejši razmik med notama v isti stezi je 193 px, tako da
     * se ploščice tudi pri tej višini nikjer ne prekrivajo.
     */
    tileScale: 1.28,
    /** Zaobljenost ploščice glede na njeno višino. */
    tileRadius: 0.14,
    /** Najmanjši razmik med sosednjima ploščicama v isti stezi, v pikslih. */
    tileMinGap: 6,
  },
  scoring,
  /**
   * Točke, ob katerih igrišče na kratko proslavi. Seznam mora biti naraščajoč —
   * igra ga odklepa po vrsti — in najvišji mejnik pod najnižjim `maxScore` med
   * komadi, sicer je za tisti komad nedosegljiv.
   */
  milestones: [
    { score: 10000, label: "10K", note: "Ritem je tvoj" },
    { score: 60000, label: "60K", note: "Zdaj pa gori" },
    { score: 100000, label: "100K", note: "Legenda Atlasa" },
  ],
  titles: [
    { minRatio: 0, title: "Izgubljeni turist" },
    { minRatio: 0.3, title: "Lovec refrenov" },
    { minRatio: 0.6, title: "Navigator ritma" },
    { minRatio: 0.85, title: "Legenda Glasbenega Atlasa" },
  ],
  colors: {
    yellow: "#FFD800",
    orange: "#E05110",
    pink: "#E99FD6",
    white: "#F6F6F6",
    night: "#050708",
  },
  songs: gameSongs,
  shareText: (score: number, title: string) =>
    `Dosegel/-la sem ${score} točk in postal/-a ${title}. Premagaj moj rezultat na Glasbenem Atlasu!`,
} as const;

export function getPerformance(score: number, maxScore: number) {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  return [...gameConfig.titles]
    .reverse()
    .find((item) => ratio >= item.minRatio) ?? gameConfig.titles[0];
}

/** "3:39" — playable length, countdown head excluded. */
export function songLength(song: GameSong) {
  const seconds = Math.round(song.duration - countdownLead);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
