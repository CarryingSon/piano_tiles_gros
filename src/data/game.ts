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
 * Every note played at its best: taps as Perfect, holds carried the whole way
 * and released inside the grace window, with the combo multiplier climbing from
 * the start.
 *
 * `submit_leaderboard_score` in supabase/migrations mirrors this ceiling and the
 * note count per song, and rejects anything above it. A new beat map — or a
 * change to the numbers in `scoring` — means both sides have to move together;
 * scripts/build-charts.py prints the SQL values.
 */
function maxPossibleScore(notes: Note[]) {
  let total = 0;
  for (let i = 0; i < notes.length; i += 1) {
    const multiplier = comboMultiplier(i + 1);
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
  multiplierEvery: 10,
  maxMultiplier: 4,
} as const;

type SongMeta = Pick<GameSong, "id" | "artist" | "title" | "band" | "file" | "baseColor">;

function createSong(meta: SongMeta): GameSong {
  const chart = songCharts[meta.id];
  const notes = decodeChart(chart.chart);
  return {
    ...meta,
    bpm: chart.bpm,
    duration: chart.duration,
    notes,
    sections: songSections[meta.id],
    maxScore: maxPossibleScore(notes),
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
    discountPercent: 50,
    headline: "Prvi trije dobijo vstopnico 50 % ceneje",
    note: "Pri izenačenju odloča prej oddan rezultat. Velja po potrditvi rezultata in skladno s pravili organizatorja.",
  },
  siteUrl: `${site.url}/igra`,
  /** Zgrešene ploščice, ki jih igra dovoli, preden je konec. */
  lives: 7,
  play: {
    /** Sekunde, ki jih ploščica potrebuje čez igrišče na začetku komada. */
    travel: 1.55,
    /** Ob koncu komada ploščice padajo toliko hitreje. */
    endSpeed: 1.65,
    /** Spodnji del steze, kjer tap šteje za Perfect. */
    perfectZone: 0.34,
    /** Dva tapa v isti stezi bližje kot toliko sta pomotoma sprožen dvojni tap. */
    doubleTapGuard: 0.08,
    /** Višina ploščice glede na širino steze. Edini gumb za velikost ploščic. */
    tileScale: 0.95,
    /** Zaobljenost ploščice glede na njeno višino. */
    tileRadius: 0.14,
    /** Najmanjši razmik med sosednjima ploščicama v isti stezi, v pikslih. */
    tileMinGap: 6,
  },
  scoring,
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
