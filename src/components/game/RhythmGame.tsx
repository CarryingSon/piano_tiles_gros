"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  chorusPulseSeconds,
  comboMultiplier,
  countdownLead,
  finaleFactor,
  gameConfig,
  getPerformance,
  holdPointsPerSecond,
  sectionAt,
  songLength,
  type GameSong,
  type Lane,
  type SectionType,
} from "@/data/game";
import Leaderboard from "./Leaderboard";
import DesktopGameGate from "./DesktopGameGate";
import styles from "./RhythmGame.module.css";

type Phase = "intro" | "loading" | "playing" | "paused" | "result";
type Grade = "perfect" | "good" | "miss" | "misclick" | "hold";

const PENDING = 0;
const HOLDING = 1;
const DONE = 2;
/** Let go before the tail cleared: keeps the points it earned, and is no miss. */
const RELEASED = 3;

const KEY_LANES: Record<string, Lane> = { d: 0, f: 1, j: 2, k: 3 };
const LANE_IDLE = ["rgba(255,255,255,.02)", "rgba(255,255,255,.05)"] as const;
const TAU = Math.PI * 2;
/** How long the pastel afterimage of a tapped tile stays on the board. */
const TAP_FLASH_MS = 150;
/** Even at the speed cap, a new tile stays visible for at least this long. */
const MIN_TILE_LEAD_SECONDS = 0.45;
/** How long a milestone banner stays on the board. */
const MILESTONE_MS = 1500;
const SPEED_SAMPLE_SECONDS = 0.025;
const SECTION_BLEND_SECONDS = 4;
/** Ignore sub-micro-point drift after a hold's per-frame accrual settles. */
const SCORE_ROUNDING_EPSILON = 1e-6;

type SpeedMap = {
  step: number;
  speed: Float64Array;
  position: Float64Array;
};

const speedMaps = new WeakMap<GameSong, SpeedMap>();

function smoothstep(value: number) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function sectionAcceleration(
  song: GameSong,
  sectionIndex: number,
  lastChorusIndex: number,
) {
  const type = song.sections[sectionIndex]?.type ?? "verse";
  if (type === "intro") return 0.28;
  if (type === "verse") return 0.58;
  if (type === "bridge") return 0.9;
  if (type === "outro") return 1.8;
  return sectionIndex === lastChorusIndex ? 1.65 : 1.2;
}

/**
 * How strongly the song accelerates at this instant. Each section boundary is
 * blended over four seconds; integrating this positive value below makes the
 * resulting speed continuous and never lets it move backwards.
 */
function sectionAccelerationAt(song: GameSong, time: number, lastChorusIndex: number) {
  if (song.sections.length === 0) return 0.58;
  let value = sectionAcceleration(song, 0, lastChorusIndex);
  for (let i = 1; i < song.sections.length; i += 1) {
    const boundary = song.sections[i].startMs / 1000;
    const blend = smoothstep(
      (time - (boundary - SECTION_BLEND_SECONDS / 2)) / SECTION_BLEND_SECONDS,
    );
    value += (sectionAcceleration(song, i, lastChorusIndex) - value) * blend;
  }
  return value;
}

function buildSpeedMap(song: GameSong): SpeedMap {
  const intervals = Math.max(1, Math.ceil(song.duration / SPEED_SAMPLE_SECONDS));
  const step = song.duration / intervals;
  const acceleration = new Float64Array(intervals + 1);
  const speed = new Float64Array(intervals + 1);
  const position = new Float64Array(intervals + 1);
  let lastChorusIndex = -1;
  for (let i = song.sections.length - 1; i >= 0; i -= 1) {
    if (song.sections[i].type === "chorus") {
      lastChorusIndex = i;
      break;
    }
  }

  const accelerationDensity = (time: number) => {
    const progress = song.duration > 0 ? Math.max(0, Math.min(1, time / song.duration)) : 0;
    // The small floor keeps the map strictly increasing while progress^1.65
    // leaves roughly the first third calm and concentrates acceleration later.
    return 0.035
      + Math.pow(progress, 1.65) * sectionAccelerationAt(song, time, lastChorusIndex);
  };

  for (let i = 1; i <= intervals; i += 1) {
    const before = (i - 1) * step;
    const after = i * step;
    acceleration[i] = acceleration[i - 1]
      + ((accelerationDensity(before) + accelerationDensity(after)) / 2) * step;
  }

  const totalAcceleration = acceleration[intervals] || 1;
  const configuredEndSpeed = Math.max(1, gameConfig.play.endSpeed);
  const playableEndSpeed = Math.min(
    configuredEndSpeed,
    gameConfig.play.travel / MIN_TILE_LEAD_SECONDS,
  );
  for (let i = 0; i <= intervals; i += 1) {
    speed[i] = 1
      + (playableEndSpeed - 1) * (acceleration[i] / totalAcceleration);
    if (i > 0) {
      position[i] = position[i - 1] + ((speed[i - 1] + speed[i]) / 2) * step;
    }
  }

  return { step, speed, position };
}

function speedMapFor(song: GameSong) {
  const cached = speedMaps.get(song);
  if (cached) return cached;
  const map = buildSpeedMap(song);
  speedMaps.set(song, map);
  return map;
}

/** Continuous section-aware speed multiplier at an absolute song time. */
export function speedAt(time: number, song: GameSong) {
  const map = speedMapFor(song);
  if (time <= 0) return map.speed[0];
  if (time >= song.duration) return map.speed[map.speed.length - 1];
  const index = Math.min(map.speed.length - 2, Math.floor(time / map.step));
  const fraction = (time - index * map.step) / map.step;
  return map.speed[index] + (map.speed[index + 1] - map.speed[index]) * fraction;
}

/**
 * Integral of speedAt(). Drawing, hit tests, hold tails and overlap guards all
 * use this one strictly increasing mapping, so a note is exactly on the hit
 * line when `songTime === note.time`.
 */
export function positionAt(time: number, song: GameSong) {
  const map = speedMapFor(song);
  if (time <= 0) return time * map.speed[0];
  if (time >= song.duration) {
    return map.position[map.position.length - 1]
      + (time - song.duration) * map.speed[map.speed.length - 1];
  }
  const index = Math.min(map.position.length - 2, Math.floor(time / map.step));
  const elapsed = time - index * map.step;
  const speedSlope = (map.speed[index + 1] - map.speed[index]) / map.step;
  return map.position[index]
    + map.speed[index] * elapsed
    + (speedSlope * elapsed * elapsed) / 2;
}

/**
 * How far along the acceleration the song is: 0 while the tiles still fall at
 * their opening speed, 1 once they are at the cap. The hit windows ride this
 * same curve, so precision tightens exactly where the board speeds up and there
 * is no second difficulty curve to keep in step with the first.
 */
function speedProgress(time: number, song: GameSong) {
  const map = speedMapFor(song);
  const top = map.speed[map.speed.length - 1];
  if (top <= 1) return 0;
  return Math.max(0, Math.min(1, (speedAt(time, song) - 1) / (top - 1)));
}

/** Perfect window in milliseconds at an absolute song time. */
function perfectWindowAt(time: number, song: GameSong) {
  const { perfectWindowMs, perfectWindowEndMs } = gameConfig.play;
  return perfectWindowMs
    + (perfectWindowEndMs - perfectWindowMs) * speedProgress(time, song);
}

/** How long past the line a tile stays playable at an absolute song time. */
function lateWindowAt(time: number, song: GameSong) {
  const { lateWindowMs, lateWindowEndMs } = gameConfig.play;
  return lateWindowMs + (lateWindowEndMs - lateWindowMs) * speedProgress(time, song);
}

/** The colour tokens the board paints with, read back off the stylesheet. */
const TOKENS = ["color", "pastel", "deep", "glow", "tile"] as const;
type Palette = Record<(typeof TOKENS)[number], string>;

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

/** Fallback for --band-pastel where color-mix() is missing. */
function lighten(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (value >> shift) & 255;
    return Math.round(c + (255 - c) * amount);
  };
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

