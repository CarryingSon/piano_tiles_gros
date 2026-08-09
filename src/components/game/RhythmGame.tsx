"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  comboMultiplier,
  countdownLead,
  gameConfig,
  getPerformance,
  songLength,
  type GameSong,
  type Lane,
} from "@/data/game";
import Leaderboard from "./Leaderboard";
import DesktopGameGate from "./DesktopGameGate";
import styles from "./RhythmGame.module.css";

type Phase = "intro" | "loading" | "playing" | "paused" | "result";
type Grade = "perfect" | "good" | "miss" | "hold";

const PENDING = 0;
const HOLDING = 1;
const DONE = 2;

const KEY_LANES: Record<string, Lane> = { d: 0, f: 1, j: 2, k: 3 };
const LANE_COLORS = ["#ffd800", "#e99fd6", "#ffd800", "#e99fd6"] as const;
const LANE_IDLE = ["rgba(255,255,255,.02)", "rgba(255,255,255,.05)"] as const;
const TAU = Math.PI * 2;

const highScoreKey = (song: GameSong) => `glasbeni-atlas-ritem-high-score-${song.id}`;

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
type Painters = { sprites: Record<string, Sprite>; flash: CanvasGradient | null };

/** Per-round mutable state. Lives in a ref so the frame loop never re-renders. */
type Run = {
  song: GameSong;
  state: Uint8Array;
  cursor: number;
  score: number;
  combo: number;
  bestCombo: number;
  perfect: number;
  good: number;
  misses: number;
  over: boolean;
  activeHold: Int32Array;
  lanePresses: Int32Array;
  laneFlash: Float64Array;
  laneTapAt: Float64Array;
};

