"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { gameConfig, getPerformance, type GameSong, type Lane } from "@/data/game";
import Leaderboard from "./Leaderboard";
import DesktopGameGate from "./DesktopGameGate";
import styles from "./RhythmGame.module.css";

type Phase = "intro" | "loading" | "countdown" | "playing" | "paused" | "result";
type Feedback = { id: number; label: "Perfect" | "Good" | "Miss" | "Drži" } | null;
type ActiveHold = { noteIndex: number; isPerfect: boolean };

type AudioSession = {
  context: AudioContext;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode;
  startAt: number;
};

const highScoreKey = (song: GameSong) => `glasbeni-atlas-ritem-high-score-${song.id}`;

export default function RhythmGame() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [selectedSong, setSelectedSong] = useState<GameSong>(gameConfig.songs[0]);
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [progress, setProgress] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [muted, setMuted] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [audioError, setAudioError] = useState("");
  const [pauseReason, setPauseReason] = useState("Igra je ustavljena.");
  const [shareStatus, setShareStatus] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState({ perfect: 0, good: 0, misses: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>(phase);
  const audioRef = useRef<AudioSession | null>(null);
  const frameRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const judgedRef = useRef(new Set<number>());
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const feedbackIdRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const statsRef = useRef({ perfect: 0, good: 0, misses: 0 });
  const activeHoldsRef = useRef(new Map<string, ActiveHold>());
  const pressedLanesRef = useRef(new Map<string, Lane>());
  const lanePulseUntilRef = useRef([0, 0, 0, 0]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(highScoreKey(gameConfig.songs[0])) ?? 0);
    const scoreFrame = window.requestAnimationFrame(() => {
      setHighScore(Number.isFinite(stored) ? stored : 0);
    });
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.cancelAnimationFrame(frameRef.current);
      window.cancelAnimationFrame(scoreFrame);
      timersRef.current.forEach(window.clearTimeout);
      const audio = audioRef.current;
      if (audio) {
        try { audio.source?.stop(); } catch { /* vir je lahko že končan */ }
        void audio.context.close();
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.gain.gain.value = muted ? 0 : 0.78;
    }
  }, [muted]);

  const showFeedback = useCallback((label: "Perfect" | "Good" | "Miss" | "Drži") => {
    feedbackIdRef.current += 1;
    setFeedback({ id: feedbackIdRef.current, label });
  }, []);

  const resetRound = useCallback(() => {
    judgedRef.current = new Set();
    scoreRef.current = 0;
    comboRef.current = 0;
    setScore(0);
    setCombo(0);
    setProgress(0);
    setFeedback(null);
    setShareStatus("");
    setSessionId(null);
    statsRef.current = { perfect: 0, good: 0, misses: 0 };
    activeHoldsRef.current.clear();
    pressedLanesRef.current.clear();
    lanePulseUntilRef.current = [0, 0, 0, 0];
    setBreakdown({ perfect: 0, good: 0, misses: 0 });
  }, []);

  const registerMiss = useCallback(() => {
    statsRef.current.misses += 1;
    comboRef.current = 0;
    setCombo(0);
    showFeedback("Miss");
  }, [showFeedback]);

  const awardHit = useCallback((isPerfect: boolean) => {
    const nextCombo = comboRef.current + 1;
    const multiplier = Math.min(
      gameConfig.scoring.maxMultiplier,
      1 + Math.floor(nextCombo / gameConfig.scoring.multiplierEvery),
    );
    const points = (isPerfect ? gameConfig.scoring.perfect : gameConfig.scoring.good) * multiplier;
    comboRef.current = nextCombo;
    scoreRef.current += points;
    setCombo(nextCombo);
    setScore(scoreRef.current);
    if (isPerfect) statsRef.current.perfect += 1;
    else statsRef.current.good += 1;
    showFeedback(isPerfect ? "Perfect" : "Good");
    if (isPerfect && "vibrate" in navigator) navigator.vibrate(12);
  }, [showFeedback]);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try { audio.source?.stop(); } catch { /* že končan vir */ }
    void audio.context.close();
    audioRef.current = null;
  }, []);

  const finishGame = useCallback(() => {
    if (phaseRef.current === "result") return;
    window.cancelAnimationFrame(frameRef.current);
    const finalScore = scoreRef.current;
    const nextHighScore = Math.max(highScore, finalScore);
    setHighScore(nextHighScore);
    window.localStorage.setItem(highScoreKey(selectedSong), String(nextHighScore));
    setBreakdown({ ...statsRef.current });
    stopAudio();
    setProgress(1);
    setPhase("result");
  }, [highScore, selectedSong, stopAudio]);

  const drawGame = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const top = 72;
    const bottom = height - 26;
    const hitY = height * 0.82;
    const laneWidth = width / 4;
    const energy = Math.min(comboRef.current / 40, 1);
    const inputPulseNow = window.performance.now();
    const pressedLaneSet = new Set(pressedLanesRef.current.values());

    const glow = context.createRadialGradient(width / 2, hitY, 0, width / 2, hitY, width * .7);
    glow.addColorStop(0, `rgba(224,81,16,${0.08 + energy * .2})`);
    glow.addColorStop(1, "rgba(5,7,8,0)");
    context.fillStyle = glow;
    context.fillRect(0, top, width, bottom - top);

    for (let lane = 0; lane < 4; lane += 1) {
      const x = lane * laneWidth;
      const isPressed = pressedLaneSet.has(lane as Lane);
      const pulse = Math.max(0, Math.min(1, (lanePulseUntilRef.current[lane] - inputPulseNow) / 160));
      context.fillStyle = isPressed || pulse > 0
        ? `rgba(255,216,0,${.08 + Math.max(pulse, isPressed ? .75 : 0) * .18})`
        : lane % 2 === 0 ? "rgba(255,255,255,.018)" : "rgba(255,255,255,.045)";
      context.fillRect(x, top, laneWidth, bottom - top);
      if (lane > 0) {
        context.strokeStyle = "rgba(246,246,246,.13)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, top);
        context.lineTo(x, bottom);
        context.stroke();
      }
    }

    const tapZoneTop = hitY - (gameConfig.timing.early / gameConfig.timing.approach) * (hitY - top);
    const tapZoneBottom = Math.min(bottom, hitY + (gameConfig.timing.late / gameConfig.timing.approach) * (hitY - top));
    const tapZone = context.createLinearGradient(0, tapZoneTop, 0, tapZoneBottom);
    tapZone.addColorStop(0, "rgba(255,216,0,0)");
    tapZone.addColorStop(.55, "rgba(255,216,0,.08)");
    tapZone.addColorStop(1, "rgba(255,216,0,0)");
    context.fillStyle = tapZone;
    context.fillRect(0, tapZoneTop, width, tapZoneBottom - tapZoneTop);

    context.setLineDash([5, 9]);
    context.strokeStyle = `rgba(255,216,0,${.32 + energy * .45})`;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, hitY);
    context.lineTo(width, hitY);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "rgba(5,7,8,.86)";
    context.fillRect(0, hitY + 8, width, 18);
    context.fillStyle = "#ffd800";
    context.font = "700 9px system-ui";
    context.textAlign = "center";
    context.fillText("TAPNI KJERKOLI  ·  SLEDI RITMU", width / 2, hitY + 21);

    selectedSong.notes.forEach((note, index) => {
      if (judgedRef.current.has(index)) return;
      const isActiveHold = [...activeHoldsRef.current.values()].some((hold) => hold.noteIndex === index);
      const relative = note.time - time;
      if (!isActiveHold && (relative > gameConfig.timing.approach || relative < -gameConfig.timing.late)) return;
      const p = 1 - relative / gameConfig.timing.approach;
      const y = isActiveHold ? hitY : top + p * (hitY - top);
      const x = note.lane * laneWidth + 6;
      const tileWidth = laneWidth - 12;
      const tileHeight = Math.max(42, Math.min(64, height * .075));
      const accent = note.lane === 1 || note.lane === 3 ? "#e99fd6" : "#ffd800";

      if (note.type === "hold" && note.duration) {
        const remaining = isActiveHold
          ? Math.max(0, note.time + note.duration - time)
          : note.duration;
        const holdHeight = Math.max(tileHeight * .8, (remaining / gameConfig.timing.approach) * (hitY - top));
        context.shadowColor = accent;
        context.shadowBlur = isActiveHold ? 22 : 10;
        context.fillStyle = isActiveHold ? accent : `${accent}aa`;
        context.beginPath();
        context.roundRect(x + tileWidth * .31, y - holdHeight, tileWidth * .38, holdHeight, 9);
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = "rgba(5,7,8,.72)";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x + tileWidth / 2, y - holdHeight + 9);
        context.lineTo(x + tileWidth / 2, y - 8);
        context.stroke();
      }

      context.shadowColor = accent;
      context.shadowBlur = 10 + energy * 16 + (isActiveHold ? 12 : 0);
      context.fillStyle = accent;
      context.beginPath();
      context.roundRect(x, y - tileHeight / 2, tileWidth, tileHeight, 7);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = "rgba(5,7,8,.82)";
      context.fillRect(x + 8, y - 1, tileWidth - 16, 2);
      context.fillStyle = "#050708";
      context.beginPath();
      context.arc(x + tileWidth - 12, y - tileHeight / 2 + 12, 3, 0, Math.PI * 2);
      context.fill();
      if (note.type === "hold") {
        context.fillStyle = "#050708";
        context.font = "800 8px system-ui";
        context.textAlign = "center";
        context.fillText(isActiveHold ? "DRŽI" : "HOLD", x + tileWidth / 2, y + 3);
      }
    });
  }, [selectedSong]);

  const resolveHold = useCallback((inputId: string, songTime: number, automatic = false) => {
    const active = activeHoldsRef.current.get(inputId);
    if (!active) return;
    const note = selectedSong.notes[active.noteIndex];
    const holdEnd = note.time + (note.duration ?? 0);
    const completed = automatic || songTime >= holdEnd - gameConfig.timing.holdRelease;
    activeHoldsRef.current.delete(inputId);
    judgedRef.current.add(active.noteIndex);
    if (completed) awardHit(active.isPerfect);
    else registerMiss();
  }, [awardHit, registerMiss, selectedSong]);

  const beginInput = useCallback((tappedLane: Lane, inputId: string) => {
    if (phaseRef.current !== "playing" || activeHoldsRef.current.has(inputId)) return;
    const audio = audioRef.current;
    if (!audio) return;
    const songTime = audio.context.currentTime - audio.startAt + selectedSong.offset;
    const heldIndexes = new Set([...activeHoldsRef.current.values()].map((hold) => hold.noteIndex));
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    selectedSong.notes.forEach((note, index) => {
      if (judgedRef.current.has(index) || heldIndexes.has(index)) return;
      const delta = songTime - note.time;
      if (delta < -gameConfig.timing.early || delta > gameConfig.timing.late) return;
      const distance = Math.abs(delta);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex < 0) {
      lanePulseUntilRef.current[tappedLane] = window.performance.now() + 90;
      registerMiss();
      return;
    }

    const note = selectedSong.notes[nearestIndex];
    const isPerfect = nearestDistance <= gameConfig.timing.perfect;
    lanePulseUntilRef.current[note.lane] = window.performance.now() + 160;
    if (note.type === "hold" && note.duration) {
      activeHoldsRef.current.set(inputId, { noteIndex: nearestIndex, isPerfect });
      showFeedback("Drži");
      if ("vibrate" in navigator) navigator.vibrate(8);
      return;
    }

    judgedRef.current.add(nearestIndex);
    awardHit(isPerfect);
  }, [awardHit, registerMiss, selectedSong, showFeedback]);

  useEffect(() => {
    if (phase !== "playing") return;
    const tick = (now: number) => {
      const audio = audioRef.current;
      if (!audio || phaseRef.current !== "playing") return;
      const songTime = audio.context.currentTime - audio.startAt + selectedSong.offset;

      activeHoldsRef.current.forEach((active, inputId) => {
        const note = selectedSong.notes[active.noteIndex];
        if (songTime >= note.time + (note.duration ?? 0)) {
          resolveHold(inputId, songTime, true);
        }
      });

      let missed = 0;
      const heldIndexes = new Set([...activeHoldsRef.current.values()].map((hold) => hold.noteIndex));
      selectedSong.notes.forEach((note, index) => {
        if (!judgedRef.current.has(index) && !heldIndexes.has(index) && songTime - note.time > gameConfig.timing.late) {
          judgedRef.current.add(index);
          missed += 1;
        }
      });

      if (missed > 0) {
        statsRef.current.misses += missed;
        comboRef.current = 0;
        setCombo(0);
        showFeedback("Miss");
      }

      drawGame(songTime);
      if (now - lastUiUpdateRef.current > 90) {
        lastUiUpdateRef.current = now;
        setProgress(Math.max(0, Math.min(songTime / selectedSong.duration, 1)));
      }

      if (songTime >= selectedSong.duration) {
        finishGame();
        return;
      }
      frameRef.current = window.requestAnimationFrame(tick);
    };
    frameRef.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameRef.current);
  }, [drawGame, finishGame, phase, resolveHold, selectedSong, showFeedback]);

  const startGame = useCallback(async () => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    stopAudio();
    resetRound();
    setAudioError("");
    setPhase("loading");

    void fetch("/api/leaderboard/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: selectedSong.id }),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ sessionId: string }>;
      })
      .then((data) => setSessionId(data?.sessionId ?? null))
      .catch(() => setSessionId(null));

    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) {
      setAudioError("Ta brskalnik ne podpira predvajanja zvoka.");
      setPhase("intro");
      return;
    }

    const context = new AudioContextClass({ latencyHint: "interactive" });
    const gain = context.createGain();
    gain.gain.value = muted ? 0 : .78;
    gain.connect(context.destination);
    await context.resume();

    let buffer: AudioBuffer | null = null;
    try {
      const response = await fetch(selectedSong.file);
      if (!response.ok) throw new Error("audio-load");
      buffer = await context.decodeAudioData(await response.arrayBuffer());
    } catch {
      setAudioError("Zvoka ni bilo mogoče naložiti. Igra se bo nadaljevala brez glasbe.");
    }

    const startAt = context.currentTime + 3.2;
    let source: AudioBufferSourceNode | null = null;
    if (buffer) {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(startAt);
    }
    audioRef.current = { context, buffer, source, gain, startAt };
    setCountdown(3);
    setPhase("countdown");

    timersRef.current.push(
      window.setTimeout(() => setCountdown(2), 1000),
      window.setTimeout(() => setCountdown(1), 2000),
      window.setTimeout(() => setPhase("playing"), 3200),
    );
  }, [muted, resetRound, selectedSong, stopAudio]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (phaseRef.current !== "playing" || (event.target as Element).closest("button, a")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const lane = Math.max(0, Math.min(3, Math.floor(((event.clientX - rect.left) / rect.width) * 4))) as Lane;
    const inputId = `pointer-${event.pointerId}`;
    pressedLanesRef.current.set(inputId, lane);
    beginInput(lane, inputId);
  }, [beginInput]);

  const onPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const inputId = `pointer-${event.pointerId}`;
    if (!pressedLanesRef.current.has(inputId) && !activeHoldsRef.current.has(inputId)) return;
    event.preventDefault();
    pressedLanesRef.current.delete(inputId);
    const audio = audioRef.current;
    if (audio) {
      const songTime = audio.context.currentTime - audio.startAt + selectedSong.offset;
      resolveHold(inputId, songTime);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [resolveHold, selectedSong]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const lanes: Record<string, Lane> = { d: 0, f: 1, j: 2, k: 3 };
      const lane = lanes[event.key.toLowerCase()];
      if (lane !== undefined) {
        event.preventDefault();
        const inputId = `key-${event.key.toLowerCase()}`;
        pressedLanesRef.current.set(inputId, lane);
        beginInput(lane, inputId);
      }
      if (event.key === "Escape" && phaseRef.current === "playing") {
        setPauseReason("Igra je ustavljena.");
        void audioRef.current?.context.suspend();
        setPhase("paused");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!(key in { d: 1, f: 1, j: 1, k: 1 })) return;
      pressedLanesRef.current.delete(`key-${key}`);
      const audio = audioRef.current;
      if (!audio) return;
      const songTime = audio.context.currentTime - audio.startAt + selectedSong.offset;
      resolveHold(`key-${key}`, songTime);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [beginInput, resolveHold, selectedSong]);

  useEffect(() => {
    const pauseForInterruption = () => {
      if (document.hidden && phaseRef.current === "playing") {
        setPauseReason("Igra je bila prekinjena. Nadaljuj, ko si pripravljen/-a.");
        void audioRef.current?.context.suspend();
        setPhase("paused");
      }
    };
    document.addEventListener("visibilitychange", pauseForInterruption);
    window.addEventListener("blur", pauseForInterruption);
    return () => {
      document.removeEventListener("visibilitychange", pauseForInterruption);
      window.removeEventListener("blur", pauseForInterruption);
    };
  }, []);

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    setPauseReason("Igra je ustavljena.");
    void audioRef.current?.context.suspend();
    setPhase("paused");
  }, []);

  const resume = useCallback(async () => {
    await audioRef.current?.context.resume();
    setPhase("playing");
  }, []);

  const chooseSong = useCallback((song: GameSong) => {
    setSelectedSong(song);
    const stored = Number(window.localStorage.getItem(highScoreKey(song)) ?? 0);
    setHighScore(Number.isFinite(stored) ? stored : 0);
    setAudioError("");
  }, []);

  const makeShareCard = useCallback(async () => {
    const card = document.createElement("canvas");
    card.width = 1080;
    card.height = 1350;
    const context = card.getContext("2d");
    if (!context) throw new Error("canvas");
    const performance = getPerformance(scoreRef.current);

    context.fillStyle = gameConfig.colors.night;
    context.fillRect(0, 0, card.width, card.height);
    const gradient = context.createRadialGradient(800, 340, 10, 800, 340, 800);
    gradient.addColorStop(0, "rgba(224,81,16,.42)");
    gradient.addColorStop(.55, "rgba(233,159,214,.12)");
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
    context.font = "900 280px Arial Narrow, sans-serif";
    context.fillText(String(scoreRef.current), 60, 625);
    context.fillStyle = gameConfig.colors.white;
    context.font = "700 32px system-ui";
    context.fillText("TOČK", 74, 685);
    context.fillStyle = gameConfig.colors.pink;
    context.font = "900 70px Arial Narrow, sans-serif";
    context.fillText(performance.title.toUpperCase(), 72, 820);
    context.fillStyle = gameConfig.colors.white;
    context.font = "600 34px system-ui";
    context.fillText(`${gameConfig.event.date}  ·  IVANČNA GORICA`, 72, 1095);
    context.fillStyle = gameConfig.colors.yellow;
    context.fillRect(72, 1145, 936, 4);
    context.font = "600 29px system-ui";
    context.fillText(gameConfig.siteUrl, 72, 1218);
    context.fillStyle = gameConfig.colors.white;
    context.font = "500 25px system-ui";
    context.fillText("Najdi svoj ritem. Naslednja postaja: Atlas.", 72, 1280);

    return new Promise<Blob>((resolve, reject) => {
      card.toBlob((blob) => blob ? resolve(blob) : reject(new Error("blob")), "image/png");
    });
  }, []);

  const shareResult = useCallback(async () => {
    setShareStatus("");
    const performance = getPerformance(scoreRef.current);
    const text = gameConfig.shareText(scoreRef.current, performance.title);
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
  }, [makeShareCard]);

  const performance = getPerformance(score);
  const energy = Math.min(combo / 40, 1);

  return (
    <main className={styles.shell} style={{ "--energy": energy } as React.CSSProperties}>
      {phase === "intro" && (
        <section className={`${styles.screen} ${styles.intro}`}>
          <div className={styles.topbar}>
            <Link href="/" className={styles.back} aria-label="Nazaj na Glasbeni Atlas">←</Link>
            <Image src="/media/logo-glasbeni-atlas.svg" width={718} height={577} alt="Glasbeni Atlas" className={styles.logo} priority />
            <button className={styles.iconButton} type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Vklopi zvok" : "Utišaj zvok"}>{muted ? "○" : "◉"}</button>
          </div>
          <div className={styles.introContent}>
            <p className={styles.eyebrow}>Ritmična igra · 36 sekund</p>
            <h1 className={styles.title}>Ujemi <span>ritem</span></h1>
            <p className={styles.lead}>{gameConfig.supportingText}</p>
            <div className={styles.instruction}><span className={styles.tapIcon}>↓</span><span>Tapni kjerkoli na igralnem zaslonu v ritmu glasbe. Dolgo noto drži.</span></div>
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
        </section>
      )}

      {phase === "countdown" && (
        <section className={`${styles.screen} ${styles.centerScreen}`} aria-live="assertive">
          <div key={countdown} className={styles.countdown}>{countdown}</div>
          <p className={styles.nowPlaying}>{selectedSong.artist} · {selectedSong.title}</p>
          <p className={styles.countHint}>Tapni kjerkoli · sledi ritmu</p>
          {audioError && <p className={styles.error}>{audioError}</p>}
        </section>
      )}

      {(phase === "playing" || phase === "paused") && (
        <section
          className={styles.game}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          aria-label="Igralno polje. Tapni kjerkoli v ritmu glasbe; dolgo noto drži."
        >
          <div className={styles.gameHud}>
            <div className={styles.hudValue}><span>Točke</span><strong>{score}</strong></div>
            <div className={styles.hudValue}><span>Combo</span><strong>{combo}<small>×{Math.min(4, 1 + Math.floor(combo / 10))}</small></strong></div>
            <div className={styles.hudActions}>
              <button className={styles.iconButton} type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Vklopi zvok" : "Utišaj zvok"}>{muted ? "○" : "◉"}</button>
              <button className={styles.iconButton} type="button" onClick={pause} aria-label="Ustavi igro">Ⅱ</button>
            </div>
          </div>
          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          {feedback && <p key={feedback.id} className={`${styles.feedback} ${feedback.label === "Drži" ? styles.hold : styles[feedback.label.toLowerCase() as "perfect" | "good" | "miss"]}`} aria-live="polite">{feedback.label}</p>}
          <div className={styles.progress} aria-label={`Napredek ${Math.round(progress * 100)} %`}><span style={{ "--progress": progress } as React.CSSProperties} /></div>
          {phase === "paused" && (
            <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="pause-title">
              <div className={styles.dialog}><p className={styles.coordinate}>45.9372° N · 14.8064° E</p><h2 id="pause-title">Postanek</h2><p>{pauseReason}</p><button className={styles.primary} type="button" onClick={resume}>Nadaljuj</button></div>
            </div>
          )}
        </section>
      )}

      {phase === "result" && (
        <section className={`${styles.screen} ${styles.result}`}>
          <div className={styles.resultInner}>
            <p className={styles.eyebrow}>Prispel/-a si na cilj</p>
            <h1>Ujemi ritem</h1>
            <p className={styles.resultScore}>{score}</p>
            <p className={styles.resultScoreLabel}>točk</p>
            <p className={styles.resultTitle}>{performance.title}</p>
            <p className={styles.playedSong}>{selectedSong.artist} · {selectedSong.title}</p>
            <p className={styles.resultMessage}>{score >= 15000 ? "Ritem imaš. Zdaj potrebuješ samo še vstopnico." : "Pot poznaš. Še en krog in oder je tvoj."}</p>
            <div className={styles.record}><span>Osebni rekord</span><strong>{highScore}</strong></div>
            <div className={styles.actions}>
              <button className={styles.primary} type="button" onClick={startGame}>Igraj znova</button>
              <button className={styles.secondary} type="button" onClick={shareResult}>Deli rezultat</button>
              <a className={styles.ticket} href={gameConfig.ticketUrl} target="_blank" rel="noopener noreferrer">{gameConfig.ticketLabel} ↗</a>
            </div>
            <p className={styles.shareStatus} role="status">{shareStatus}</p>
            <div className={styles.eventStrip}><span>Datum</span><strong>{gameConfig.event.date}</strong><span>Lokacija</span><strong>{gameConfig.event.location}</strong></div>
            <Leaderboard song={selectedSong} score={score} sessionId={sessionId} breakdown={breakdown} />
          </div>
        </section>
      )}

      <div className={styles.landscape}><div><strong>Obrni telefon</strong><p>Igra najbolje teče v pokončnem položaju.</p></div></div>
      <DesktopGameGate />
    </main>
  );
}