/** Fallback for --band-deep: the same mix towards the night background. */
function darken(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round((((value >> shift) & 255) - 10) * amount + 10);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

function fade(hex: string, alpha: number) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/**
 * Re-alphas a colour read off a probe element. A browser reports a color-mix()
 * result as `color(srgb …)` rather than `rgb()`, and both have to survive here.
 */
function withAlpha(color: string, alpha: number) {
  if (color.startsWith("color(")) {
    const body = color.slice(6, color.lastIndexOf(")")).split("/")[0].trim();
    return `color(${body} / ${alpha})`;
  }
  const parts = color.match(/[\d.]+/g);
  if (!parts || parts.length < 3) return color;
  return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
}

/** Both spellings a computed colour can come back in. */
const RESOLVED_COLOR = /^(rgb|color\()/;

function reducedMotion() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const highScoreKey = (song: GameSong) => `glasbeni-atlas-ritem-high-score-${song.id}`;

/** Speaker with waves, or the same cone with a cross once the round is muted. */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
      <path d="M4 9.5v5h3.6L12 18.6V5.4L7.6 9.5H4z" fill="currentColor" />
      {muted ? (
        <path
          d="M16 9.5l4.5 5m0-5l-4.5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M15.4 8.9a4.2 4.2 0 0 1 0 6.2M18 6.6a7.6 7.6 0 0 1 0 10.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

type Layout = {
  width: number;
  height: number;
  dpr: number;
  top: number;
  bottom: number;
  playHeight: number;
  laneWidth: number;
  tileWidth: number;
  tileHeight: number;
};

type Sprite = { canvas: HTMLCanvasElement; pad: number; width: number; height: number };
type Painters = { sprites: Record<string, Sprite>; flash: CanvasGradient | null; palette: Palette };

/** Per-round mutable state. Lives in a ref so the frame loop never re-renders. */
type Run = {
  song: GameSong;
  state: Uint8Array;
  /** Index of the next note in the same lane, so tiles never overlap. */
  nextInLane: Int32Array;
  /**
   * 1 where the note belongs to a chorus. A tile is coloured by the part of the
   * song it was written for, not by the part playing when it is drawn, so the
   * new colour sweeps down the board with the music instead of every tile on
   * screen flipping at once on the boundary.
   */
  chorusNote: Uint8Array;
  cursor: number;
  /** Kept as a float: holds pay out in fragments of a point every frame. */
  score: number;
  combo: number;
  bestCombo: number;
  perfect: number;
  good: number;
  /** A tile crossed the line untouched. */
  misses: number;
  /** A lane was pressed with no note in the window. */
  misclicks: number;
  /** Index of the next milestone in gameConfig.milestones; also how many fired. */
  milestone: number;
  over: boolean;
  section: SectionType | "";
  frameAt: number;
  activeHold: Int32Array;
  holdHeldMs: Float64Array;
  holdEarned: Float64Array;
  /** Combo multiplier captured when each hold head is hit. */
  holdMultiplier: Float64Array;
  /** Played fraction per note; RELEASED holds keep this frozen on the board. */
  holdFill: Float64Array;
  lanePresses: Int32Array;
  laneFlash: Float64Array;
  laneTapAt: Float64Array;
  /** Where and until when to leave the pastel print of a struck tile. */
  laneHitAt: Float64Array;
  laneHitY: Float64Array;
};

function createRun(song: GameSong): Run {
  const notes = song.notes;
  const nextInLane = new Int32Array(notes.length).fill(-1);
  const seen = [-1, -1, -1, -1];
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    nextInLane[i] = seen[notes[i].lane];
    seen[notes[i].lane] = i;
  }

  const chorusNote = new Uint8Array(notes.length);
  for (let i = 0; i < notes.length; i += 1) {
    chorusNote[i] = sectionAt(song, notes[i].time) === "chorus" ? 1 : 0;
  }

  return {
    song,
    state: new Uint8Array(notes.length),
    nextInLane,
    chorusNote,
    cursor: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    perfect: 0,
    good: 0,
    misses: 0,
    misclicks: 0,
    milestone: 0,
    over: false,
    section: "",
    frameAt: 0,
    activeHold: Int32Array.from([-1, -1, -1, -1]),
    holdHeldMs: new Float64Array(4),
    holdEarned: new Float64Array(4),
    holdMultiplier: Float64Array.from([1, 1, 1, 1]),
    holdFill: new Float64Array(notes.length),
    lanePresses: new Int32Array(4),
    laneFlash: new Float64Array(4),
    laneTapAt: Float64Array.from([-1, -1, -1, -1]),
    laneHitAt: new Float64Array(4),
    laneHitY: new Float64Array(4),
  };
}

export default function RhythmGame() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [selectedSong, setSelectedSong] = useState<GameSong>(gameConfig.songs[0]);
  const [muted, setMuted] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [pauseReason, setPauseReason] = useState("Igra je ustavljena.");
  const [shareStatus, setShareStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState({
    score: 0, perfect: 0, good: 0, misses: 0, misclicks: 0, bestCombo: 0, best: 0,
    milestones: 0, over: false,
  });

  const phaseRef = useRef<Phase>(phase);
  const runRef = useRef<Run>(createRun(gameConfig.songs[0]));
  const frameRef = useRef(0);

  const audioElRef = useRef<HTMLAudioElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const loadedSongRef = useRef<string>("");
  const silentStartRef = useRef<number | null>(null);
  const clockRef = useRef({ media: -1, anchor: 0, at: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const paintersRef = useRef<Painters>({
    sprites: {},
    flash: null,
    palette: {
      color: "#ffd800", pastel: "#ffd800", deep: "#0a0a0a",
      glow: "rgba(255,216,0,.4)", tile: "#ffd800",
    },
  });
  const pointerLanesRef = useRef(new Map<number, Lane>());

  const laneRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const laneStateRef = useRef(["", "", "", ""]);
  const laneErrorTimersRef = useRef<number[]>([0, 0, 0, 0]);
  const floatersRef = useRef<HTMLDivElement>(null);
  const holdCounterRefs = useRef<(HTMLSpanElement | null)[]>([null, null, null, null]);
  const holdCounterAnimationsRef = useRef<(Animation | null)[]>([null, null, null, null]);
  const probesRef = useRef<HTMLDivElement>(null);

  const scoreElRef = useRef<HTMLElement>(null);
  const comboElRef = useRef<HTMLElement>(null);
  const multElRef = useRef<HTMLElement>(null);
  const livesElRef = useRef<HTMLDivElement>(null);
  const progressElRef = useRef<HTMLSpanElement>(null);
  const feedbackElRef = useRef<HTMLParagraphElement>(null);
  const feedbackAnimRef = useRef<Animation | null>(null);
  const countElRef = useRef<HTMLDivElement>(null);
  const milestoneElRef = useRef<HTMLDivElement>(null);
  const milestoneRingRef = useRef<HTMLSpanElement>(null);
  const milestoneLabelRef = useRef<HTMLElement>(null);
  const milestoneNoteRef = useRef<HTMLSpanElement>(null);
  const milestoneAnimsRef = useRef<Animation[]>([]);
  const hudCacheRef = useRef({ score: -1, combo: -1, lives: -1, progress: -1, count: -1 });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.cancelAnimationFrame(frameRef.current);
      void audioCtxRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = muted ? 0 : 0.85;
    const el = audioElRef.current;
    if (el && !gainRef.current) el.volume = muted ? 0 : 1;
  }, [muted]);

  /* ----------------------------------------------------------------- clock */

  const songTimeAt = useCallback((now: number) => {
    if (silentStartRef.current !== null) return (now - silentStartRef.current) / 1000;
    const el = audioElRef.current;
    if (!el) return 0;
    const clock = clockRef.current;
    const media = el.currentTime;

    if (clock.media < 0) {
      clock.media = media;
      clock.anchor = media;
      clock.at = now;
      return media;
    }
    const rate = el.playbackRate || 1;
    if (media !== clock.media) {
      // The media clock only ticks a few times a second; ease onto each new
      // reading instead of snapping so the tiles never stutter.
      const predicted = clock.anchor + ((now - clock.at) / 1000) * rate;
      const error = media - predicted;
      clock.anchor = Math.abs(error) > 0.35 ? media : predicted + error * 0.15;
      clock.at = now;
      clock.media = media;
      return clock.anchor;
    }
    return clock.anchor + Math.min(0.3, ((now - clock.at) / 1000) * rate);
  }, []);

  /* --------------------------------------------------------------- scoring */

  const flashFeedback = useCallback((label: string, grade: Grade) => {
    const el = feedbackElRef.current;
    if (!el) return;
    el.textContent = label;
    el.dataset.grade = grade;
    // Cancel the previous run first: hundreds of finished fill-forwards
    // animations would otherwise pile up on the element over a full song.
    feedbackAnimRef.current?.cancel();
    feedbackAnimRef.current = el.animate(
      [
        { opacity: 0, transform: "translateX(-50%) scale(.72) rotate(-3deg)" },
        { opacity: 1, offset: 0.35 },
        { opacity: 0, transform: "translateX(-50%) scale(1.14) rotate(-3deg)" },
      ],
      { duration: 420, easing: "ease-out", fill: "forwards" },
    );
  }, []);

  /**
   * A score milestone: the banner swells over the board while a ring opens out
   * of it. Both are compositor-only transforms on two nodes that already exist,
   * so nothing here competes with the frame loop for the main thread.
   */
  const celebrate = useCallback((milestone: (typeof gameConfig.milestones)[number]) => {
    const el = milestoneElRef.current;
    if (!el) return;
    if (milestoneLabelRef.current) milestoneLabelRef.current.textContent = milestone.label;
    if (milestoneNoteRef.current) milestoneNoteRef.current.textContent = milestone.note;
    el.hidden = false;
    navigator.vibrate?.([0, 30, 60, 30, 60, 70]);

    for (const animation of milestoneAnimsRef.current) animation.cancel();
    const lessMotion = reducedMotion();
    const banner = el.animate(
      lessMotion
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: "translate(-50%, -50%) scale(.4)" },
            { opacity: 1, transform: "translate(-50%, -50%) scale(1.08)", offset: 0.22 },
            { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.34 },
            { opacity: 1, transform: "translate(-50%, -50%) scale(1)", offset: 0.72 },
            { opacity: 0, transform: "translate(-50%, -50%) scale(1.3)" },
          ],
      // fill-forwards holds the faded-out last frame until `hidden` lands a
      // microtask later, so the banner never flashes back at full opacity.
      { duration: MILESTONE_MS, easing: "cubic-bezier(.2,.8,.3,1)", fill: "forwards" },
    );
    milestoneAnimsRef.current = [banner];

    const ring = milestoneRingRef.current;
    if (ring && !lessMotion) {
      milestoneAnimsRef.current.push(ring.animate(
        [
          { transform: "translate(-50%, -50%) scale(.2)", opacity: 0.55 },
          { transform: "translate(-50%, -50%) scale(3.4)", opacity: 0 },
        ],
        { duration: 900, easing: "ease-out" },
      ));
    }

    const done = () => {
      // Another milestone may already own the banner by the time this settles.
      if (milestoneAnimsRef.current[0] === banner && milestoneElRef.current) {
        milestoneElRef.current.hidden = true;
      }
    };
    banner.finished.then(done).catch(() => {});
  }, []);

  /** Short red shake for a missed tile, short grey blink for a stray press. */
  const pulseLane = useCallback((lane: Lane, kind: "miss" | "misclick") => {
    const el = laneRefs.current[lane];
    if (!el) return;
    window.clearTimeout(laneErrorTimersRef.current[lane]);
    el.removeAttribute("data-error");
    void el.offsetWidth; // restart the animation for a second error in a row
    el.dataset.error = kind;
    laneErrorTimersRef.current[lane] = window.setTimeout(() => {
      el.removeAttribute("data-error");
    }, 360);
  }, []);

  /** A circle growing out of the point of contact. */
  const rippleAt = useCallback((lane: Lane, x: number, y: number) => {
    const host = laneRefs.current[lane];
    if (!host || reducedMotion()) return;
    const ripple = document.createElement("span");
    ripple.className = styles.ripple;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    host.append(ripple);
    const animation = ripple.animate(
      [
        { transform: "scale(0)", opacity: 0.5 },
        { transform: "scale(2.2)", opacity: 0 },
      ],
      { duration: 260, easing: "ease-out" },
    );
    animation.finished.then(() => ripple.remove()).catch(() => ripple.remove());
  }, []);

  const placeHoldCounter = useCallback((label: HTMLSpanElement, lane: Lane) => {
    const layout = layoutRef.current;
    if (!layout) return;
    label.style.left = `${(lane + 0.5) * layout.laneWidth}px`;
    label.style.top = `${Math.max(0, layout.playHeight - 12)}px`;
  }, []);

  /** The live counter is the same DOM node that floats away on completion. */
  const beginHoldCounter = useCallback((lane: Lane) => {
    const host = floatersRef.current;
    if (!host) return;
    holdCounterAnimationsRef.current[lane]?.cancel();
    holdCounterAnimationsRef.current[lane] = null;
    holdCounterRefs.current[lane]?.remove();
    const label = document.createElement("span");
    label.className = styles.holdCounter;
    label.dataset.state = "active";
    label.textContent = "+0";
    placeHoldCounter(label, lane);
    host.append(label);
    holdCounterRefs.current[lane] = label;
  }, [placeHoldCounter]);

  const finishHoldCounter = useCallback((lane: Lane, points: number) => {
    const label = holdCounterRefs.current[lane];
    if (!label) return;
    label.textContent = `+${Math.max(0, points)}`;
    label.dataset.state = "complete";
    const lessMotion = reducedMotion();
    const animation = label.animate(
      lessMotion
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { transform: "translate(-50%, -100%)", opacity: 1 },
            { transform: "translate(-50%, calc(-100% - 40px))", opacity: 0 },
          ],
      { duration: lessMotion ? 280 : 700, easing: "ease-out" },
    );
    holdCounterAnimationsRef.current[lane] = animation;
    const remove = () => {
      if (holdCounterRefs.current[lane] === label) holdCounterRefs.current[lane] = null;
      if (holdCounterAnimationsRef.current[lane] === animation) {
        holdCounterAnimationsRef.current[lane] = null;
      }
      label.remove();
    };
    animation.finished.then(remove).catch(remove);
  }, []);

  const awardHit = useCallback((
    run: Run,
    perfect: boolean,
    index: number,
    lane: Lane,
    y: number,
    now: number,
  ) => {
    run.combo += 1;
    if (run.combo > run.bestCombo) run.bestCombo = run.combo;
    // Tiles can be struck out of chart order, so cap the combo at the ceiling
    // maxPossibleScore() assigned this note; the finale factor comes off the
    // note's own time, which both sides read the same way.
    const multiplier = Math.min(comboMultiplier(run.combo), comboMultiplier(index + 1))
      * finaleFactor(run.song, run.song.notes[index].time);
    run.score += (perfect ? gameConfig.scoring.perfect : gameConfig.scoring.good) * multiplier;
    if (perfect) run.perfect += 1;
    else run.good += 1;
    run.laneHitAt[lane] = now + TAP_FLASH_MS;
    run.laneHitY[lane] = y;
    flashFeedback(perfect ? "Perfect" : "Good", perfect ? "perfect" : "good");
    navigator.vibrate?.(12);
  }, [flashFeedback]);

  /** Misses and stray presses cost the same: one life each, and three is all. */
  const outOfLives = useCallback(
    (run: Run) => run.misses + run.misclicks >= gameConfig.lives,
    [],
  );

  /** A tile crossed the line untouched. */
  const registerMiss = useCallback((run: Run, lane: Lane) => {
    if (run.over) return;
    run.combo = 0;
    run.misses += 1;
    pulseLane(lane, "miss");
    if (outOfLives(run)) {
      run.over = true;
      flashFeedback("Konec", "miss");
      return;
    }
    flashFeedback("Miss", "miss");
  }, [flashFeedback, pulseLane, outOfLives]);

  /** A press with no note in the window: costs a life, same as a missed tile. */
  const registerMisclick = useCallback((run: Run, lane: Lane) => {
    if (run.over) return;
    run.combo = 0;
    run.misclicks += 1;
    pulseLane(lane, "misclick");
    if (outOfLives(run)) {
      run.over = true;
      flashFeedback("Konec", "misclick");
      return;
    }
    flashFeedback("Mimo", "misclick");
  }, [flashFeedback, pulseLane, outOfLives]);

  /* ---------------------------------------------------------------- colours */

  /**
   * A canvas cannot resolve `var(--band-pastel)`, so the stage carries one
   * probe element per token and this reads the colour the browser computed for
   * it. The stylesheet stays the only place a shade is defined; the fallback
   * repeats the same two mixes in JS for browsers without color-mix().
   */
  const readPalette = useCallback((baseColor: string): Palette => {
    const host = probesRef.current;
    const supported = typeof CSS !== "undefined"
      && CSS.supports?.("color", "color-mix(in srgb, red 45%, white)");

    if (host && supported) {
      const palette = {} as Palette;
      let complete = true;
      for (const token of TOKENS) {
        const probe = host.querySelector(`[data-token="${token}"]`);
        const color = probe ? window.getComputedStyle(probe).color : "";
        if (!RESOLVED_COLOR.test(color)) complete = false;
        palette[token] = color;
      }
      if (complete) return palette;
    }

    return {
      color: baseColor,
      pastel: lighten(baseColor, 0.55),
      deep: darken(baseColor, 0.22),
      glow: fade(baseColor, 0.4),
      tile: darken(baseColor, 0.74),
    };
  }, []);

  /* ---------------------------------------------------------------- layout */

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const rect = stage.getBoundingClientRect();
    const hud = hudRef.current?.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const top = hud ? hud.bottom - rect.top + 10 : 74;
    const bottom = height - 18;
    const playHeight = Math.max(1, bottom - top);
    const laneWidth = width / 4;
    const tileWidth = laneWidth - 12;
    // Tile height follows the width of its lane, so a tile keeps the same shape
    // on every screen. gameConfig.play.tileScale is the only knob for its size.
    const tileHeight = Math.max(48, Math.min(playHeight * 0.4, laneWidth * gameConfig.play.tileScale));

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    layoutRef.current = { width, height, dpr, top, bottom, playHeight, laneWidth, tileWidth, tileHeight };

    // The lane overlay and the "+N" labels are plain DOM on top of the board,
    // so they need to know where the playfield starts and how tall it is.
    stage.style.setProperty("--board-top", `${top}px`);
    stage.style.setProperty("--board-height", `${playHeight}px`);
    for (let lane = 0; lane < 4; lane += 1) {
      const counter = holdCounterRefs.current[lane];
      if (counter) placeHoldCounter(counter, lane as Lane);
    }

    const palette = readPalette(runRef.current.song.baseColor);
    const radius = tileHeight * gameConfig.play.tileRadius;

    // Glow is baked into the tap sprite once per size — drawing it per tap per
    // frame is what made the old board stutter on phones. Variable-length hold
    // shapes are painted directly below, since their geometry changes live.
    //
    // One sprite per part of the song: the chorus tile carries the band's full
    // colour and a wider halo, the verse tile the same colour pushed towards the
    // night. The pad has to clear the blur, so the two differ in size as well.
    const sprites: Record<string, Sprite> = {};
    for (const { color, blur } of [
      { color: palette.color, blur: 26 },
      { color: palette.tile, blur: 16 },
    ]) {
      const pad = blur + 4;
      const sprite = document.createElement("canvas");
      const w = tileWidth + pad * 2;
      const h = tileHeight + pad * 2;
      sprite.width = Math.round(w * dpr);
      sprite.height = Math.round(h * dpr);
      const g = sprite.getContext("2d");
      if (!g) continue;
      g.scale(dpr, dpr);
      g.shadowColor = color;
      g.shadowBlur = blur;
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(pad, pad, tileWidth, tileHeight, radius);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(5,7,8,.8)";
      g.fillRect(pad + 9, pad + tileHeight / 2 - 1, tileWidth - 18, 2);
      g.fillStyle = "#050708";
      g.beginPath();
      g.arc(pad + tileWidth - 13, pad + 13, 3, 0, TAU);
      g.fill();
      sprites[color] = { canvas: sprite, pad, width: w, height: h };
    }

    const board = canvas.getContext("2d");
    let flash: CanvasGradient | null = null;
    if (board) {
      flash = board.createLinearGradient(0, top, 0, bottom);
      flash.addColorStop(0, withAlpha(palette.color, 0));
      flash.addColorStop(1, withAlpha(palette.color, 0.18));
    }
    paintersRef.current = { sprites, flash, palette };
  }, [placeHoldCounter, readPalette]);

  useEffect(() => {
    if (phase !== "playing" && phase !== "paused") return;
    measure();
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [measure, phase]);

  /* ----------------------------------------------------------------- input */

  const pressLane = useCallback((lane: Lane, now: number) => {
    const run = runRef.current;
    if (phaseRef.current !== "playing" || run.over) return;

    run.lanePresses[lane] += 1;
    if (run.lanePresses[lane] > 1) return;

    const songTime = songTimeAt(now);
    if (songTime - run.laneTapAt[lane] < gameConfig.play.doubleTapGuard) return;
    run.laneTapAt[lane] = songTime;
    run.laneFlash[lane] = now + 150;
    if (run.activeHold[lane] >= 0) return;

    const { song, state } = run;
    const notes = song.notes;
    const travel = gameConfig.play.travel;
    const here = positionAt(songTime, song);
    const layout = layoutRef.current;

    let target = -1;
    for (let i = run.cursor; i < notes.length; i += 1) {
      const lead = positionAt(notes[i].time, song) - here;
      if (lead > travel) break;
      const deltaMs = (notes[i].time - songTime) * 1000;
      if (
        state[i] !== PENDING
        || notes[i].lane !== lane
        || deltaMs < -lateWindowAt(notes[i].time, song)
      ) continue;
      target = i;
      break;
    }

    // Nothing in the window: a stray press, and one of the three lives.
    if (target < 0) {
      registerMisclick(run, lane);
      return;
    }

    const lead = positionAt(notes[target].time, song) - here;
    const deltaMs = Math.abs((notes[target].time - songTime) * 1000);
    const perfect = deltaMs <= perfectWindowAt(notes[target].time, song);
    const hitY = layout ? layout.top + (1 - lead / travel) * layout.playHeight : 0;
    if (notes[target].hold > 0) {
      // The head counts as a hit right away; the points come in over the hold.
      state[target] = HOLDING;
      run.activeHold[lane] = target;
      run.holdHeldMs[lane] = 0;
      run.holdEarned[lane] = 0;
      run.holdFill[target] = 0;
      run.laneFlash[lane] = now + 400;
      run.combo += 1;
      if (run.combo > run.bestCombo) run.bestCombo = run.combo;
      // A later cross-lane tap can be struck while this earlier note is still
      // pending. Cap the snapshot at the hold's chart-order ceiling so input
      // reordering can never exceed maxPossibleScore on the server.
      run.holdMultiplier[lane] = Math.min(
        comboMultiplier(run.combo),
        comboMultiplier(target + 1),
      ) * finaleFactor(song, notes[target].time);
      if (perfect) run.perfect += 1;
      else run.good += 1;
      beginHoldCounter(lane);
      flashFeedback("Drži", "hold");
      navigator.vibrate?.(12);
      return;
    }
    state[target] = DONE;
    awardHit(run, perfect, target, lane, hitY, now);
  }, [awardHit, beginHoldCounter, flashFeedback, registerMisclick, songTimeAt]);

  /**
   * Ends a hold and pays out what it earned. Letting go early is not a miss:
   * the points already banked stay, the combo survives, and only the rest of
   * the tail goes grey. Releasing inside the last `holdGraceMs` counts as the
   * whole hold and pays the precision bonus on top.
   */
  const finishHold = useCallback((run: Run, lane: Lane, songTime: number, released: boolean) => {
    const held = run.activeHold[lane];
    if (held < 0) return;
    const note = run.song.notes[held];
    const { hold: holdPoints, holdGraceMs, holdGraceBonus } = gameConfig.scoring;
    const multiplier = run.holdMultiplier[lane];
    // Two clocks describe the same moment: the frames the lane has been held
    // for, and how far the tail still is from the line. The first is what the
    // payout is built on, the second is what the player sees. Either one
    // landing inside the window counts, so the smoothing on the audio clock can
    // never eat a release the player made on the beat.
    const heldOut = note.hold * 1000 - run.holdHeldMs[lane] <= holdGraceMs;
    const tailClose = (note.time + note.hold - songTime) * 1000 <= holdGraceMs;
    const full = holdPoints * multiplier;
    const playedFraction = note.hold > 0
      ? Math.min(1, run.holdHeldMs[lane] / (note.hold * 1000))
      : 1;

    let earned = run.holdEarned[lane];
    if (!released || heldOut || tailClose) {
      earned += Math.max(0, full - earned);
      if (released) earned += holdPoints * holdGraceBonus * multiplier;
      run.state[held] = DONE;
      run.holdFill[held] = 1;
    } else {
      run.state[held] = RELEASED;
      run.holdFill[held] = playedFraction;
    }

    run.score += earned - run.holdEarned[lane];
    run.activeHold[lane] = -1;
    run.holdHeldMs[lane] = 0;
    run.holdEarned[lane] = 0;
    run.holdMultiplier[lane] = 1;
    finishHoldCounter(lane, Math.round(earned));
  }, [finishHoldCounter]);

  const releaseLane = useCallback((lane: Lane) => {
    const run = runRef.current;
    if (run.lanePresses[lane] > 0) run.lanePresses[lane] -= 1;
    if (run.lanePresses[lane] > 0 || run.over) return;
    if (run.activeHold[lane] < 0 || phaseRef.current !== "playing") return;
    finishHold(run, lane, songTimeAt(window.performance.now()), true);
  }, [finishHold, songTimeAt]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (phaseRef.current !== "playing" || (event.target as Element).closest("button, a")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const lane = Math.max(0, Math.min(3, Math.floor(((event.clientX - rect.left) / rect.width) * 4))) as Lane;
    pointerLanesRef.current.set(event.pointerId, lane);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* kazalec je že sproščen */ }
    const laneEl = laneRefs.current[lane];
    if (laneEl) {
      const laneRect = laneEl.getBoundingClientRect();
      rippleAt(lane, event.clientX - laneRect.left, event.clientY - laneRect.top);
    }
    pressLane(lane, window.performance.now());
  }, [pressLane, rippleAt]);

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const lane = pointerLanesRef.current.get(event.pointerId);
    if (lane === undefined) return;
    event.preventDefault();
    pointerLanesRef.current.delete(event.pointerId);
    releaseLane(lane);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch { /* kazalec je že sproščen */ }
  }, [releaseLane]);

  /* ------------------------------------------------------------------ draw */

  const draw = useCallback((songTime: number, now: number) => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const { width, height, dpr, top, bottom, playHeight, laneWidth, tileWidth, tileHeight } = layout;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const run = runRef.current;
    const painters = paintersRef.current;
    for (let lane = 0; lane < 4; lane += 1) {
      const lit = run.lanePresses[lane] > 0 || run.laneFlash[lane] > now;
      context.fillStyle = lit && painters.flash ? painters.flash : LANE_IDLE[lane % 2];
      context.fillRect(lane * laneWidth, top, laneWidth, playHeight);
    }
    context.strokeStyle = "rgba(246,246,246,.1)";
    context.lineWidth = 1;
    context.beginPath();
    for (let lane = 1; lane < 4; lane += 1) {
      context.moveTo(lane * laneWidth, top);
      context.lineTo(lane * laneWidth, bottom);
    }
    context.stroke();

    const { song, state } = run;
    const notes = song.notes;
    const travel = gameConfig.play.travel;
    const here = positionAt(songTime, song);
    const sprites = painters.sprites;
    const { color: chorusColor, pastel, tile: verseColor } = painters.palette;
    const radius = tileHeight * gameConfig.play.tileRadius;

    context.save();
    context.beginPath();
    context.rect(0, top, width, playHeight);
    context.clip();

    // The pastel print a struck tile leaves behind, so a tap is visible even
    // though the tile itself is gone the instant it is hit.
    context.fillStyle = pastel;
    for (let lane = 0; lane < 4; lane += 1) {
      const until = run.laneHitAt[lane];
      if (until <= now) continue;
      const life = (until - now) / TAP_FLASH_MS;
      const y = run.laneHitY[lane];
      const scale = 0.96;
      const w = tileWidth * scale;
      const h = tileHeight * scale;
      context.globalAlpha = life * 0.75;
      context.beginPath();
      context.roundRect(
        lane * laneWidth + 6 + (tileWidth - w) / 2,
        y - tileHeight + (tileHeight - h) / 2,
        w, h, radius,
      );
      context.fill();
    }
    context.globalAlpha = 1;

    for (let i = run.cursor; i < notes.length; i += 1) {
      if (state[i] === DONE) continue;
      const note = notes[i];
      const lead = positionAt(note.time, song) - here;
      if (lead > travel) break;

      const held = state[i] === HOLDING;
      const dropped = state[i] === RELEASED;
      const color = run.chorusNote[i] ? chorusColor : verseColor;
      const x = note.lane * laneWidth + 6;
      const y = top + (1 - lead / travel) * playHeight;

      // A taller tile must never swallow the next one in its lane.
      let height = tileHeight;
      const next = run.nextInLane[i];
      if (next >= 0) {
        const visualEnd = note.time + note.hold;
        const gap = (
          (positionAt(notes[next].time, song) - positionAt(visualEnd, song))
          / travel
        ) * playHeight;
        if (gap < tileHeight) {
          height = Math.max(1, gap - gameConfig.play.tileMinGap);
        }
      }

      if (note.hold > 0) {
        const tailLead = positionAt(note.time + note.hold, song) - here;
        const tailY = top + (1 - tailLead / travel) * playHeight;
        // Once its head reaches the line, a hold stays attached there while
        // its tail shortens. The full-width outer path is one shape: only its
        // remote top and head bottom are rounded, with no seam in between.
        const shapeTop = tailY - height;
        const shapeBottom = Math.min(y, bottom);
        const shapeHeight = Math.max(1, shapeBottom - shapeTop);
        const fillProgress = held || dropped ? run.holdFill[i] : 0;

        context.save();
        context.globalAlpha = dropped ? 0.25 : 1;
        context.fillStyle = dropped ? "#f6f6f6" : held ? withAlpha(color, 0.45) : color;
        if (!dropped) {
          context.shadowColor = held ? pastel : color;
          context.shadowBlur = 16;
        }
        context.beginPath();
        context.roundRect(x, shapeTop, tileWidth, shapeHeight, radius);
        context.fill();
        context.restore();

        // Clip the pastel fill to that same outer path. Its straight live edge
        // is internal; only the two ends of the complete hold are rounded.
        if (fillProgress > 0) {
          context.save();
          context.beginPath();
          context.roundRect(x, shapeTop, tileWidth, shapeHeight, radius);
          context.clip();
          context.globalAlpha = dropped ? 0.78 : 1;
          context.fillStyle = pastel;
          context.fillRect(
            x,
            shapeBottom - shapeHeight * fillProgress,
            tileWidth,
            shapeHeight * fillProgress,
          );
          context.restore();
        }

        // Keep the original line, dot and HOLD/DRŽI label in the head area.
        if (height > 24 && y - height < bottom) {
          const headBottom = Math.min(y, bottom);
          const headTop = headBottom - height;
          context.save();
          context.globalAlpha = dropped ? 0.42 : 1;
          context.fillStyle = "#050708";
          context.fillRect(x + 9, headTop + height / 2 - 1, tileWidth - 18, 2);
          context.beginPath();
          context.arc(x + tileWidth - 13, headTop + 13, 3, 0, TAU);
          context.fill();
          context.font = "800 9px system-ui";
          context.textAlign = "center";
          context.fillText(held ? "DRŽI" : "HOLD", x + tileWidth / 2, headTop + height / 2 + 3);
          context.restore();
        }
        continue;
      }

      const sprite = sprites[color];
      if (sprite) {
        const padX = sprite.pad;
        const padY = sprite.pad * (height / tileHeight);
        context.drawImage(
          sprite.canvas,
          x - padX,
          y - height - padY,
          tileWidth + padX * 2,
          height + padY * 2,
        );
      }
    }

    context.restore();
  }, []);

  /* ------------------------------------------------------------------- hud */

  const paintHud = useCallback((songTime: number) => {
    const run = runRef.current;
    const cache = hudCacheRef.current;

    // The score is a float while a hold pays out, but only whole points show.
    const score = Math.floor(run.score);
    if (cache.score !== score && scoreElRef.current) {
      cache.score = score;
      scoreElRef.current.textContent = score.toLocaleString("sl-SI");
      // A hold can carry the score past more than one mark in a single frame.
      while (
        run.milestone < gameConfig.milestones.length
        && score >= gameConfig.milestones[run.milestone].score
      ) {
        celebrate(gameConfig.milestones[run.milestone]);
        run.milestone += 1;
      }
    }
    for (let lane = 0; lane < 4; lane += 1) {
      if (run.activeHold[lane] < 0) continue;
      const counter = holdCounterRefs.current[lane];
      if (!counter) continue;
      const value = `+${Math.floor(run.holdEarned[lane])}`;
      if (counter.textContent !== value) counter.textContent = value;
    }
    if (cache.combo !== run.combo) {
      cache.combo = run.combo;
      if (comboElRef.current) comboElRef.current.textContent = String(run.combo);
      if (multElRef.current) multElRef.current.textContent = `×${comboMultiplier(run.combo)}`;
    }
    const spent = run.misses + run.misclicks;
    if (cache.lives !== spent) {
      cache.lives = spent;
      const lives = livesElRef.current;
      lives?.setAttribute(
        "aria-label",
        `Preostala življenja: ${Math.max(0, gameConfig.lives - spent)} od ${gameConfig.lives}`,
      );
      const pips = lives?.children;
      if (pips) {
        for (let i = 0; i < pips.length; i += 1) {
          (pips[i] as HTMLElement).dataset.spent = i < spent ? "1" : "0";
        }
      }
    }

    const playable = run.song.duration - countdownLead;
    const progress = Math.max(0, Math.min(1, (songTime - countdownLead) / playable));
    const rounded = Math.round(progress * 200);
    if (cache.progress !== rounded && progressElRef.current) {
      cache.progress = rounded;
      progressElRef.current.style.transform = `scaleX(${progress})`;
    }

    const count = songTime < countdownLead ? Math.max(1, Math.ceil(countdownLead - songTime)) : 0;
    if (cache.count !== count && countElRef.current) {
      cache.count = count;
      countElRef.current.textContent = count > 0 ? String(count) : "";
      countElRef.current.hidden = count === 0;
    }

  }, [celebrate]);

  /**
   * The lane overlay carries everything CSS can do better than the canvas: the
   * press flash, the glow that breathes under a hold, and the error blinks.
   * Attributes are only written when they actually change.
   */
  const paintLanes = useCallback((now: number, songTime: number) => {
    const run = runRef.current;
    for (let lane = 0; lane < 4; lane += 1) {
      const el = laneRefs.current[lane];
      if (!el) continue;
      const holding = run.activeHold[lane] >= 0;
      const pressed = run.lanePresses[lane] > 0 || run.laneFlash[lane] > now;
      const next = `${holding ? "h" : ""}${pressed ? "p" : ""}`;
      if (laneStateRef.current[lane] === next) continue;
      laneStateRef.current[lane] = next;
      if (holding) el.dataset.holding = "1";
      else el.removeAttribute("data-holding");
      if (pressed) el.dataset.pressed = "1";
      else el.removeAttribute("data-pressed");
    }

    const section = sectionAt(run.song, songTime);
    if (section !== run.section) {
      run.section = section;
      if (stageRef.current) stageRef.current.dataset.section = section;
    }
  }, []);

  /* ------------------------------------------------------------ round flow */

  const stopAudio = useCallback(() => {
    const el = audioElRef.current;
    if (el) el.pause();
    silentStartRef.current = null;
  }, []);

  const finishGame = useCallback(() => {
    if (phaseRef.current === "result") return;
    window.cancelAnimationFrame(frameRef.current);
    const run = runRef.current;
    stopAudio();

    const finalScore = Math.floor(run.score + SCORE_ROUNDING_EPSILON);
    const stored = Number(window.localStorage.getItem(highScoreKey(run.song)) ?? 0);
    const best = Math.max(Number.isFinite(stored) ? Math.floor(stored) : 0, finalScore);
    window.localStorage.setItem(highScoreKey(run.song), String(best));

    setResult({
      score: finalScore,
      perfect: run.perfect,
      good: run.good,
      misses: run.misses,
      misclicks: run.misclicks,
      bestCombo: run.bestCombo,
      best,
      milestones: run.milestone,
      over: run.over,
    });
    setPhase("result");
  }, [stopAudio]);

  useEffect(() => {
    if (phase !== "playing") return;

    const tick = (now: number) => {
      const run = runRef.current;
      const { song, state } = run;
      const notes = song.notes;
      const songTime = songTimeAt(now);
      const here = positionAt(songTime, song);
      // A tab that was in the background can hand back a huge gap; a hold must
      // not be paid for time the player never spent holding it.
      const deltaMs = run.frameAt > 0 ? Math.min(64, now - run.frameAt) : 0;
      run.frameAt = now;

      // Holds pay as they are held, a fragment of a point per frame, and settle
      // up once the tail has crossed the line.
      for (let lane = 0; lane < 4; lane += 1) {
        const held = run.activeHold[lane];
        if (held < 0) continue;
        const note = notes[held];
        const requiredMs = note.hold * 1000;
        const before = run.holdHeldMs[lane];
        const after = Math.min(requiredMs, before + deltaMs);
        if (after > before) {
          const earned = holdPointsPerSecond(note.hold)
            * ((after - before) / 1000)
            * run.holdMultiplier[lane];
          run.holdHeldMs[lane] = after;
          run.holdEarned[lane] += earned;
          run.holdFill[held] = requiredMs > 0 ? after / requiredMs : 1;
          run.score += earned;
        }
        if (positionAt(note.time + note.hold, song) - here <= 0) {
          finishHold(run, lane as Lane, songTime, false);
        }
      }

      for (let i = run.cursor; i < notes.length && !run.over; i += 1) {
        const note = notes[i];
        // A tile nobody touched is the one and only miss.
        if (state[i] === PENDING) {
          if ((songTime - note.time) * 1000 < lateWindowAt(note.time, song)) break;
          state[i] = DONE;
          registerMiss(run, note.lane);
        } else if (state[i] === RELEASED
          && positionAt(note.time + note.hold, song) - here <= 0) {
          // The grey stub of a hold that was let go has finished scrolling.
          state[i] = DONE;
        }
      }
      while (run.cursor < notes.length && state[run.cursor] === DONE) run.cursor += 1;

      draw(songTime, now);
      paintHud(songTime);
      paintLanes(now, songTime);

      if (run.over || songTime >= song.duration - 0.05) {
        finishGame();
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };

    // Time spent paused is nobody's hold: start the frame clock from scratch.
    runRef.current.frameAt = 0;
    frameRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [draw, finishGame, finishHold, paintHud, paintLanes, phase, registerMiss, songTimeAt]);

  const startGame = useCallback(() => {
    const el = audioElRef.current;
    runRef.current = createRun(selectedSong);
    hudCacheRef.current = { score: -1, combo: -1, lives: -1, progress: -1, count: -1 };
    for (const animation of milestoneAnimsRef.current) animation.cancel();
    milestoneAnimsRef.current = [];
    if (milestoneElRef.current) milestoneElRef.current.hidden = true;
    for (let lane = 0; lane < 4; lane += 1) {
      holdCounterAnimationsRef.current[lane]?.cancel();
      holdCounterAnimationsRef.current[lane] = null;
      holdCounterRefs.current[lane]?.remove();
      holdCounterRefs.current[lane] = null;
    }
    clockRef.current = { media: -1, anchor: 0, at: 0 };
    pointerLanesRef.current.clear();
    laneStateRef.current = ["", "", "", ""];
    silentStartRef.current = null;
    setAudioError("");
    setShareStatus("");
    setSessionId(null);
    setPhase("loading");

    void fetch("/api/leaderboard/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: selectedSong.id }),
    })
      .then((response) => (response.ok ? (response.json() as Promise<{ sessionId: string }>) : null))
      .then((data) => setSessionId(data?.sessionId ?? null))
      .catch(() => setSessionId(null));

    if (!el) return;

    // Route the element through Web Audio once, so the mix keeps playing with
    // the ringer switch off and the mute button can fade instead of cut.
    if (!audioCtxRef.current && typeof window.AudioContext === "function") {
      try {
        const context = new window.AudioContext({ latencyHint: "interactive" });
        const gain = context.createGain();
        gain.gain.value = muted ? 0 : 0.85;
        context.createMediaElementSource(el).connect(gain);
        gain.connect(context.destination);
        audioCtxRef.current = context;
        gainRef.current = gain;
      } catch {
        gainRef.current = null;
      }
    }
    void audioCtxRef.current?.resume();

    if (loadedSongRef.current !== selectedSong.file) {
      loadedSongRef.current = selectedSong.file;
      el.src = selectedSong.file;
      el.load();
    } else {
      try { el.currentTime = 0; } catch { /* še ni iskalnega položaja */ }
    }
    if (!gainRef.current) el.volume = muted ? 0 : 1;

    void el.play().catch(() => {
      // No audio permission or no decoder — keep the round playable in silence.
      silentStartRef.current = window.performance.now();
      setAudioError("Zvoka ni bilo mogoče predvajati. Igra teče naprej brez glasbe.");
      setPhase("playing");
    });
  }, [muted, selectedSong]);

  const onAudioPlaying = useCallback(() => {
    if (phaseRef.current === "loading") {
      clockRef.current = { media: -1, anchor: 0, at: 0 };
      setPhase("playing");
    }
  }, []);

  const onAudioError = useCallback(() => {
    if (phaseRef.current !== "loading") return;
    loadedSongRef.current = "";
    silentStartRef.current = window.performance.now();
    setAudioError("Zvoka ni bilo mogoče naložiti. Igra teče naprej brez glasbe.");
    setPhase("playing");
  }, []);

  const pause = useCallback((reason: string) => {
    if (phaseRef.current !== "playing") return;
    setPauseReason(reason);
    audioElRef.current?.pause();
    // The silent fallback clock stores a start stamp; flipping it against the
    // current stamp parks the elapsed time and unparks it on resume.
    if (silentStartRef.current !== null) {
      silentStartRef.current = window.performance.now() - silentStartRef.current;
    }
    setPhase("paused");
  }, []);

  const resume = useCallback(() => {
    clockRef.current = { media: -1, anchor: 0, at: 0 };
    // The silent fallback clock stores a start stamp; flipping it against the
    // current stamp parks the elapsed time and unparks it on resume.
    if (silentStartRef.current !== null) {
      silentStartRef.current = window.performance.now() - silentStartRef.current;
    }
    void audioCtxRef.current?.resume();
    void audioElRef.current?.play();
    setPhase("playing");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isTypingTarget(event.target)) return;
      const lane = KEY_LANES[event.key.toLowerCase()];
      if (lane !== undefined && phaseRef.current === "playing") {
        event.preventDefault();
        const laneEl = laneRefs.current[lane];
        // No touch point on a keyboard, so the ripple starts at the hit line.
        if (laneEl) rippleAt(lane, laneEl.clientWidth / 2, laneEl.clientHeight - 40);
        pressLane(lane, window.performance.now());
      }
      if (event.key === "Escape") pause("Igra je ustavljena.");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const lane = KEY_LANES[event.key.toLowerCase()];
      if (lane !== undefined) releaseLane(lane);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pause, pressLane, releaseLane, rippleAt]);

  useEffect(() => {
    const onHidden = () => {
      if (document.hidden) pause("Igra je bila prekinjena. Nadaljuj, ko si pripravljen/-a.");
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [pause]);

  const chooseSong = useCallback((song: GameSong) => {
    setSelectedSong(song);
    setAudioError("");
  }, []);

  const showSongSelection = useCallback((song?: GameSong) => {
    window.cancelAnimationFrame(frameRef.current);
    stopAudio();
    if (song) setSelectedSong(song);
    setAudioError("");
    setShareStatus("");
    setSessionId(null);
    setPhase("intro");
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [stopAudio]);

  /* ----------------------------------------------------------------- share */

  const makeShareCard = useCallback(async () => {
    const card = document.createElement("canvas");
    card.width = 1080;
    card.height = 1350;
    const context = card.getContext("2d");
    if (!context) throw new Error("canvas");
    const performance = getPerformance(result.score, selectedSong.maxScore);

    context.fillStyle = gameConfig.colors.night;
    context.fillRect(0, 0, card.width, card.height);
    const gradient = context.createRadialGradient(800, 340, 10, 800, 340, 800);
    gradient.addColorStop(0, "rgba(224,81,16,.42)");
    gradient.addColorStop(0.55, "rgba(233,159,214,.12)");
    gradient.addColorStop(1, "rgba(5,7,8,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, card.width, card.height);
    context.strokeStyle = "rgba(255,216,0,.22)";
    context.lineWidth = 3;
    for (let y = 100; y < 1250; y += 105) {
      context.beginPath();
      context.moveTo(0, y);
      context.bezierCurveTo(250, y - 80, 620, y + 90, 1080, y - 20);
      context.stroke();
    }
    context.fillStyle = gameConfig.colors.yellow;
    context.font = "700 34px system-ui";
    context.fillText("GLASBENI ATLAS 2026", 72, 96);
    context.fillStyle = gameConfig.colors.white;
    context.font = "900 118px Arial Narrow, sans-serif";
    context.fillText("UJEMI RITEM", 72, 270);
    context.fillStyle = selectedSong.baseColor;
    context.font = "900 240px Arial Narrow, sans-serif";
    context.fillText(result.score.toLocaleString("sl-SI"), 60, 605);
    context.fillStyle = gameConfig.colors.white;
    context.font = "700 32px system-ui";
    context.fillText(`OD ${selectedSong.maxScore.toLocaleString("sl-SI")} MOŽNIH TOČK`, 74, 665);
    context.fillStyle = lighten(selectedSong.baseColor, 0.4);
    context.font = "900 70px Arial Narrow, sans-serif";
    context.fillText(performance.title.toUpperCase(), 72, 800);
    context.fillStyle = gameConfig.colors.white;
    context.font = "600 34px system-ui";
    context.fillText(`${selectedSong.artist.toUpperCase()}  ·  ${selectedSong.title.toUpperCase()}`, 72, 880);
    context.fillText(`${gameConfig.event.date}  ·  IVANČNA GORICA`, 72, 1095);
    context.fillStyle = selectedSong.baseColor;
    context.fillRect(72, 1145, 936, 4);
    context.font = "600 29px system-ui";
    context.fillText(gameConfig.siteUrl, 72, 1218);
    context.fillStyle = gameConfig.colors.white;
    context.font = "500 25px system-ui";
    context.fillText("Najdi svoj ritem. Naslednja postaja: Atlas.", 72, 1280);

    return new Promise<Blob>((resolve, reject) => {
      card.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/png");
    });
  }, [result.score, selectedSong]);

  const shareResult = useCallback(async () => {
    setShareStatus("");
    const performance = getPerformance(result.score, selectedSong.maxScore);
    const text = gameConfig.shareText(result.score, performance.title);
    try {
      const blob = await makeShareCard();
      const file = new File([blob], "ujemi-ritem-rezultat.png", { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Ujemi ritem", text, url: gameConfig.siteUrl, files: [file] });
        setShareStatus("Rezultat je pripravljen za deljenje.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      await navigator.clipboard?.writeText(`${text} ${gameConfig.siteUrl}`);
      setShareStatus("Kartica je prenesena, besedilo pa kopirano.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("Deljenje ni uspelo. Poskusi znova.");
    }
  }, [makeShareCard, result.score, selectedSong]);

  /* ---------------------------------------------------------------- render */

  const performance = getPerformance(result.score, selectedSong.maxScore);
  const accuracy = selectedSong.maxScore > 0 ? Math.round((result.score / selectedSong.maxScore) * 100) : 0;
  const hits = result.perfect + result.good;
  const attempts = hits + result.misses + result.misclicks;
  const precision = attempts > 0 ? Math.round((hits / attempts) * 100) : 0;
  const recommendedSongs = gameConfig.songs.filter(
    (song) => song.id !== selectedSong.id,
  );

  return (
    <main className={styles.shell} style={{ "--band-color": selectedSong.baseColor } as React.CSSProperties}>
      <audio
        ref={audioElRef}
        preload="none"
        playsInline
        onPlaying={onAudioPlaying}
        onError={onAudioError}
        onEnded={finishGame}
      />

      {phase === "intro" && (
        <section className={`${styles.screen} ${styles.intro}`}>
          <div className={styles.topbar}>
            <Link href="/" className={styles.back} aria-label="Nazaj na Glasbeni Atlas">←</Link>
            <Image src="/media/logo-glasbeni-atlas.svg" width={718} height={577} alt="Glasbeni Atlas" className={styles.logo} priority />
            <button className={styles.iconButton} type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Vklopi zvok" : "Utišaj zvok"}>{muted ? "○" : "◉"}</button>
          </div>
          <div className={styles.introContent}>
            <p className={styles.eyebrow}>Ritmična igra · cel komad</p>
            <h1 className={styles.title}>Ujemi <span>ritem</span></h1>
            <p className={styles.lead}>{gameConfig.supportingText}</p>
            <div className={styles.instruction}>
              <span className={styles.tapIcon}>↓</span>
              <span>Tapni ploščico v njeni stezi, takoj ko se prikaže. Nižja ko je, več točk. Dolgo ploščico drži do konca.</span>
            </div>
            <p className={styles.rules}>
              Imaš {gameConfig.lives} življenja. Zgrešena ploščica in tap v prazno stezo stanejo
              eno. Proti koncu komada ploščice padajo hitreje, okno za Perfect se zoži, od zadnjega
              refrena naprej pa vse točke veljajo
              ×{(1 + gameConfig.scoring.finaleBonus).toLocaleString("sl-SI")}.
            </p>
            <div className={styles.competitionCallout}>
              <span>TOP 3</span>
              <strong>{gameConfig.competition.headline}</strong>
              <small>{gameConfig.competition.note}</small>
            </div>
            <fieldset className={styles.songPicker}>
              <legend>Izberi komad</legend>
              <div className={styles.songGrid}>
                {gameConfig.songs.map((song) => (
                  <button
                    type="button"
                    key={song.id}
                    aria-pressed={selectedSong.id === song.id}
                    className={styles.songButton}
                    style={{ "--band-color": song.baseColor } as React.CSSProperties}
                    onClick={() => chooseSong(song)}
                  >
                    <strong>{song.artist}</strong>
                    <span>{song.title}</span>
                    <em>{songLength(song)}</em>
                  </button>
                ))}
              </div>
            </fieldset>
            {audioError && <p className={styles.error} role="alert">{audioError}</p>}
            <div className={styles.eventStrip}><span>Datum</span><strong>{gameConfig.event.date}</strong><span>Cilj</span><strong>Ivančna Gorica</strong></div>
            <button className={styles.primary} type="button" onClick={startGame}>Začni · {selectedSong.artist} <span aria-hidden>↗</span></button>
          </div>
        </section>
      )}

      {phase === "loading" && (
        <section className={`${styles.screen} ${styles.centerScreen}`} aria-live="polite">
          <div className={styles.loader} aria-hidden />
          <p className={styles.eyebrow}>Nalagam beat in rišem pot …</p>
          <p className={styles.nowPlaying}>{selectedSong.artist} · {selectedSong.title}</p>
        </section>
      )}

      {(phase === "playing" || phase === "paused") && (
        <section
          ref={stageRef}
          className={styles.game}
          data-section="intro"
          style={{ "--chorus-pulse": `${chorusPulseSeconds(selectedSong)}s` } as React.CSSProperties}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          aria-label="Igralno polje. Tapni ploščico v njeni stezi, takoj ko se prikaže."
        >
          <div className={styles.backdrop} aria-hidden="true" />
          <div className={styles.gameHud} ref={hudRef}>
            <div className={styles.hudLeft}>
              <div
                className={styles.lives}
                ref={livesElRef}
                aria-label={`Preostala življenja: ${gameConfig.lives} od ${gameConfig.lives}`}
              >
                {Array.from({ length: gameConfig.lives }, (_, index) => (
                  <i key={index} data-spent="0" aria-hidden="true" />
                ))}
              </div>
              <div className={styles.hudValue}><span>Combo</span><strong><i ref={comboElRef}>0</i><small ref={multElRef}>×1</small></strong></div>
            </div>
            <div className={`${styles.hudValue} ${styles.hudScore}`}>
              <span>Točke</span><strong ref={scoreElRef}>0</strong>
            </div>
            <div className={styles.hudActions}>
              <button className={styles.iconButton} type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Vklopi zvok" : "Utišaj zvok"}>
                <SpeakerIcon muted={muted} />
              </button>
              <button className={styles.iconButton} type="button" onClick={() => pause("Igra je ustavljena.")} aria-label="Ustavi igro">Ⅱ</button>
              <Link
                href="/"
                className={`${styles.iconButton} ${styles.exitButton}`}
                aria-label="Zapri igro in se vrni na Glasbeni Atlas"
              >
                X
              </Link>
            </div>
          </div>

          <div className={styles.lanes} aria-hidden="true">
            {[0, 1, 2, 3].map((lane) => (
              <div
                key={lane}
                className={styles.lane}
                ref={(el) => { laneRefs.current[lane] = el; }}
              />
            ))}
          </div>

          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          <div className={styles.floaters} ref={floatersRef} aria-hidden="true" />
          <div className={styles.probes} ref={probesRef} aria-hidden="true">
            {TOKENS.map((token) => <i key={token} data-token={token} />)}
          </div>
          <p ref={feedbackElRef} className={styles.feedback} data-grade="perfect" aria-hidden="true" />
          <div ref={milestoneElRef} className={styles.milestone} hidden aria-hidden="true">
            <span className={styles.milestoneRing} ref={milestoneRingRef} />
            <strong className={styles.milestoneLabel} ref={milestoneLabelRef} />
            <span className={styles.milestoneNote} ref={milestoneNoteRef} />
          </div>
          <div ref={countElRef} className={styles.countdown} aria-hidden="true" />
          <div className={styles.progress}><span ref={progressElRef} /></div>

          {phase === "paused" && (
            <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <div className={styles.dialog}>
                <p className={styles.coordinate}>45.9372° N · 14.8064° E</p>
                <h2 id="pause-title">Postanek</h2>
                <p>{pauseReason}</p>
                <button className={styles.primary} type="button" onClick={resume}>Nadaljuj</button>
              </div>
            </div>
          )}
        </section>
      )}

      {phase === "result" && (
        <section className={`${styles.screen} ${styles.result}`}>
          <div className={styles.resultInner}>
            <p className={styles.eyebrow}>{result.over ? "Konec igre" : "Prispel/-a si na cilj"}</p>
            <h1>{result.over ? "Game over" : "Ujemi ritem"}</h1>
            <p className={styles.resultScore}>{result.score.toLocaleString("sl-SI")}</p>
            <p className={styles.resultScoreLabel}>
              od {selectedSong.maxScore.toLocaleString("sl-SI")} možnih točk · {accuracy} %
            </p>
            <p className={styles.resultTitle}>{performance.title}</p>
            <p className={styles.playedSong}>{selectedSong.artist} · {selectedSong.title}</p>
            <p className={styles.resultMessage}>
              {result.over
                ? `Porabil/-a si vsa ${gameConfig.lives} življenja. Naslednji poskus je lahko cel komad.`
                : "Ritem imaš. Zdaj potrebuješ samo še vstopnico."}
            </p>
            {result.milestones > 0 && (
              <ul className={styles.milestoneBadges}>
                {gameConfig.milestones.slice(0, result.milestones).map((milestone) => (
                  <li key={milestone.score}>
                    <strong>{milestone.label}</strong>
                    <span>{milestone.note}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className={styles.breakdown}>
              <div><dt>Zadetki</dt><dd>{hits}</dd></div>
              <div><dt>Zgrešeno</dt><dd>{result.misses}</dd></div>
              <div><dt>Napačni kliki</dt><dd>{result.misclicks}</dd></div>
              <div><dt>Najboljši combo</dt><dd>{result.bestCombo}</dd></div>
              <div><dt>Natančnost</dt><dd>{precision} %</dd></div>
            </dl>
            <div className={styles.record}><span>Osebni rekord</span><strong>{result.best.toLocaleString("sl-SI")}</strong></div>
            <div className={styles.actions}>
              <button className={styles.primary} type="button" onClick={startGame}>Igraj znova</button>
              <button className={styles.secondary} type="button" onClick={() => showSongSelection()}>Izberi drug komad</button>
              <button className={styles.secondary} type="button" onClick={shareResult}>Deli rezultat</button>
              <Link className={styles.secondary} href="/">Nazaj na spletno stran</Link>
              <a className={styles.ticket} href={gameConfig.ticketUrl} target="_blank" rel="noopener noreferrer">{gameConfig.ticketLabel} ↗</a>
            </div>
            <p className={styles.shareStatus} role="status">{shareStatus}</p>
            <div className={styles.recommendations}>
              <p>Naslednji izziv</p>
              <div className={styles.recommendationGrid}>
                {recommendedSongs.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    className={styles.recommendation}
                    style={{ "--recommendation": song.baseColor } as React.CSSProperties}
                    onClick={() => showSongSelection(song)}
                  >
                    <span>Poskusi še</span>
                    <strong>{song.artist}</strong>
                    <small>{song.title}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.eventStrip}><span>Datum</span><strong>{gameConfig.event.date}</strong><span>Lokacija</span><strong>{gameConfig.event.location}</strong></div>
            <Leaderboard
              song={selectedSong}
              score={result.score}
              sessionId={sessionId}
              breakdown={{ perfect: result.perfect, good: result.good, misses: result.misses }}
            />
          </div>
        </section>
      )}

      <div className={styles.landscape}><div><strong>Obrni telefon</strong><p>Igra najbolje teče v pokončnem položaju.</p></div></div>
      <DesktopGameGate />
    </main>
  );
}
