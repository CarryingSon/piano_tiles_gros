"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  countdownLead,
  gameConfig,
  gameSongs,
  type Lane,
  type SongId,
} from "@/data/game";
import {
  CHORD_SNAP_WINDOW_MS,
  RECORDER_SCHEMA_VERSION,
  applyRecorderFix,
  compileRecording,
  defaultHoldThresholdMs,
  repairRecording,
  storageKey,
  type CaptureSource,
  type CompiledRecorderNote,
  type RawPress,
  type RecorderFix,
  type RecorderSettings,
  type StoredRecordingDraft,
} from "@/lib/beatmap-recorder";
import styles from "./BeatmapRecorder.module.css";

type RecorderPhase =
  | "ready"
  | "loading-recording"
  | "recording"
  | "review"
  | "loading-preview"
  | "previewing";

type OpenPress = {
  id: string;
  downMs: number;
  source: CaptureSource;
  pointerId?: number;
};

type PreviewCue = {
  timeMs: number;
  frequency: number;
  duration: number;
};

const INITIAL_SONG = gameSongs[0];
const COUNTDOWN_LEAD_MS = countdownLead * 1000;
const PREVIEW_LOOKAHEAD_MS = 140;

function formatTime(milliseconds: number) {
  const clamped = Math.max(0, milliseconds);
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const hundredths = Math.floor((clamped % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable
    || target.closest("button, input, select, textarea, a, [contenteditable='true']") !== null;
}

function normaliseEventTimeStamp(timeStamp: number) {
  if (timeStamp > 1_000_000_000_000) return timeStamp - performance.timeOrigin;
  return timeStamp;
}

/**
 * Kako dolgo ploščica pada čez igrišče. Ista številka kot v igri na začetku
 * komada — igra jo proti koncu stopnjuje, predogled pa jo drži enako, ker tu
 * gre za to, *kdaj* nota pade, ne kako težka je.
 */
const BOARD_TRAVEL_MS = gameConfig.play.travel * 1000;
/** Koliko pod črto ploščica ostane vidna, preden odide z igrišča. */
const BOARD_TAIL_MS = 400;
/** Klik zadene ploščico, če pade v njen pravokotnik s toliko piksli rezerve. */
const BOARD_PICK_PADDING = 8;

/**
 * Mere igrišča iz njegove velikosti. Ista številka mora peljati risanje in
 * zadevanje klika, sicer ploščica ni tam, kjer je videti.
 */
function boardGeometry(width: number, height: number) {
  const laneWidth = width / 4;
  const hitY = height - 34;
  const topY = 10;
  return {
    laneWidth,
    hitY,
    topY,
    span: hitY - topY,
    tileHeight: Math.max(26, Math.min(52, laneWidth * 0.5)),
  };
}

/** Navpična lega in višina ploščice na igrišču ob času `nowMs`. */
function noteBox(
  note: { timeMs: number; holdMs: number },
  nowMs: number,
  geometry: ReturnType<typeof boardGeometry>,
) {
  const yAt = (timeMs: number) =>
    geometry.hitY - ((timeMs - nowMs) / BOARD_TRAVEL_MS) * geometry.span;
  const bottom = yAt(note.timeMs);
  const top = note.holdMs > 0 ? yAt(note.timeMs + note.holdMs) : bottom - geometry.tileHeight;
  const boxTop = Math.min(top, bottom - geometry.tileHeight);
  return { top: boxTop, height: Math.max(geometry.tileHeight, bottom - boxTop) };
}

function safePresses(value: unknown): RawPress[] | null {
  if (!Array.isArray(value)) return null;
  const presses: RawPress[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Partial<RawPress>;
    if (
      typeof candidate.id !== "string"
      || !Number.isFinite(candidate.downMs)
      || !Number.isFinite(candidate.upMs)
      || (
        candidate.source !== "space"
        && candidate.source !== "right-shift"
        && candidate.source !== "pointer"
        && candidate.source !== "filler"
        && candidate.source !== "manual"
      )
    ) return null;
    const lane = Number(candidate.lane);
    presses.push({
      id: candidate.id,
      downMs: Number(candidate.downMs),
      upMs: Number(candidate.upMs),
      source: candidate.source,
      interrupted: Boolean(candidate.interrupted),
      ...(Number.isInteger(lane) && lane >= 0 && lane <= 3 ? { lane: lane as Lane } : {}),
    });
  }
  return presses;
}

function downloadText(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export default function BeatmapRecorder() {
  const [selectedSongId, setSelectedSongId] = useState<SongId>(INITIAL_SONG.id);
  const selectedSong = gameSongs.find((song) => song.id === selectedSongId) ?? INITIAL_SONG;
  const durationMs = Math.round(selectedSong.duration * 1000);

  const [phase, setPhase] = useState<RecorderPhase>("ready");
  const [presses, setPresses] = useState<RawPress[]>([]);
  const [timingOffsetMs, setTimingOffsetMs] = useState(0);
  const [holdThresholdMs, setHoldThresholdMs] = useState(
    defaultHoldThresholdMs(INITIAL_SONG.bpm),
  );
  const [laneSeed, setLaneSeed] = useState(1);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [activeSources, setActiveSources] = useState<CaptureSource[]>([]);
  const [selectedPressId, setSelectedPressId] = useState<string | null>(null);
  /**
   * Kaj naredi klik po igrišču: izbere ploščico ali doda novo. Dodajanje je za
   * stikalom, ker je igrišče hkrati pregled — zgrešen klik ne sme kar zapisati
   * note, ki je nihče ni odigral.
   */
  const [boardMode, setBoardMode] = useState<"select" | "add">("select");
  const [status, setStatus] = useState("Pripravljen za prvi posnetek.");
  const [audioError, setAudioError] = useState("");
  const [copyLabel, setCopyLabel] = useState("Kopiraj JSON");
  const [draftLoaded, setDraftLoaded] = useState(false);

  const phaseRef = useRef<RecorderPhase>(phase);
  const openPressesRef = useRef(new Map<CaptureSource, OpenPress>());
  const sequenceRef = useRef(0);
  const hydratedSongRef = useRef<SongId | null>(null);
  const recordPadRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const boardRef = useRef<HTMLCanvasElement>(null);
  /* Igrišče se riše v svoji zanki, zato bere note in izbiro iz referenc —
     tako mu ni treba ob vsakem izrisu Reacta na novo postaviti zanke. */
  const boardNotesRef = useRef<CompiledRecorderNote[]>([]);
  const boardSelectedRef = useRef<string | null>(null);
  const boardColorRef = useRef("#ffd800");
  const pressesRef = useRef<RawPress[]>([]);
  const selectedPressIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const scheduledClicksRef = useRef(new Set<OscillatorNode>());
  const previewCueIndexRef = useRef(0);
  const expectedPauseRef = useRef(false);
  const transportGenerationRef = useRef(0);
  const pendingTransportRef = useRef<{
    generation: number;
    mode: "recording" | "preview";
  } | null>(null);
  const replaceDraftOnPlayRef = useRef(false);
  const replacementBackupRef = useRef<RawPress[] | null>(null);
  const storageWarningShownRef = useRef(false);
  const stallTimerRef = useRef(0);
  const stalledAtMsRef = useRef(0);
  const bufferingRef = useRef(false);
  const droppedPressesRef = useRef(0);

  const settings = useMemo<RecorderSettings>(() => ({
    timingOffsetMs,
    holdThresholdMs,
    laneSeed,
  }), [holdThresholdMs, laneSeed, timingOffsetMs]);

  const compiled = useMemo(
    () => compileRecording(
      presses,
      selectedSong.id,
      settings,
      COUNTDOWN_LEAD_MS,
      durationMs,
    ),
    [durationMs, presses, selectedSong.id, settings],
  );

  const selectedPress = useMemo(
    () => presses.find((press) => press.id === selectedPressId) ?? null,
    [presses, selectedPressId],
  );

  /** Prevedena nota izbranega pritiska — iz nje beremo stezo, ki jo je dobila. */
  const selectedNote = useMemo(
    () => compiled.notes.find((note) => note.sourcePressId === selectedPressId) ?? null,
    [compiled.notes, selectedPressId],
  );

  const counts = useMemo(() => ({
    taps: compiled.notes.filter((note) => note.kind === "tap").length,
    holds: compiled.notes.filter((note) => note.kind === "hold").length,
    errors: compiled.issues.filter((issue) => issue.level === "error").length,
    warnings: compiled.issues.filter((issue) => issue.level === "warning").length,
    fixableErrors: compiled.issues.filter((issue) => issue.level === "error" && issue.fix).length,
    fixableWarnings: compiled.issues.filter((issue) => issue.level === "warning" && issue.fix).length,
  }), [compiled]);

  const previewCues = useMemo<PreviewCue[]>(() => {
    const cues: PreviewCue[] = [];
    for (const note of compiled.notes) {
      cues.push({ timeMs: note.timeMs, frequency: 1_180, duration: 0.035 });
      if (note.holdMs > 0) {
        cues.push({
          timeMs: note.timeMs + note.holdMs,
          frequency: 560,
          duration: 0.05,
        });
      }
    }
    return cues.sort((first, second) => first.timeMs - second.timeMs);
  }, [compiled.notes]);

  const changePhase = useCallback((next: RecorderPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const invalidateTransport = useCallback(() => {
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = 0;
    bufferingRef.current = false;
    transportGenerationRef.current += 1;
    pendingTransportRef.current = null;
    replaceDraftOnPlayRef.current = false;
    replacementBackupRef.current = null;
  }, []);

  const pauseAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) {
      expectedPauseRef.current = false;
      return;
    }
    expectedPauseRef.current = true;
    audio.pause();
  }, []);

  const stopScheduledClicks = useCallback(() => {
    for (const oscillator of scheduledClicksRef.current) {
      try { oscillator.stop(); } catch { /* click has already ended */ }
    }
    scheduledClicksRef.current.clear();
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) throw new Error("Audio element ni pripravljen.");
    let context = audioContextRef.current;
    if (!context) {
      context = new window.AudioContext({ latencyHint: "interactive" });
      audioContextRef.current = context;
    }
    if (!mediaSourceRef.current) {
      const source = context.createMediaElementSource(audio);
      source.connect(context.destination);
      mediaSourceRef.current = source;
    }
    await context.resume();
    return context;
  }, []);

  const audioTimeAt = useCallback((eventTimeStamp?: number) => {
    const audio = audioRef.current;
    if (!audio) return 0;
    let timeMs = audio.currentTime * 1000;
    if (eventTimeStamp !== undefined) {
      const eventAt = normaliseEventTimeStamp(eventTimeStamp);
      const callbackDelay = performance.now() - eventAt;
      if (callbackDelay > 0 && callbackDelay < 250) {
        timeMs -= callbackDelay * (audio.playbackRate || 1);
      }
    }
    return Math.max(0, Math.min(durationMs, timeMs));
  }, [durationMs]);

  const syncActiveSources = useCallback(() => {
    setActiveSources([...openPressesRef.current.keys()]);
  }, []);

  const finishPress = useCallback((source: CaptureSource, eventTimeStamp?: number, interrupted = false) => {
    const open = openPressesRef.current.get(source);
    if (!open) return;
    const upMs = Math.max(open.downMs, audioTimeAt(eventTimeStamp));
    const press: RawPress = {
      id: open.id,
      downMs: open.downMs,
      upMs,
      source: open.source,
      interrupted: interrupted || undefined,
    };
    openPressesRef.current.delete(source);
    syncActiveSources();
    setPresses((current) => [...current, press]);
  }, [audioTimeAt, syncActiveSources]);

  const finishAllPresses = useCallback((interrupted = false) => {
    if (openPressesRef.current.size === 0) return;
    const upMs = audioTimeAt();
    const completed: RawPress[] = [...openPressesRef.current.values()].map((open) => ({
      id: open.id,
      downMs: open.downMs,
      upMs: Math.max(open.downMs, upMs),
      source: open.source,
      interrupted: interrupted || undefined,
    }));
    openPressesRef.current.clear();
    syncActiveSources();
    setPresses((current) => [...current, ...completed]);
  }, [audioTimeAt, syncActiveSources]);

  const beginPress = useCallback((source: CaptureSource, eventTimeStamp?: number, pointerId?: number) => {
    if (phaseRef.current !== "recording") return;
    if (bufferingRef.current) {
      // The clock is frozen while the audio refills, so the press has no honest
      // time. Count it instead of losing it without a word.
      droppedPressesRef.current += 1;
      return;
    }
    // A keyup can go missing — a browser shortcut, a window that lost focus —
    // and the stale open press would then swallow every later press on that key.
    if (openPressesRef.current.has(source)) finishPress(source, eventTimeStamp, true);
    if (
      openPressesRef.current.size >= 2
      || (source === "pointer" && openPressesRef.current.size > 0)
      || (source !== "pointer" && openPressesRef.current.has("pointer"))
    ) return;
    const audioNowMs = (audioRef.current?.currentTime ?? 0) * 1000;
    if (audioNowMs < COUNTDOWN_LEAD_MS) return;
    sequenceRef.current += 1;
    const fallbackId = `${selectedSong.id}-${Date.now()}-${sequenceRef.current}`;
    openPressesRef.current.set(source, {
      id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackId,
      downMs: Math.max(COUNTDOWN_LEAD_MS, audioTimeAt(eventTimeStamp)),
      source,
      pointerId,
    });
    syncActiveSources();
  }, [audioTimeAt, finishPress, selectedSong.id, syncActiveSources]);

  /** Presses lost to a stalling audio clock are the one thing a take cannot show. */
  const withDroppedNote = useCallback((message: string) => {
    const dropped = droppedPressesRef.current;
    if (dropped === 0) return message;
    return `${message} Izpadli pritiski med zatikanjem zvoka: ${dropped} — preveri razmike.`;
  }, []);

  const finishRecording = useCallback((message: string, interrupted = false) => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "loading-recording") return;
    invalidateTransport();
    finishAllPresses(interrupted);
    pauseAudio();
    changePhase("review");
    setStatus(withDroppedNote(message));
  }, [changePhase, finishAllPresses, invalidateTransport, pauseAudio, withDroppedNote]);

  useEffect(() => () => {
    window.clearTimeout(stallTimerRef.current);
    stopScheduledClicks();
    void audioContextRef.current?.close();
  }, [stopScheduledClicks]);

  useEffect(() => {
    if (!audioRef.current) return;
    invalidateTransport();
    pauseAudio();
    stopScheduledClicks();
    openPressesRef.current.clear();
    syncActiveSources();
    setPlayheadMs(0);
    setSelectedPressId(null);
    setAudioError("");
    changePhase("ready");

    hydratedSongRef.current = null;
    const restoreTimer = window.setTimeout(() => {
      const fallbackThreshold = defaultHoldThresholdMs(selectedSong.bpm);
      try {
        const serialized = window.localStorage.getItem(storageKey(selectedSong.id));
        const parsed = serialized ? JSON.parse(serialized) as Partial<StoredRecordingDraft> : null;
        const restoredPresses = safePresses(parsed?.presses);
        if (
          parsed?.schemaVersion === RECORDER_SCHEMA_VERSION
          && parsed.songId === selectedSong.id
          && restoredPresses
          && restoredPresses.length > 0
        ) {
          setPresses(restoredPresses);
          setTimingOffsetMs(Number.isFinite(parsed.timingOffsetMs) ? Number(parsed.timingOffsetMs) : 0);
          setHoldThresholdMs(
            Number.isFinite(parsed.holdThresholdMs) ? Number(parsed.holdThresholdMs) : fallbackThreshold,
          );
          setLaneSeed(Number.isFinite(parsed.laneSeed) ? Number(parsed.laneSeed) : 1);
          setStatus(`Obnovljen lokalni osnutek (${restoredPresses.length} dogodkov).`);
        } else {
          setPresses([]);
          setTimingOffsetMs(0);
          setHoldThresholdMs(fallbackThreshold);
          setLaneSeed(1);
          setStatus("Pripravljen za prvi posnetek.");
        }
      } catch {
        setPresses([]);
        setTimingOffsetMs(0);
        setHoldThresholdMs(fallbackThreshold);
        setLaneSeed(1);
        setStatus("Lokalnega osnutka ni bilo mogoče prebrati; začni nov posnetek.");
      }
      hydratedSongRef.current = selectedSong.id;
      setDraftLoaded(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [changePhase, invalidateTransport, pauseAudio, selectedSong.bpm, selectedSong.id, stopScheduledClicks, syncActiveSources]);

  useEffect(() => {
    if (hydratedSongRef.current !== selectedSong.id) return;
    try {
      if (presses.length === 0) {
        window.localStorage.removeItem(storageKey(selectedSong.id));
        return;
      }
      const draft: StoredRecordingDraft = {
        schemaVersion: RECORDER_SCHEMA_VERSION,
        songId: selectedSong.id,
        updatedAt: new Date().toISOString(),
        timingOffsetMs,
        holdThresholdMs,
        laneSeed,
        presses,
      };
      window.localStorage.setItem(storageKey(selectedSong.id), JSON.stringify(draft));
    } catch {
      if (storageWarningShownRef.current) return;
      storageWarningShownRef.current = true;
      window.setTimeout(() => {
        setStatus("Brskalnik lokalnega osnutka ne more shraniti. Čim prej prenesi JSON.");
      }, 0);
    }
  }, [holdThresholdMs, laneSeed, presses, selectedSong.id, timingOffsetMs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && phaseRef.current === "recording") {
        event.preventDefault();
        finishRecording("Snemanje je bilo ročno končano.", openPressesRef.current.size > 0);
        return;
      }
      const source = event.code === "Space"
        ? "space"
        : event.code === "ShiftRight"
          ? "right-shift"
          : null;
      // A resting left Shift used to void every Space tap that followed it, so
      // only the modifiers that carry real browser shortcuts are filtered.
      if (
        !source
        || event.repeat
        || event.isComposing
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || isEditableTarget(event.target)
        || phaseRef.current !== "recording"
      ) return;
      event.preventDefault();
      beginPress(source, event.timeStamp);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const source = event.code === "Space"
        ? "space"
        : event.code === "ShiftRight"
          ? "right-shift"
          : null;
      if (!source || !openPressesRef.current.has(source)) return;
      event.preventDefault();
      finishPress(source, event.timeStamp);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [beginPress, finishPress, finishRecording]);

  useEffect(() => {
    const interrupt = () => {
      if (phaseRef.current === "recording") {
        finishRecording("Snemanje je bilo prekinjeno, ker okno ni bilo več aktivno.", true);
      }
    };
    const onVisibility = () => {
      if (document.hidden) interrupt();
    };
    window.addEventListener("blur", interrupt);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupt);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [finishRecording]);

  useEffect(() => {
    if (phase !== "recording" && phase !== "previewing") return;
    let frame = 0;
    let lastUiPaint = 0;
    const tick = (now: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const currentMs = Math.min(durationMs, audio.currentTime * 1000);
      if (now - lastUiPaint >= 40) {
        setPlayheadMs(currentMs);
        lastUiPaint = now;
      }

      if (phaseRef.current === "previewing") {
        const context = audioContextRef.current;
        while (
          context
          && previewCueIndexRef.current < previewCues.length
          && previewCues[previewCueIndexRef.current].timeMs <= currentMs + PREVIEW_LOOKAHEAD_MS
        ) {
          const cue = previewCues[previewCueIndexRef.current];
          previewCueIndexRef.current += 1;
          if (cue.timeMs < currentMs - 35) continue;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const startsAt = context.currentTime + Math.max(0, (cue.timeMs - currentMs) / 1000);
          oscillator.type = "square";
          oscillator.frequency.value = cue.frequency;
          gain.gain.setValueAtTime(0.0001, startsAt);
          gain.gain.exponentialRampToValueAtTime(0.13, startsAt + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + cue.duration);
          oscillator.connect(gain).connect(context.destination);
          scheduledClicksRef.current.add(oscillator);
          oscillator.onended = () => scheduledClicksRef.current.delete(oscillator);
          oscillator.start(startsAt);
          oscillator.stop(startsAt + cue.duration + 0.01);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [durationMs, phase, previewCues]);

  const startRecording = useCallback(async () => {
    if (!draftLoaded) return;
    let replaceDraft = false;
    if (presses.length > 0) {
      replaceDraft = window.confirm(
        `Za ${selectedSong.artist} že obstaja osnutek z ${presses.length} dogodki. Ga želiš zamenjati?`,
      );
      if (!replaceDraft) return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    invalidateTransport();
    pauseAudio();
    stopScheduledClicks();
    audio.currentTime = 0;
    const generation = transportGenerationRef.current;
    pendingTransportRef.current = { generation, mode: "recording" };
    droppedPressesRef.current = 0;
    replaceDraftOnPlayRef.current = replaceDraft;
    replacementBackupRef.current = replaceDraft ? presses : null;
    setSelectedPressId(null);
    setPlayheadMs(0);
    setAudioError("");
    setStatus("Nalagam zvok …");
    changePhase("loading-recording");
    try {
      // Both calls must begin inside the click's transient user activation;
      // awaiting one first can make Safari reject the other as autoplay.
      const graphReady = ensureAudioGraph();
      const playbackStarted = audio.play();
      await Promise.all([graphReady, playbackStarted]);
      if (generation !== transportGenerationRef.current) {
        pauseAudio();
      } else {
        replacementBackupRef.current = null;
      }
    } catch {
      if (generation !== transportGenerationRef.current) return;
      const replacementBackup = replacementBackupRef.current;
      replacementBackupRef.current = null;
      pendingTransportRef.current = null;
      replaceDraftOnPlayRef.current = false;
      pauseAudio();
      if (replacementBackup) setPresses(replacementBackup);
      changePhase("ready");
      setAudioError("Zvoka ni bilo mogoče zagnati. Preveri brskalnik in poskusi znova.");
      setStatus("Snemanje se ni začelo.");
    }
  }, [
    changePhase,
    ensureAudioGraph,
    draftLoaded,
    invalidateTransport,
    pauseAudio,
    presses,
    selectedSong.artist,
    stopScheduledClicks,
  ]);

  const startPreview = useCallback(async () => {
    if (compiled.notes.length === 0) return;
    const audio = audioRef.current;
    if (!audio) return;
    invalidateTransport();
    pauseAudio();
    if (audio.currentTime * 1000 >= durationMs - 50) audio.currentTime = 0;
    stopScheduledClicks();
    const generation = transportGenerationRef.current;
    pendingTransportRef.current = { generation, mode: "preview" };
    const fromMs = audio.currentTime * 1000;
    previewCueIndexRef.current = previewCues.findIndex((cue) => cue.timeMs >= fromMs - 20);
    if (previewCueIndexRef.current < 0) previewCueIndexRef.current = previewCues.length;
    setAudioError("");
    changePhase("loading-preview");
    try {
      const graphReady = ensureAudioGraph();
      const playbackStarted = audio.play();
      await Promise.all([graphReady, playbackStarted]);
      if (generation !== transportGenerationRef.current) pauseAudio();
    } catch {
      if (generation !== transportGenerationRef.current) return;
      pendingTransportRef.current = null;
      pauseAudio();
      changePhase("review");
      setAudioError("Predogleda ni bilo mogoče zagnati.");
    }
  }, [
    changePhase,
    compiled.notes.length,
    durationMs,
    ensureAudioGraph,
    invalidateTransport,
    pauseAudio,
    previewCues,
    stopScheduledClicks,
  ]);

  const pausePreview = useCallback(() => {
    invalidateTransport();
    pauseAudio();
    stopScheduledClicks();
    changePhase("review");
    setStatus("Predogled ustavljen na izbranem mestu.");
  }, [changePhase, invalidateTransport, pauseAudio, stopScheduledClicks]);

  const onAudioPlaying = useCallback(() => {
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = 0;
    bufferingRef.current = false;
    if (phaseRef.current === "recording" || phaseRef.current === "previewing") return;
    const pending = pendingTransportRef.current;
    if (!pending || pending.generation !== transportGenerationRef.current) {
      pauseAudio();
      return;
    }
    pendingTransportRef.current = null;
    if (phaseRef.current === "loading-recording" && pending.mode === "recording") {
      if (replaceDraftOnPlayRef.current) {
        setPresses([]);
        sequenceRef.current = 0;
      }
      replaceDraftOnPlayRef.current = false;
      changePhase("recording");
      setStatus("Snemanje teče. Začni tapkati, ko zaslišiš glasbo.");
      window.requestAnimationFrame(() => recordPadRef.current?.focus());
    } else if (phaseRef.current === "loading-preview" && pending.mode === "preview") {
      changePhase("previewing");
      setStatus("Visok klik je začetek note, nizek klik je konec holda.");
    } else {
      pauseAudio();
    }
  }, [changePhase, pauseAudio]);

  const onAudioEnded = useCallback(() => {
    invalidateTransport();
    stopScheduledClicks();
    setPlayheadMs(durationMs);
    if (phaseRef.current === "recording") {
      finishAllPresses(true);
      changePhase("review");
      setStatus(withDroppedNote("Komad je končan. Posnetek je pripravljen za pregled."));
    } else if (phaseRef.current === "previewing" || phaseRef.current === "loading-preview") {
      changePhase("review");
      setStatus("Predogled je končan.");
    }
  }, [changePhase, durationMs, finishAllPresses, invalidateTransport, stopScheduledClicks, withDroppedNote]);

  const onAudioInterruption = useCallback(() => {
    if (phaseRef.current === "recording" || phaseRef.current === "loading-recording") {
      finishRecording("Zvok se je med snemanjem ustavil. Zadnji pritisk preveri ali posnemi znova.", true);
    } else if (phaseRef.current === "previewing" || phaseRef.current === "loading-preview") {
      pausePreview();
    }
  }, [finishRecording, pausePreview]);

  const scheduleAudioInterruption = useCallback(() => {
    if (
      phaseRef.current !== "recording"
      && phaseRef.current !== "loading-recording"
      && phaseRef.current !== "previewing"
      && phaseRef.current !== "loading-preview"
    ) return;
    const audio = audioRef.current;
    bufferingRef.current = true;
    stalledAtMsRef.current = (audio?.currentTime ?? 0) * 1000;
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = 0;
      const current = audioRef.current;
      const advancedMs = (current?.currentTime ?? 0) * 1000 - stalledAtMsRef.current;
      if (current && !current.paused && current.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA && advancedMs > 50) {
        bufferingRef.current = false;
        return;
      }
      onAudioInterruption();
    }, 1_000);
  }, [onAudioInterruption]);

  const clearAudioInterruption = useCallback(() => {
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = 0;
    bufferingRef.current = false;
  }, []);

  const onAudioPause = useCallback(() => {
    if (expectedPauseRef.current) {
      expectedPauseRef.current = false;
      return;
    }
    if (audioRef.current?.ended) return;
    if (phaseRef.current === "recording" || phaseRef.current === "loading-recording") {
      finishRecording("Snemanje je ustavila zunanja pavza. Zadnji pritisk preveri pred izvozom.", true);
    } else if (phaseRef.current === "previewing" || phaseRef.current === "loading-preview") {
      pausePreview();
    }
  }, [finishRecording, pausePreview]);

  const onAudioError = useCallback(() => {
    setAudioError("Zvočne datoteke ni bilo mogoče naložiti.");
    stopScheduledClicks();
    if (phaseRef.current === "recording" || phaseRef.current === "loading-recording") {
      finishRecording("Snemanje je bilo ustavljeno zaradi napake zvoka.", true);
    } else if (phaseRef.current === "previewing" || phaseRef.current === "loading-preview") {
      invalidateTransport();
      pauseAudio();
      changePhase("review");
      setStatus("Predogled je bil ustavljen zaradi napake zvoka.");
    } else {
      changePhase("ready");
    }
  }, [changePhase, finishRecording, invalidateTransport, pauseAudio, stopScheduledClicks]);

  const updatePress = useCallback((id: string, nextStartMs: number, nextDurationMs: number) => {
    const startMs = Math.max(0, Math.min(durationMs, nextStartMs));
    const duration = Math.max(0, nextDurationMs);
    setPresses((current) => current.map((press) => (
      press.id === id
        ? { ...press, downMs: startMs, upMs: Math.min(durationMs, startMs + duration), interrupted: undefined }
        : press
    )));
  }, [durationMs]);

  /** Ročna izbira steze; `null` jo vrne samodejnemu razporejanju. */
  const setPressLane = useCallback((id: string, lane: Lane | null) => {
    setPresses((current) => current.map((press) => {
      if (press.id !== id) return press;
      if (lane === null) {
        const next = { ...press };
        delete next.lane;
        return next;
      }
      return { ...press, lane };
    }));
  }, []);

  /** Nova nota, narisana na igrišče. Vpisana je kot tap; hold se ji nastavi v urejevalniku. */
  const addPress = useCallback((timeMs: number, lane: Lane) => {
    const compiledMs = Math.max(COUNTDOWN_LEAD_MS, Math.min(durationMs, timeMs));
    const downMs = Math.round((compiledMs - timingOffsetMs) / 10) * 10;
    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setPresses((current) => [...current, { id, downMs, upMs: downMs, source: "manual", lane }]);
    setSelectedPressId(id);
    setStatus(`Dodana nota v stezi ${lane + 1} pri ${formatTime(compiledMs)}.`);
  }, [durationMs, timingOffsetMs]);

  const removePress = useCallback((id: string) => {
    setPresses((current) => current.filter((press) => press.id !== id));
    setSelectedPressId((current) => (current === id ? null : current));
  }, []);

  const applyFix = useCallback((fix: RecorderFix) => {
    setPresses((current) => applyRecorderFix(current, fix, settings));
    if (fix.kind === "drop-note") {
      setSelectedPressId((current) => (current === fix.pressId ? null : current));
    }
    setStatus(`Popravek: ${fix.label.toLowerCase()}.`);
  }, [settings]);

  const repairAll = useCallback((includeWarnings: boolean) => {
    const repair = repairRecording(
      presses,
      selectedSong.id,
      settings,
      COUNTDOWN_LEAD_MS,
      durationMs,
      { includeWarnings },
    );
    if (repair.applied === 0) {
      setStatus("Nobenega zadetka ni bilo mogoče popraviti samodejno; uredi noto ročno.");
      return;
    }
    setPresses(repair.presses);
    setSelectedPressId((current) => (
      repair.presses.some((press) => press.id === current) ? current : null
    ));
    setStatus(
      `Samodejnih popravkov: ${repair.applied} · preostale napake: ${repair.remainingErrors}`
      + ` · opozorila: ${repair.remainingWarnings}.`,
    );
  }, [durationMs, presses, selectedSong.id, settings]);

  const undoLastEvent = useCallback(() => {
    const lastNote = compiled.notes.at(-1);
    if (!lastNote) return;
    const sourceIds = new Set(
      compiled.notes
        .filter((note) => note.timeMs === lastNote.timeMs)
        .map((note) => note.sourcePressId),
    );
    setPresses((current) => current.filter((press) => !sourceIds.has(press.id)));
    setSelectedPressId((current) => (current && sourceIds.has(current) ? null : current));
  }, [compiled.notes]);

  const resetDraft = useCallback(() => {
    if (!window.confirm(`Res izbrišem lokalni osnutek za ${selectedSong.artist}?`)) return;
    invalidateTransport();
    pauseAudio();
    stopScheduledClicks();
    openPressesRef.current.clear();
    syncActiveSources();
    setPresses([]);
    setTimingOffsetMs(0);
    setHoldThresholdMs(defaultHoldThresholdMs(selectedSong.bpm));
    setLaneSeed(1);
    setPlayheadMs(0);
    setSelectedPressId(null);
    try {
      window.localStorage.removeItem(storageKey(selectedSong.id));
    } catch {
      storageWarningShownRef.current = true;
    }
    changePhase("ready");
    setStatus("Osnutek je izbrisan.");
  }, [
    changePhase,
    invalidateTransport,
    pauseAudio,
    selectedSong.artist,
    selectedSong.bpm,
    selectedSong.id,
    stopScheduledClicks,
    syncActiveSources,
  ]);

  const seekTimeline = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (phaseRef.current === "recording" || phaseRef.current === "loading-recording") return;
    if ((event.target as Element).closest("button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const targetMs = ratio * durationMs;
    const audio = audioRef.current;
    if (audio) {
      invalidateTransport();
      pauseAudio();
      audio.currentTime = targetMs / 1000;
    }
    stopScheduledClicks();
    setPlayheadMs(targetMs);
    changePhase(presses.length > 0 ? "review" : "ready");
  }, [changePhase, durationMs, invalidateTransport, pauseAudio, presses.length, stopScheduledClicks]);

  const exportPayload = useMemo(() => ({
    schemaVersion: RECORDER_SCHEMA_VERSION,
    kind: "glasbeni-atlas-beatmap-take",
    exportedAt: new Date().toISOString(),
    song: {
      id: selectedSong.id,
      artist: selectedSong.artist,
      title: selectedSong.title,
      sourceFile: selectedSong.file,
      bpm: selectedSong.bpm,
      configuredDurationMs: durationMs,
      countdownLeadMs: COUNTDOWN_LEAD_MS,
    },
    settings,
    rawPresses: presses,
    compiled: {
      ready: compiled.ready,
      noteCount: compiled.notes.length,
      tapCount: counts.taps,
      holdCount: counts.holds,
      encodedChart: compiled.encodedChart,
      notes: compiled.notes.map((note) => ({
        sourcePressId: note.sourcePressId,
        source: note.source,
        time: note.timeMs / 1000,
        lane: note.lane,
        hold: note.holdMs / 1000,
      })),
      issues: compiled.issues,
    },
  }), [compiled, counts.holds, counts.taps, durationMs, presses, selectedSong, settings]);

  const serializedExport = useMemo(() => JSON.stringify(exportPayload, null, 2), [exportPayload]);

  const downloadJson = useCallback(() => {
    downloadText(`${selectedSong.id}-beatmap-take.json`, `${serializedExport}\n`);
    setStatus("JSON je prenesen. Shrani ga na varno in mi ga nato predaj.");
  }, [selectedSong.id, serializedExport]);

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(serializedExport);
      setCopyLabel("Kopirano");
      window.setTimeout(() => setCopyLabel("Kopiraj JSON"), 1400);
    } catch {
      setCopyLabel("Kopiranje ni uspelo");
      window.setTimeout(() => setCopyLabel("Kopiraj JSON"), 1800);
    }
  }, [serializedExport]);

  const recording = phase === "recording" || phase === "loading-recording";
  const previewing = phase === "previewing" || phase === "loading-preview";
  const isPressing = activeSources.length > 0;
  const spaceActive = activeSources.includes("space");
  const shiftActive = activeSources.includes("right-shift");
  const doubleActive = spaceActive && shiftActive;
  const canReview = presses.length > 0 && !recording;
  const countdown = phase === "recording" && playheadMs < COUNTDOWN_LEAD_MS
    ? Math.max(1, Math.ceil((COUNTDOWN_LEAD_MS - playheadMs) / 1000))
    : null;
  const timelineWidth = Math.max(960, Math.round(durationMs / 110));

  /* ---------------------------------------------------------------- board */

  /**
   * Igrišče kot v igri: štiri steze, ploščice padajo proti črti, na črti je
   * „zdaj". Riše se v svoji zanki iz zvočne ure, tako da je slika gladka tudi
   * med predvajanjem, ko se `playheadMs` osvežuje samo vsakih 40 ms.
   *
   * Hitrost padanja je začetna hitrost iz igre in ostane enaka od začetka do
   * konca komada — igra jo proti koncu stopnjuje, tu pa gre za to, *kdaj* nota
   * pade, ne kako težka je takrat.
   */
  const drawBoard = useCallback((nowMs: number) => {
    const canvas = boardRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const geometry = boardGeometry(width, height);
    const { laneWidth, hitY, topY } = geometry;
    const color = boardColorRef.current;

    context.fillStyle = "#08090a";
    context.fillRect(0, 0, width, height);
    for (let lane = 1; lane < 4; lane += 1) {
      context.fillStyle = "rgba(255,255,255,.07)";
      context.fillRect(lane * laneWidth, 0, 1, height);
    }

    for (const note of boardNotesRef.current) {
      const endMs = note.timeMs + note.holdMs;
      if (endMs < nowMs - BOARD_TAIL_MS || note.timeMs > nowMs + BOARD_TRAVEL_MS) continue;
      const { top: boxTop, height: boxHeight } = noteBox(note, nowMs, geometry);
      const selected = note.sourcePressId === boardSelectedRef.current;
      const played = note.timeMs < nowMs;

      context.globalAlpha = played ? 0.35 : 1;
      context.fillStyle = note.source === "filler" || note.source === "manual"
        ? "rgba(255,255,255,.22)"
        : color;
      context.beginPath();
      context.roundRect(note.lane * laneWidth + 6, boxTop, laneWidth - 12, boxHeight, 8);
      context.fill();
      if (note.source === "filler" || note.source === "manual") {
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.stroke();
      }
      if (selected) {
        context.globalAlpha = 1;
        context.strokeStyle = "#ffffff";
        context.lineWidth = 2.5;
        context.stroke();
      }
      context.globalAlpha = 1;
    }

    context.fillStyle = color;
    context.fillRect(0, hitY, width, 2);
    context.fillStyle = "#7e848a";
    context.font = "600 10px system-ui, sans-serif";
    context.fillText(`${formatTime(nowMs)} · zdaj`, 8, hitY + 16);
    context.textAlign = "right";
    context.fillText(`+${(BOARD_TRAVEL_MS / 1000).toFixed(2)} s`, width - 8, topY + 10);
    context.textAlign = "left";
  }, []);

  useEffect(() => {
    pressesRef.current = presses;
    selectedPressIdRef.current = selectedPressId;
    boardNotesRef.current = compiled.notes;
    boardSelectedRef.current = selectedPressId;
    boardColorRef.current = selectedSong.baseColor;
  });

  useEffect(() => {
    if (!canReview) return;
    let frame = 0;
    const tick = () => {
      drawBoard((audioRef.current?.currentTime ?? 0) * 1000);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [canReview, drawBoard]);

  /** Klik po igrišču: izbere ploščico pod prstom, v načinu dodajanja pa jo ustvari. */
  const onBoardPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = boardRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nowMs = (audioRef.current?.currentTime ?? 0) * 1000;
    const geometry = boardGeometry(rect.width, rect.height);
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const lane = Math.max(0, Math.min(3, Math.floor((x / rect.width) * 4))) as Lane;
    const timeMs = nowMs + ((geometry.hitY - y) / geometry.span) * BOARD_TRAVEL_MS;

    // Zadene se narisani pravokotnik, ne bližina v času: ploščica je tam, kjer
    // je videti, tudi kadar je visok hold.
    let hit: CompiledRecorderNote | null = null;
    for (const note of boardNotesRef.current) {
      if (note.lane !== lane) continue;
      const box = noteBox(note, nowMs, geometry);
      if (y < box.top - BOARD_PICK_PADDING || y > box.top + box.height + BOARD_PICK_PADDING) continue;
      if (!hit || Math.abs(note.timeMs - timeMs) < Math.abs(hit.timeMs - timeMs)) hit = note;
    }

    if (hit) {
      setSelectedPressId(hit.sourcePressId);
      return;
    }
    if (boardMode === "add" && !previewing) addPress(Math.round(timeMs / 10) * 10, lane);
  }, [addPress, boardMode, previewing]);

  /**
   * Bližnjice med urejanjem: 1–4 prestavijo izbrano noto v stezo, puščici jo
   * premakneta za 10 ms (s Shiftom za 100), Delete jo izbriše. Med snemanjem
   * in predvajanjem ne veljajo, da ne posegajo v tek komada.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        phaseRef.current === "recording"
        || phaseRef.current === "previewing"
        || phaseRef.current === "loading-preview"
        || event.metaKey
        || event.ctrlKey
        || event.altKey
        || isEditableTarget(event.target)
      ) return;
      const press = pressesRef.current.find((item) => item.id === selectedPressIdRef.current);
      if (!press) return;

      const lane = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(event.code);
      if (lane >= 0) {
        event.preventDefault();
        setPressLane(press.id, lane as Lane);
        return;
      }
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault();
        const step = (event.code === "ArrowLeft" ? -10 : 10) * (event.shiftKey ? 10 : 1);
        updatePress(press.id, press.downMs + step, press.upMs - press.downMs);
        return;
      }
      if (event.code === "Backspace" || event.code === "Delete") {
        event.preventDefault();
        removePress(press.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removePress, setPressLane, updatePress]);

  return (
    <main
      className={styles.shell}
      style={{ "--band-color": selectedSong.baseColor } as React.CSSProperties}
    >
      <audio
        ref={audioRef}
        src={selectedSong.file}
        preload="auto"
        onPlaying={onAudioPlaying}
        onPause={onAudioPause}
        onEnded={onAudioEnded}
        onCanPlay={clearAudioInterruption}
        onWaiting={scheduleAudioInterruption}
        onStalled={scheduleAudioInterruption}
        onError={onAudioError}
      />

      <header className={styles.header}>
        <Link className={styles.back} href="/igra">← Igra</Link>
        <span className={styles.localBadge}>Lokalno · začasno orodje</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroTitle}>
          <p className={styles.eyebrow}>Glasbeni Atlas · Beatmap recorder</p>
          <h1>Odigraj<br /><span>ritem.</span></h1>
        </div>
        <p>
          Space in desni Shift snemata vsak svojo noto. Pritisni ju skupaj za
          dvojni tap; štiri steze se deterministično premešajo po posnetku.
        </p>
      </section>

      <section className={styles.controlPanel} aria-labelledby="recording-title">
        <div className={styles.panelHeading}>
          <div>
            <span>01 · Posnetek</span>
            <h2 id="recording-title">Tapkaj s Space in desnim Shiftom</h2>
          </div>
          <div className={styles.transportTime}>
            <strong>{formatTime(playheadMs)}</strong>
            <span>/ {formatTime(durationMs)}</span>
          </div>
        </div>

        <div className={styles.songControls}>
          <label>
            Komad
            <select
              value={selectedSong.id}
              disabled={recording || previewing}
              onChange={(event) => {
                setDraftLoaded(false);
                setSelectedSongId(event.target.value as SongId);
              }}
            >
              {gameSongs.map((song) => (
                <option key={song.id} value={song.id}>{song.artist} — {song.title}</option>
              ))}
            </select>
          </label>
          <div className={styles.songMeta}>
            <span>{selectedSong.bpm.toFixed(2)} BPM</span>
            <span>{presses.length} dogodkov</span>
            <span>osnutek se shranjuje sam</span>
          </div>
        </div>

        <div
          ref={recordPadRef}
          className={styles.recordPad}
          data-active={isPressing ? "true" : "false"}
          data-recording={phase === "recording" ? "true" : "false"}
          role="button"
          tabIndex={recording ? 0 : -1}
          aria-label="Snemalna površina: Space ali desni Shift; oba skupaj ustvarita dvojni tap"
          aria-keyshortcuts="Space Shift"
          onPointerDown={(event) => {
            if (phaseRef.current !== "recording") return;
            event.preventDefault();
            try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* already released */ }
            beginPress("pointer", event.timeStamp, event.pointerId);
          }}
          onPointerUp={(event) => {
            const openPointer = openPressesRef.current.get("pointer");
            if (
              !openPointer
              || openPointer.pointerId !== event.pointerId
            ) return;
            event.preventDefault();
            finishPress("pointer", event.timeStamp);
          }}
          onPointerCancel={(event) => {
            const openPointer = openPressesRef.current.get("pointer");
            if (
              openPointer
              && openPointer.pointerId === event.pointerId
            ) finishPress("pointer", event.timeStamp, true);
          }}
        >
          {countdown ? (
            <>
              <span className={styles.countdown}>{countdown}</span>
              <small>pripravi se</small>
            </>
          ) : phase === "recording" ? (
            <>
              <div className={styles.keyRow}>
                <span className={styles.keyCap} data-active={spaceActive ? "true" : "false"}>SPACE</span>
                <span className={styles.keyJoin}>+</span>
                <span className={styles.keyCap} data-active={shiftActive ? "true" : "false"}>SHIFT R</span>
              </div>
              <small>
                {doubleActive
                  ? "dvojni tap"
                  : isPressing
                    ? "spusti za konec pritiska"
                    : "posamezno = ena nota · skupaj = dve noti"}
              </small>
            </>
          ) : phase === "loading-recording" ? (
            <>
              <span className={styles.spaceKey}>NALAGAM</span>
              <small>počakaj na začetek predvajanja</small>
            </>
          ) : (
            <>
              <div className={styles.keyRow}>
                <span className={styles.keyCap}>SPACE</span>
                <span className={styles.keyJoin}>+</span>
                <span className={styles.keyCap}>SHIFT R</span>
              </div>
              <small>ena tipka = tap ali hold · obe skupaj = dvojni tap</small>
            </>
          )}
        </div>

        <div className={styles.recordStats} aria-live="polite">
          <div><span>Stanje</span><strong>{recording ? "Snemam" : previewing ? "Predogled" : "Pripravljeno"}</strong></div>
          <div><span>Tapi</span><strong>{counts.taps}</strong></div>
          <div><span>Holdi</span><strong>{counts.holds}</strong></div>
          <div><span>Skupaj</span><strong>{presses.length}</strong></div>
        </div>

        <div className={styles.actions}>
          {!recording && !previewing && (
            <button
              className={styles.primary}
              type="button"
              disabled={!draftLoaded}
              onClick={startRecording}
            >
              {presses.length > 0 ? "Posnemi znova" : "Začni snemanje"}
            </button>
          )}
          {recording && (
            <button
              className={styles.stop}
              type="button"
              onClick={() => finishRecording("Snemanje je bilo ročno končano.", openPressesRef.current.size > 0)}
            >
              Končaj posnetek
            </button>
          )}
          {!recording && presses.length > 0 && (
            <button
              className={styles.secondary}
              type="button"
              onClick={undoLastEvent}
              disabled={previewing}
            >
              Razveljavi zadnji dogodek
            </button>
          )}
          {!recording && !previewing && presses.length > 0 && (
            <button className={styles.dangerGhost} type="button" onClick={resetDraft}>Izbriši osnutek</button>
          )}
        </div>

        <p className={styles.status} role="status">{status}</p>
        <p className={styles.chordHint}>
          Space + desni Shift se združita v dvojni tap, ko se pritiska prekrivata
          in se začneta največ {CHORD_SNAP_WINDOW_MS} ms narazen.
        </p>
        {audioError && <p className={styles.error} role="alert">{audioError}</p>}
      </section>

      {canReview && (
        <section className={styles.review} aria-labelledby="review-title">
          <div className={styles.panelHeading}>
            <div>
              <span>02 · Pregled</span>
              <h2 id="review-title">Poslušaj in popravi</h2>
            </div>
            <div className={styles.previewLegend}>
              <span><i data-tone="start" /> začetek</span>
              <span><i data-tone="end" /> konec holda</span>
            </div>
          </div>

          <div className={styles.previewActions}>
            {previewing ? (
              <button className={styles.primary} type="button" onClick={pausePreview}>Ustavi preview</button>
            ) : (
              <button className={styles.primary} type="button" onClick={startPreview}>Predvajaj s kliki</button>
            )}
            <button
              className={styles.secondary}
              type="button"
              disabled={previewing}
              onClick={() => {
                const audio = audioRef.current;
                if (audio) audio.currentTime = 0;
                setPlayheadMs(0);
              }}
            >
              Na začetek
            </button>
            <div className={styles.boardModes} role="group" aria-label="Kaj naredi klik po igrišču">
              <button
                type="button"
                aria-pressed={boardMode === "select"}
                onClick={() => setBoardMode("select")}
              >
                Izberi
              </button>
              <button
                type="button"
                aria-pressed={boardMode === "add"}
                disabled={previewing}
                onClick={() => setBoardMode("add")}
              >
                Dodaj noto
              </button>
            </div>
            <span>Klikni časovnico za seek, po igrišču pa ploščico.</span>
          </div>

          {/* Igrišče kot v igri: ploščice padajo proti črti „zdaj". Klik izbere
              ploščico, v načinu dodajanja pa jo na tistem mestu ustvari. */}
          <canvas
            ref={boardRef}
            className={styles.board}
            data-mode={boardMode}
            onPointerDown={onBoardPointerDown}
            aria-label="Predogled igrišča: štiri steze in ploščice, ki padajo proti črti"
          />

          <div className={styles.timelineScroller}>
            <div
              className={styles.timeline}
              style={{ width: `${timelineWidth}px` }}
              onClick={seekTimeline}
            >
              <div
                className={styles.playhead}
                style={{ left: `${(playheadMs / durationMs) * 100}%` }}
              />
              {[0, 1, 2, 3].map((lane) => (
                <div
                  className={styles.timelineLane}
                  key={lane}
                  style={{ top: `${lane * 25}%` }}
                >
                  <span>{lane + 1}</span>
                </div>
              ))}
              {compiled.notes.map((note) => (
                <button
                  key={note.sourcePressId}
                  type="button"
                  className={styles.timelineNote}
                  data-kind={note.kind}
                  data-source={note.source}
                  data-selected={note.sourcePressId === selectedPressId ? "true" : "false"}
                  style={{
                    left: `${(note.timeMs / durationMs) * 100}%`,
                    top: `${note.lane * 25 + 3}%`,
                    width: note.holdMs > 0
                      ? `${(note.holdMs / durationMs) * 100}%`
                      : undefined,
                  }}
                  onClick={() => setSelectedPressId(note.sourcePressId)}
                  title={`${formatTime(note.timeMs)} · steza ${note.lane + 1} · ${note.kind}`}
                  aria-label={`Nota pri ${formatTime(note.timeMs)}, steza ${note.lane + 1}`}
                />
              ))}
            </div>
          </div>

          {selectedPress && (
            <div className={styles.noteEditor}>
              <div>
                <span>Izbrani dogodek</span>
                <strong>
                  {selectedPress.source === "space"
                    ? "SPACE"
                    : selectedPress.source === "right-shift"
                      ? "SHIFT R"
                      : selectedPress.source === "filler"
                        ? "ZAPOLNITEV"
                        : "TAP"}
                </strong>
              </div>
              <label>
                Začetek (ms, raw)
                <input
                  type="number"
                  step="10"
                  value={Math.round(selectedPress.downMs)}
                  disabled={previewing}
                  onChange={(event) => updatePress(
                    selectedPress.id,
                    Number(event.target.value),
                    selectedPress.upMs - selectedPress.downMs,
                  )}
                />
              </label>
              <label>
                Dolžina pritiska (ms)
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={Math.round(selectedPress.upMs - selectedPress.downMs)}
                  disabled={previewing}
                  onChange={(event) => updatePress(
                    selectedPress.id,
                    selectedPress.downMs,
                    Number(event.target.value),
                  )}
                />
              </label>
              <div className={styles.laneChoice}>
                <span>Steza</span>
                <div>
                  {[0, 1, 2, 3].map((lane) => (
                    <button
                      key={lane}
                      type="button"
                      aria-pressed={selectedNote?.lane === lane}
                      data-manual={selectedPress.lane === lane ? "true" : "false"}
                      disabled={previewing}
                      onClick={() => setPressLane(selectedPress.id, lane as Lane)}
                    >
                      {lane + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={styles.laneAuto}
                    disabled={previewing || selectedPress.lane === undefined}
                    onClick={() => setPressLane(selectedPress.id, null)}
                  >
                    Samodejno
                  </button>
                </div>
              </div>
              <button
                className={styles.dangerGhost}
                type="button"
                disabled={previewing}
                onClick={() => removePress(selectedPress.id)}
              >
                Izbriši noto
              </button>
            </div>
          )}
        </section>
      )}

      {canReview && (
        <section className={styles.finishGrid}>
          <div className={styles.settingsPanel}>
            <div className={styles.panelHeading}>
              <div>
                <span>03 · Pretvorba</span>
                <h2>Nastavi chart</h2>
              </div>
            </div>

            <label className={styles.rangeField}>
              <span><strong>Globalni zamik</strong><output>{timingOffsetMs > 0 ? "+" : ""}{timingOffsetMs} ms</output></span>
              <input
                type="range"
                min="-500"
                max="500"
                step="10"
                value={timingOffsetMs}
                disabled={previewing}
                onChange={(event) => setTimingOffsetMs(Number(event.target.value))}
              />
              <small>Negativna vrednost premakne vse note prej.</small>
            </label>

            <label className={styles.rangeField}>
              <span><strong>Prag za hold</strong><output>{holdThresholdMs} ms</output></span>
              <input
                type="range"
                min="200"
                max="800"
                step="10"
                value={holdThresholdMs}
                disabled={previewing}
                onChange={(event) => setHoldThresholdMs(Number(event.target.value))}
              />
              <small>Krajši pritisk postane tap, daljši hold.</small>
            </label>

            <div className={styles.seedControl}>
              <div>
                <strong>Razporeditev stez</strong>
                <span>Seed {laneSeed} · uravnoteženi bloki po štiri</span>
              </div>
              <button
                className={styles.secondary}
                type="button"
                disabled={previewing}
                onClick={() => setLaneSeed((seed) => seed + 1)}
              >
                Premešaj steze
              </button>
            </div>
          </div>

          <div className={styles.validationPanel} data-ready={compiled.ready ? "true" : "false"}>
            <div className={styles.panelHeading}>
              <div>
                <span>04 · Preverjanje</span>
                <h2>{compiled.ready ? "Chart je pripravljen" : `Napake za pregled: ${counts.errors}`}</h2>
              </div>
            </div>
            <div className={styles.validationStats}>
              <span><strong>{compiled.notes.length}</strong> not</span>
              <span><strong>{counts.holds}</strong> holdov</span>
              <span><strong>{counts.warnings}</strong> opozoril</span>
            </div>
            {(counts.fixableErrors > 0 || counts.fixableWarnings > 0) && (
              <div className={styles.validationActions}>
                {counts.fixableErrors > 0 && (
                  <button
                    className={styles.primary}
                    type="button"
                    disabled={previewing}
                    onClick={() => repairAll(false)}
                  >
                    Popravi vse napake ({counts.fixableErrors})
                  </button>
                )}
                {counts.fixableWarnings > 0 && (
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={previewing}
                    onClick={() => repairAll(true)}
                  >
                    Popravi še opozorila ({counts.fixableWarnings})
                  </button>
                )}
                <small>Predlogi ohranijo posnete pritiske; razmike zapolnijo enakomerni tapi.</small>
              </div>
            )}
            {compiled.issues.length > 0 ? (
              <ul className={styles.issueList}>
                {compiled.issues.slice(0, 10).map((issue, index) => {
                  const fix = issue.fix;
                  return (
                    <li key={`${issue.code}-${issue.sourcePressId ?? "chart"}-${index}`} data-level={issue.level}>
                      <span>{issue.level === "error" ? "Napaka" : "Poglej"}</span>
                      <button
                        type="button"
                        onClick={() => issue.sourcePressId && setSelectedPressId(issue.sourcePressId)}
                        disabled={!issue.sourcePressId}
                      >
                        {issue.message}
                      </button>
                      {fix && (
                        <button
                          className={styles.issueFix}
                          type="button"
                          disabled={previewing}
                          onClick={() => applyFix(fix)}
                        >
                          {fix.label}
                        </button>
                      )}
                    </li>
                  );
                })}
                {compiled.issues.length > 10 && (
                  <li className={styles.issueMore}>… in še {compiled.issues.length - 10} zadetkov.</li>
                )}
              </ul>
            ) : (
              <p className={styles.allGood}>Časi, holdi, razmiki in packed chart so veljavni.</p>
            )}
          </div>
        </section>
      )}

      {canReview && (
        <section className={styles.exportPanel}>
          <div>
            <span>05 · Predaja</span>
            <h2>Prenesi surovi posnetek</h2>
            <p>
              JSON vedno vsebuje nespremenjene pritiske, nastavitve, končne note,
              seed in rezultat preverjanja. Tudi nepopoln osnutek lahko varno preneseš.
            </p>
          </div>
          <div className={styles.exportActions}>
            <button className={styles.primary} type="button" onClick={downloadJson}>Prenesi JSON</button>
            <button className={styles.secondary} type="button" onClick={copyJson}>{copyLabel}</button>
          </div>
        </section>
      )}

      <footer className={styles.footer}>
        <span>Uporabi žične slušalke ali zvočnike; Bluetooth zamik nato popravi z globalnim zamikom.</span>
        <span>Recorder v produkcijskem buildu vrne 404.</span>
      </footer>
    </main>
  );
}
