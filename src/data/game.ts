import { songCharts } from "@/data/charts";
import { event, site, tickets } from "@/data/event";

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
  file: string;
  bpm: number;
  /** Length of the audio file including the silent countdown head. */
  duration: number;
  accent: string;
  notes: Note[];
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
 * Every note hit as Perfect, with the combo multiplier climbing from the start.
 *
 * `submit_leaderboard_score` in supabase/migrations mirrors this ceiling and the
 * note count per song, and rejects anything above it. A new beat map means both
 * sides have to move together — scripts/build-charts.py prints the SQL values.
 */
function maxPossibleScore(noteCount: number) {
  let total = 0;
  for (let i = 1; i <= noteCount; i += 1) {
    total += scoring.perfect * comboMultiplier(i);
  }
  return total;
}

export function comboMultiplier(combo: number) {
  return Math.min(scoring.maxMultiplier, 1 + Math.floor(combo / scoring.multiplierEvery));
}

const scoring = {
  perfect: 100,
  good: 55,
  multiplierEvery: 10,
  maxMultiplier: 4,
} as const;

type SongMeta = Pick<GameSong, "id" | "artist" | "title" | "file" | "accent">;

function createSong(meta: SongMeta): GameSong {
  const chart = songCharts[meta.id];
  const notes = decodeChart(chart.chart);
  return {
    ...meta,
    bpm: chart.bpm,
    duration: chart.duration,
    notes,
    maxScore: maxPossibleScore(notes.length),
  };
}

export const gameSongs: GameSong[] = [
  createSong({
    id: "mrfy",
    artist: "MRFY",
    title: "Prjatučki",
    file: "/media/game/mrfy-prjatucki.m4a",
    accent: "#F4510B",
  }),
  createSong({
    id: "kokosy",
    artist: "Kokosy",
    title: "Planeti se vrtijo",
    file: "/media/game/kokosy-planeti-se-vrtijo.m4a",
    accent: "#E38DCE",
  }),
  createSong({
    id: "tabu",
    artist: "Tabu",
    title: "Poljubljena",
    file: "/media/game/tabu-poljubljena.m4a",
    accent: "#FCDB27",
  }),
];

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