function createRun(song: GameSong): Run {
  return {
    song,
    state: new Uint8Array(song.notes.length),
    cursor: 0,
    score: 0,
    combo: 0,
    bestCombo: 0,
    perfect: 0,
    good: 0,
    misses: 0,
    over: false,
    activeHold: Int32Array.from([-1, -1, -1, -1]),
    lanePresses: new Int32Array(4),
    laneFlash: new Float64Array(4),
    laneTapAt: Float64Array.from([-1, -1, -1, -1]),
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
    score: 0, perfect: 0, good: 0, misses: 0, bestCombo: 0, best: 0, over: false,
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
  const paintersRef = useRef<Painters>({ sprites: {}, flash: null });
  const pointerLanesRef = useRef(new Map<number, Lane>());

  const scoreElRef = useRef<HTMLElement>(null);
  const comboElRef = useRef<HTMLElement>(null);
  const multElRef = useRef<HTMLElement>(null);
  const livesElRef = useRef<HTMLDivElement>(null);
  const progressElRef = useRef<HTMLSpanElement>(null);
  const feedbackElRef = useRef<HTMLParagraphElement>(null);
  const feedbackAnimRef = useRef<Animation | null>(null);
  const countElRef = useRef<HTMLDivElement>(null);
  const hudCacheRef = useRef({ score: -1, combo: -1, misses: -1, progress: -1, count: -1 });

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

  const awardHit = useCallback((run: Run, perfect: boolean) => {
    run.combo += 1;
    if (run.combo > run.bestCombo) run.bestCombo = run.combo;
    run.score += (perfect ? gameConfig.scoring.perfect : gameConfig.scoring.good) * comboMultiplier(run.combo);
    if (perfect) run.perfect += 1;
    else run.good += 1;
    flashFeedback(perfect ? "Perfect" : "Good", perfect ? "perfect" : "good");
    if (perfect && "vibrate" in navigator) navigator.vibrate(10);
  }, [flashFeedback]);

  const registerMiss = useCallback((run: Run) => {
    if (run.over) return;
    run.combo = 0;
    run.misses += 1;
    if (run.misses >= gameConfig.lives) {
      run.over = true;
      flashFeedback("Konec", "miss");
      return;
    }
    flashFeedback("Miss", "miss");
  }, [flashFeedback]);

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
    const tileHeight = Math.max(48, Math.min(96, playHeight * 0.14));

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    layoutRef.current = { width, height, dpr, top, bottom, playHeight, laneWidth, tileWidth, tileHeight };

    // Glow is baked into a sprite once per size — drawing it per tile per frame
    // is what made the old board stutter on phones.
    const pad = 16;
    const sprites: Record<string, Sprite> = {};
    for (const color of new Set(LANE_COLORS)) {
      const sprite = document.createElement("canvas");
      const w = tileWidth + pad * 2;
      const h = tileHeight + pad * 2;
      sprite.width = Math.round(w * dpr);
      sprite.height = Math.round(h * dpr);
      const g = sprite.getContext("2d");
      if (!g) continue;
      g.scale(dpr, dpr);
      g.shadowColor = color;
      g.shadowBlur = 14;
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(pad, pad, tileWidth, tileHeight, 8);
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
      flash.addColorStop(0, "rgba(255,216,0,0)");
      flash.addColorStop(1, "rgba(255,216,0,.16)");
    }
    paintersRef.current = { sprites, flash };
  }, []);

  useEffect(() => {
    if (phase !== "playing" && phase !== "paused") return;
    measure();
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, [measure, phase]);

  /* ------------------------------------------------------- scroll position */

  // Tiles accelerate towards the end of the track, so screen position comes
  // from the integral of the speed ramp rather than from plain elapsed time.
  const positionAt = useCallback((time: number, song: GameSong) => {
    const k = gameConfig.play.endSpeed - 1;
    return time + (k * time * time) / (2 * song.duration);
  }, []);

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
    const expire = layout ? -(layout.tileHeight / layout.playHeight) * travel : -0.25;

    let target = -1;
    for (let i = run.cursor; i < notes.length; i += 1) {
      const lead = positionAt(notes[i].time, song) - here;
      if (lead > travel) break;
      if (state[i] !== PENDING || notes[i].lane !== lane || lead < expire) continue;
      target = i;
      break;
    }

    if (target < 0) {
      registerMiss(run);
      return;
    }

    const lead = positionAt(notes[target].time, song) - here;
    const perfect = lead / travel <= gameConfig.play.perfectZone;
    if (notes[target].hold > 0) {
      state[target] = HOLDING;
      run.activeHold[lane] = target;
      run.laneFlash[lane] = now + 400;
      flashFeedback("Drži", "hold");
      if ("vibrate" in navigator) navigator.vibrate(8);
      return;
    }
    state[target] = DONE;
    awardHit(run, perfect);
  }, [awardHit, flashFeedback, positionAt, registerMiss, songTimeAt]);

  const releaseLane = useCallback((lane: Lane) => {
    const run = runRef.current;
    if (run.lanePresses[lane] > 0) run.lanePresses[lane] -= 1;
    if (run.lanePresses[lane] > 0 || run.over) return;

    const held = run.activeHold[lane];
    if (held < 0) return;
    // Letting go before the tail clears the board loses the note.
    run.activeHold[lane] = -1;
    run.state[held] = DONE;
    if (phaseRef.current === "playing") registerMiss(run);
  }, [registerMiss]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (phaseRef.current !== "playing" || (event.target as Element).closest("button, a")) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const lane = Math.max(0, Math.min(3, Math.floor(((event.clientX - rect.left) / rect.width) * 4))) as Lane;
    pointerLanesRef.current.set(event.pointerId, lane);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* kazalec je že sproščen */ }
    pressLane(lane, window.performance.now());
  }, [pressLane]);

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

    context.save();
    context.beginPath();
    context.rect(0, top, width, playHeight);
    context.clip();

    for (let i = run.cursor; i < notes.length; i += 1) {
      if (state[i] === DONE) continue;
      const note = notes[i];
      const lead = positionAt(note.time, song) - here;
      if (lead > travel) break;

      const accent = LANE_COLORS[note.lane];
      const x = note.lane * laneWidth + 6;
      const y = top + (1 - lead / travel) * playHeight;

      if (note.hold > 0) {
        const tailLead = positionAt(note.time + note.hold, song) - here;
        const tailY = top + (1 - Math.min(tailLead, travel) / travel) * playHeight;
        context.fillStyle = state[i] === HOLDING ? accent : `${accent}99`;
        context.beginPath();
        context.roundRect(x + tileWidth * 0.3, tailY - tileHeight / 2, tileWidth * 0.4, Math.max(0, y - tailY), 10);
        context.fill();
      }

      const sprite = sprites[accent];
      if (sprite) {
        context.drawImage(sprite.canvas, x - sprite.pad, y - tileHeight - sprite.pad, sprite.width, sprite.height);
      }
      if (note.hold > 0) {
        context.fillStyle = "#050708";
        context.font = "800 9px system-ui";
        context.textAlign = "center";
        context.fillText(state[i] === HOLDING ? "DRŽI" : "HOLD", x + tileWidth / 2, y - tileHeight / 2 + 3);
      }
    }

    context.restore();
  }, [positionAt]);

  /* ------------------------------------------------------------------- hud */

  const paintHud = useCallback((songTime: number) => {
    const run = runRef.current;
    const cache = hudCacheRef.current;

    if (cache.score !== run.score && scoreElRef.current) {
      cache.score = run.score;
      scoreElRef.current.textContent = run.score.toLocaleString("sl-SI");
    }
    if (cache.combo !== run.combo) {
      cache.combo = run.combo;
      if (comboElRef.current) comboElRef.current.textContent = String(run.combo);
      if (multElRef.current) multElRef.current.textContent = `×${comboMultiplier(run.combo)}`;
    }
    if (cache.misses !== run.misses) {
      cache.misses = run.misses;
      const pips = livesElRef.current?.children;
      if (pips) {
        for (let i = 0; i < pips.length; i += 1) {
          (pips[i] as HTMLElement).dataset.spent = i < run.misses ? "1" : "0";
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

    const stored = Number(window.localStorage.getItem(highScoreKey(run.song)) ?? 0);
    const best = Math.max(Number.isFinite(stored) ? stored : 0, run.score);
    window.localStorage.setItem(highScoreKey(run.song), String(best));

    setResult({
      score: run.score,
      perfect: run.perfect,
      good: run.good,
      misses: run.misses,
      bestCombo: run.bestCombo,
      best,
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
      const layout = layoutRef.current;
      const travel = gameConfig.play.travel;
      const expire = layout ? -(layout.tileHeight / layout.playHeight) * travel : -0.25;

      // Holds pay out once their tail has cleared the board.
      for (let lane = 0; lane < 4; lane += 1) {
        const held = run.activeHold[lane];
        if (held < 0) continue;
        if (positionAt(notes[held].time + notes[held].hold, song) - here <= 0) {
          run.activeHold[lane] = -1;
          state[held] = DONE;
          awardHit(run, true);
        }
      }

      for (let i = run.cursor; i < notes.length && !run.over; i += 1) {
        if (positionAt(notes[i].time, song) - here > expire) break;
        if (state[i] === PENDING) {
          state[i] = DONE;
          registerMiss(run);
        }
      }
      while (run.cursor < notes.length && state[run.cursor] === DONE) run.cursor += 1;

      draw(songTime, now);
      paintHud(songTime);

      if (run.over || songTime >= song.duration - 0.05) {
        finishGame();
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };

    frameRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [awardHit, draw, finishGame, paintHud, phase, positionAt, registerMiss, songTimeAt]);

  const startGame = useCallback(() => {
    const el = audioElRef.current;
    runRef.current = createRun(selectedSong);
    hudCacheRef.current = { score: -1, combo: -1, misses: -1, progress: -1, count: -1 };
    clockRef.current = { media: -1, anchor: 0, at: 0 };
    pointerLanesRef.current.clear();
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
      if (event.repeat) return;
      const lane = KEY_LANES[event.key.toLowerCase()];
      if (lane !== undefined) {
        event.preventDefault();
        pressLane(lane, window.performance.now());
      }
      if (event.key === "Escape") pause("Igra je ustavljena.");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const lane = KEY_LANES[event.key.toLowerCase()];
      if (lane !== undefined) releaseLane(lane);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [pause, pressLane, releaseLane]);

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
    context.fillStyle = gameConfig.colors.yellow;
    context.font = "900 240px Arial Narrow, sans-serif";
    context.fillText(result.score.toLocaleString("sl-SI"), 60, 605);
    context.fillStyle = gameConfig.colors.white;
    context.font = "700 32px system-ui";
    context.fillText(`OD ${selectedSong.maxScore.toLocaleString("sl-SI")} MOŽNIH TOČK`, 74, 665);
    context.fillStyle = gameConfig.colors.pink;
    context.font = "900 70px Arial Narrow, sans-serif";
    context.fillText(performance.title.toUpperCase(), 72, 800);
    context.fillStyle = gameConfig.colors.white;
    context.font = "600 34px system-ui";
    context.fillText(`${selectedSong.artist.toUpperCase()}  ·  ${selectedSong.title.toUpperCase()}`, 72, 880);
    context.fillText(`${gameConfig.event.date}  ·  IVANČNA GORICA`, 72, 1095);
    context.fillStyle = gameConfig.colors.yellow;
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

  return (
    <main className={styles.shell}>
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
              {gameConfig.lives} zgrešenih ploščic in igre je konec. Proti koncu komada ploščice padajo hitreje.
            </p>
            <div className={styles.competitionCallout}>
              <span>TOP 3</span>
              <strong>{gameConfig.competition.discountPercent} % cenejša vstopnica</strong>
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
                    style={{ "--song-accent": song.accent } as React.CSSProperties}
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
            <button className={styles.primary} type="button" onClick={startGame}>Začni · {selectedSong.artist} <span aria-hidden>↗</span></button>
            <div className={styles.eventStrip}><span>Datum</span><strong>{gameConfig.event.date}</strong><span>Cilj</span><strong>Ivančna Gorica</strong></div>
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
          onPointerDown={onPointerDown}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          aria-label="Igralno polje. Tapni ploščico v njeni stezi, takoj ko se prikaže."
        >
          <div className={styles.gameHud} ref={hudRef}>
            <div className={styles.hudValue}><span>Točke</span><strong ref={scoreElRef}>0</strong></div>
            <div className={styles.hudValue}><span>Combo</span><strong><i ref={comboElRef}>0</i><small ref={multElRef}>×1</small></strong></div>
            <div className={styles.hudRight}>
              <div className={styles.lives} ref={livesElRef} aria-label={`Na voljo ${gameConfig.lives} zgrešenih`}>
                {Array.from({ length: gameConfig.lives }, (_, index) => <i key={index} data-spent="0" />)}
              </div>
              <div className={styles.hudActions}>
                <button className={styles.iconButton} type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Vklopi zvok" : "Utišaj zvok"}>{muted ? "○" : "◉"}</button>
                <button className={styles.iconButton} type="button" onClick={() => pause("Igra je ustavljena.")} aria-label="Ustavi igro">Ⅱ</button>
              </div>
            </div>
          </div>

          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          <p ref={feedbackElRef} className={styles.feedback} data-grade="perfect" aria-hidden="true" />
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
                ? `Zgrešil/-a si ${gameConfig.lives} ploščic. Naslednji poskus je lahko cel komad.`
                : "Ritem imaš. Zdaj potrebuješ samo še vstopnico."}
            </p>
            <dl className={styles.breakdown}>
              <div><dt>Perfect</dt><dd>{result.perfect}</dd></div>
              <div><dt>Good</dt><dd>{result.good}</dd></div>
              <div><dt>Zgrešeno</dt><dd>{result.misses}</dd></div>
              <div><dt>Najboljši combo</dt><dd>{result.bestCombo}</dd></div>
            </dl>
            <div className={styles.record}><span>Osebni rekord</span><strong>{result.best.toLocaleString("sl-SI")}</strong></div>
            <div className={styles.actions}>
              <button className={styles.primary} type="button" onClick={startGame}>Igraj znova</button>
              <button className={styles.secondary} type="button" onClick={shareResult}>Deli rezultat</button>
              <a className={styles.ticket} href={gameConfig.ticketUrl} target="_blank" rel="noopener noreferrer">{gameConfig.ticketLabel} ↗</a>
            </div>
            <p className={styles.shareStatus} role="status">{shareStatus}</p>
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
