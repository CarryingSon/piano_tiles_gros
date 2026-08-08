import { event, site, tickets } from "@/data/event";

export type Lane = 0 | 1 | 2 | 3;

export type Note = {
  time: number;
  lane: Lane;
  type?: "tap";
};

const lanePattern: Lane[] = [0, 1, 2, 3, 1, 3, 0, 2, 0, 3, 2, 1, 3, 0, 1, 2];

export type SongId = "mrfy" | "kokosy" | "tabu";

export type GameSong = {
  id: SongId;
  artist: string;
  title: string;
  file: string;
  bpm: number;
  offset: number;
  duration: number;
  accent: string;
  notes: Note[];
  maxScore: number;
};

/**
 * Zemljevid se prilagodi tempu izbranega komada. Prvi štirje udarci so
 * namenoma prosti, nato pa se ritem stopnjuje z vmesnimi osminkami. Čase
 * lahko organizator zamenja z ročno pripravljenim seznamom za nov izsek.
 */
function createBeatMap(bpm: number, patternShift: number): Note[] {
  const beat = 60 / bpm;
  const notes: Note[] = [];
  const firstNote = beat * 4;

  for (let i = 0; firstNote + i * beat < 35.2; i += 1) {
    const time = firstNote + i * beat;
    notes.push({ time, lane: lanePattern[(i + patternShift) % lanePattern.length] });

    if (i >= 24 && i % 4 === 1) {
      notes.push({
        time: time + beat / 2,
        lane: lanePattern[(i + patternShift + 5) % lanePattern.length],
      });
    }
  }

  return notes.sort((a, b) => a.time - b.time);
}

function maxPossibleScore(notes: Note[]) {
  return notes.reduce((total, _note, index) => {
    const combo = index + 1;
    const multiplier = Math.min(4, 1 + Math.floor(combo / 10));
    return total + 100 * multiplier;
  }, 0);
}

function createSong(song: Omit<GameSong, "notes" | "maxScore">, patternShift: number): GameSong {
  const notes = createBeatMap(song.bpm, patternShift);
  return { ...song, notes, maxScore: maxPossibleScore(notes) };
}

export const gameSongs: GameSong[] = [
  createSong({
    id: "mrfy",
    artist: "MRFY",
    title: "Prjatučki",
    file: "/media/game/mrfy-prjatucki.mp3",
    bpm: 117.95,
    offset: 0,
    duration: 36.5,
    accent: "#FFD800",
  }, 0),
  createSong({
    id: "kokosy",
    artist: "Kokosy",
    title: "Planeti se vrtijo",
    file: "/media/game/kokosy-planeti-se-vrtijo.mp3",
    bpm: 95.5,
    offset: 0,
    duration: 36.5,
    accent: "#E99FD6",
  }, 3),
  createSong({
    id: "tabu",
    artist: "Tabu",
    title: "Poljubljena",
    file: "/media/game/tabu-poljubljena.mp3",
    bpm: 133.65,
    offset: 0,
    duration: 36.5,
    accent: "#E05110",
  }, 7),
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
  siteUrl: `${site.url}/igra`,
  audio: {
    duration: 36.5,
  },
  timing: {
    perfect: 0.07,
    good: 0.14,
    approach: 1.8,
  },
  scoring: {
    perfect: 100,
    good: 60,
    multiplierEvery: 10,
    maxMultiplier: 4,
  },
  titles: [
    { minScore: 0, title: "Izgubljeni turist" },
    { minScore: 4000, title: "Lovec refrenov" },
    { minScore: 10000, title: "Navigator ritma" },
    { minScore: 16000, title: "Legenda Glasbenega Atlasa" },
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

export function getPerformance(score: number) {
  return [...gameConfig.titles]
    .reverse()
    .find((item) => score >= item.minScore) ?? gameConfig.titles[0];
}
