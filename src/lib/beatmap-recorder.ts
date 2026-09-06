import { gameConfig, type Lane, type SongId } from "@/data/game";

export const RECORDER_SCHEMA_VERSION = 1 as const;
export const CHART_TICK_MS = 10;
export const MAX_HOLD_MS = 10_230;
/** Nad tem je razmik v pregledu označen kot dolg — a to je opozorilo, ne napaka. */
export const MAX_UNCOVERED_GAP_MS = 2_000;
export const GAP_WARNING_MS = 1_900;
/**
 * The game only swallows a second tap this soon after the previous one when it
 * lands in the *same* lane (`doubleTapGuard`), so this is a per-lane floor and
 * never a global one: two notes 30 ms apart in different lanes are perfectly
 * playable, and lane assignment below is what keeps them apart.
 */
export const MIN_PLAYABLE_GAP_MS = Math.round(gameConfig.play.doubleTapGuard * 1000);
/**
 * Space and Right Shift only merge into a double tap when they start this close
 * together. A wider window ate fast alternating taps — a roll came back as half
 * as many chords, which reads as "the recorder missed my presses" — so it sits
 * well under the tightest roll anyone plays by hand.
 */
export const CHORD_SNAP_WINDOW_MS = 45;
/** Auto-filled gaps are cut into pieces no longer than this. */
export const GAP_FILL_TARGET_MS = 1_700;

const LANES = [0, 1, 2, 3] as const;
const TAP_LANES = "wxyz";
const HOLD_LANES = "WXYZ";
const BASE32 = "0123456789abcdefghijklmnopqrstuv";
const TIGHT_TRANSITION_MS = 180;

/**
 * `filler` notes are not played by hand — the editor adds them to close gaps —
 * and `manual` ones are drawn straight onto the board in the editor.
 */
export type CaptureSource = "space" | "right-shift" | "pointer" | "filler" | "manual";

/** The unmodified key/pointer timings are the source of truth. */
export type RawPress = {
  id: string;
  downMs: number;
  upMs: number;
  source: CaptureSource;
  interrupted?: boolean;
  /**
   * Steza, ki jo je izbral človek. Brez nje jo določi `assignRecorderLanes`;
   * z njo je ta zavezana — okoli nje razporedi vse druge note.
   */
  lane?: Lane;
};

export type RecorderSettings = {
  timingOffsetMs: number;
  holdThresholdMs: number;
  laneSeed: number;
};

export type StoredRecordingDraft = RecorderSettings & {
  schemaVersion: typeof RECORDER_SCHEMA_VERSION;
  songId: SongId;
  updatedAt: string;
  presses: RawPress[];
};

export type CompiledRecorderNote = {
  sourcePressId: string;
  timeMs: number;
  holdMs: number;
  lane: Lane;
  kind: "tap" | "hold";
  interrupted: boolean;
  source: CaptureSource;
};

/**
 * A repair the editor can apply on its own. Times are compiled milliseconds —
 * `applyRecorderFix` converts them back to raw press timings — so a fix stays
 * valid no matter what the global offset is when it is finally applied.
 */
export type RecorderFix =
  | { kind: "fill-gap"; label: string; fromMs: number; toMs: number }
  | { kind: "trim-hold"; label: string; pressId: string; holdMs: number }
  | { kind: "move-note"; label: string; pressId: string; timeMs: number }
  | { kind: "make-tap"; label: string; pressId: string }
  | { kind: "drop-note"; label: string; pressId: string }
  | { kind: "confirm-press"; label: string; pressId?: string };

export type RecorderIssue = {
  level: "error" | "warning";
  code:
    | "empty"
    | "invalid-time"
    | "before-countdown"
    | "after-song"
    | "hold-too-long"
    | "invalid-chord"
    | "overlap"
    | "too-close"
    | "long-gap"
    | "interrupted";
  message: string;
  sourcePressId?: string;
  fix?: RecorderFix;
};

export type CompiledRecording = {
  notes: CompiledRecorderNote[];
  issues: RecorderIssue[];
  encodedChart: string | null;
  ready: boolean;
};

type TimedEvent = Pick<
  CompiledRecorderNote,
  "sourcePressId" | "timeMs" | "holdMs" | "kind" | "interrupted" | "source"
> & {
  /** Ročno izbrana steza; `undefined` pomeni „izberi jo sam". */
  laneOverride?: Lane;
};

type TimedCaptureEvent = TimedEvent & {
  captureIndex: number;
  downMs: number;
  upMs: number;
};

type ChordCandidate = {
  firstIndex: number;
  secondIndex: number;
  distanceMs: number;
};

function isChordKeyboardSource(source: CaptureSource) {
  return source === "space" || source === "right-shift";
}

/**
 * Match the closest overlapping Space/Right Shift pairs inside the human-input window.
 * A global closest-first pass avoids stealing a Shift tap from a much nearer
 * Space tap when the player records a quick sequence. Pointer input is never
 * considered for chords. Both matched presses become taps because the game
 * does not support holds inside a chord.
 */
function snapKeyboardTapChords(events: readonly TimedCaptureEvent[]): TimedEvent[] {
  const candidates: ChordCandidate[] = [];

  for (let firstIndex = 0; firstIndex < events.length; firstIndex += 1) {
    const first = events[firstIndex];
    if (!isChordKeyboardSource(first.source)) continue;

    for (let secondIndex = firstIndex + 1; secondIndex < events.length; secondIndex += 1) {
      const second = events[secondIndex];
      const distanceMs = second.downMs - first.downMs;
      if (distanceMs > CHORD_SNAP_WINDOW_MS) break;
      if (
        second.downMs <= first.upMs
        && isChordKeyboardSource(second.source)
        && second.source !== first.source
      ) {
        candidates.push({ firstIndex, secondIndex, distanceMs });
      }
    }
  }

  candidates.sort((first, second) =>
    first.distanceMs - second.distanceMs
    || events[first.firstIndex].downMs - events[second.firstIndex].downMs
    || first.firstIndex - second.firstIndex
    || first.secondIndex - second.secondIndex,
  );

  const matched = new Set<number>();
  const snappedTimes = new Map<number, number>();
  for (const candidate of candidates) {
    if (matched.has(candidate.firstIndex) || matched.has(candidate.secondIndex)) continue;
    const chordTimeMs = Math.min(
      events[candidate.firstIndex].timeMs,
      events[candidate.secondIndex].timeMs,
    );
    snappedTimes.set(candidate.firstIndex, chordTimeMs);
    snappedTimes.set(candidate.secondIndex, chordTimeMs);
    matched.add(candidate.firstIndex);
    matched.add(candidate.secondIndex);
  }

  return events
    .map((event, index) => ({
      sourcePressId: event.sourcePressId,
      timeMs: snappedTimes.get(index) ?? event.timeMs,
      holdMs: matched.has(index) ? 0 : event.holdMs,
      kind: matched.has(index) ? "tap" as const : event.kind,
      interrupted: event.interrupted,
      source: event.source,
      laneOverride: event.laneOverride,
      captureIndex: event.captureIndex,
    }))
    .sort((first, second) => first.timeMs - second.timeMs || first.captureIndex - second.captureIndex)
    .map((event) => ({
      sourcePressId: event.sourcePressId,
      timeMs: event.timeMs,
      holdMs: event.holdMs,
      kind: event.kind,
      interrupted: event.interrupted,
      source: event.source,
      laneOverride: event.laneOverride,
    }));
}

function permutations(values: readonly Lane[]): Lane[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((lane, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    return permutations(rest).map((order) => [lane, ...order]);
  });
}

const LANE_ORDERS = permutations(LANES);

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type PlacedLane = { timeMs: number; lane: Lane };

/**
 * True when the lane was already used less than a double-tap guard ago, which
 * is what makes two close notes unhittable. Both lists run ascending, `trial`
 * after `placed`, so the first note outside the window ends the search.
 */
function laneUsedTooRecently(
  lane: Lane,
  timeMs: number,
  placed: readonly PlacedLane[],
  trial: readonly PlacedLane[],
) {
  for (const list of [trial, placed]) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const note = list[index];
      if (timeMs - note.timeMs >= MIN_PLAYABLE_GAP_MS) return false;
      if (note.lane === lane) return true;
    }
  }
  return false;
}

/**
 * Seeded shuffled bags keep every four-note block balanced while still
 * looking random. A tight transition never repeats a lane or jumps 0 <-> 3, and
 * no lane comes back inside the game's double-tap guard — that last rule is
 * what lets a dense passage stay dense instead of being flagged unplayable.
 *
 * Nota z `laneOverride` svojo stezo obdrži: med razporeditvami bloka ostanejo
 * samo tiste, ki jo spoštujejo, tako da se preostale note umaknejo okoli nje.
 * Kadar nobena ne prestane vseh pravil, je izbrana steza vseeno močnejša od
 * samodejne — človek jo je izbral namenoma, preverjanje pa bo trk prijavilo.
 */
export function assignRecorderLanes(
  events: readonly TimedEvent[],
  songId: SongId,
  laneSeed: number,
): CompiledRecorderNote[] {
  const random = mulberry32(fnv1a32(`beatmap-lanes:v1:${songId}:${laneSeed}`));
  const result: CompiledRecorderNote[] = [];
  const placed: PlacedLane[] = [];
  let previousLane: Lane | null = null;

  for (let start = 0; start < events.length; start += LANES.length) {
    const block = events.slice(start, start + LANES.length);
    const previousEvent = start === 0 ? null : events[start - 1];
    const candidates = LANE_ORDERS.filter((order) => {
      const trial: PlacedLane[] = [];
      return block.every((event, index) => {
        const toLane = order[index];
        if (event.laneOverride !== undefined && toLane !== event.laneOverride) return false;
        const fromLane = index === 0 ? previousLane : order[index - 1];
        const fromEvent = index === 0 ? previousEvent : block[index - 1];
        if (laneUsedTooRecently(toLane, event.timeMs, placed, trial)) return false;
        trial.push({ timeMs: event.timeMs, lane: toLane });
        if (fromLane === null || !fromEvent) return true;
        if (toLane === fromLane) return false;
        const freeGap = event.timeMs - (fromEvent.timeMs + fromEvent.holdMs);
        return !(
          freeGap < TIGHT_TRANSITION_MS
          && Math.abs(toLane - fromLane) === LANES.length - 1
        );
      });
    });

    // A block of five-plus notes inside one guard window has no valid order at
    // all, so keep the stable fallback and let validation report the collision.
    const pool = candidates.length > 0 ? candidates : LANE_ORDERS;
    const chosen = pool[Math.floor(random() * pool.length)];
    block.forEach((event, index) => {
      const lane = event.laneOverride ?? chosen[index];
      result.push({
        sourcePressId: event.sourcePressId,
        timeMs: event.timeMs,
        holdMs: event.holdMs,
        kind: event.kind,
        interrupted: event.interrupted,
        source: event.source,
        lane,
      });
      placed.push({ timeMs: event.timeMs, lane });
    });
    previousLane = block[block.length - 1].laneOverride ?? chosen[block.length - 1];
  }

  return result;
}

function quantizeMs(value: number) {
  return Math.round(value / CHART_TICK_MS) * CHART_TICK_MS;
}

function base32(value: number, width = 0) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Cannot encode invalid base32 value ${value}.`);
  }
  let remaining = value;
  let encoded = "";
  do {
    encoded = BASE32[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  } while (remaining > 0);
  return encoded.padStart(width, "0");
}

export function encodeRecorderChart(notes: readonly CompiledRecorderNote[]) {
  let previousTick = 0;
  let encoded = "";

  for (const note of notes) {
    const tick = Math.round(note.timeMs / CHART_TICK_MS);
    const holdTicks = Math.round(note.holdMs / CHART_TICK_MS);
    if (tick < previousTick || holdTicks > 1_023) {
      throw new Error("Recorder notes are outside the packed chart format.");
    }
    encoded += base32(tick - previousTick);
    encoded += holdTicks > 0
      ? HOLD_LANES[note.lane] + base32(holdTicks, 2)
      : TAP_LANES[note.lane];
    previousTick = tick;
  }

  return encoded;
}

function validateNotes(
  notes: readonly CompiledRecorderNote[],
  presses: readonly RawPress[],
  countdownLeadMs: number,
  durationMs: number,
) {
  const issues: RecorderIssue[] = [];
  if (notes.length === 0) {
    issues.push({ level: "error", code: "empty", message: "Posnetek še nima nobene note." });
    return issues;
  }

  const usedTimes = new Set(notes.map((note) => note.timeMs));
  /** The first free tick after `afterMs`, so a nudged note lands on its own. */
  const nextFreeTimeMs = (afterMs: number) => {
    let candidate = afterMs + CHART_TICK_MS;
    while (usedTimes.has(candidate)) candidate += CHART_TICK_MS;
    return candidate;
  };

  for (const note of notes) {
    if (!Number.isFinite(note.timeMs) || !Number.isFinite(note.holdMs) || note.holdMs < 0) {
      issues.push({
        level: "error",
        code: "invalid-time",
        sourcePressId: note.sourcePressId,
        message: "Nota vsebuje neveljaven čas.",
        fix: { kind: "drop-note", label: "Odstrani noto", pressId: note.sourcePressId },
      });
      continue;
    }
    if (note.timeMs < countdownLeadMs) {
      issues.push({
        level: "error",
        code: "before-countdown",
        sourcePressId: note.sourcePressId,
        message: `Nota pri ${(note.timeMs / 1000).toFixed(2)} s je pred koncem 3-sekundnega uvoda.`,
        fix: {
          kind: "move-note",
          label: "Premakni za uvod",
          pressId: note.sourcePressId,
          timeMs: nextFreeTimeMs(countdownLeadMs - CHART_TICK_MS),
        },
      });
    }
    if (note.timeMs >= durationMs) {
      issues.push({
        level: "error",
        code: "after-song",
        sourcePressId: note.sourcePressId,
        message: `Nota pri ${(note.timeMs / 1000).toFixed(2)} s sega čez konec komada.`,
        fix: { kind: "drop-note", label: "Odstrani noto", pressId: note.sourcePressId },
      });
    } else if (note.timeMs + note.holdMs > durationMs) {
      issues.push({
        level: "error",
        code: "after-song",
        sourcePressId: note.sourcePressId,
        message: `Nota pri ${(note.timeMs / 1000).toFixed(2)} s sega čez konec komada.`,
        fix: {
          kind: "trim-hold",
          label: "Skrajšaj hold",
          pressId: note.sourcePressId,
          holdMs: Math.floor((durationMs - note.timeMs) / CHART_TICK_MS) * CHART_TICK_MS,
        },
      });
    }
    if (note.holdMs > MAX_HOLD_MS) {
      issues.push({
        level: "error",
        code: "hold-too-long",
        sourcePressId: note.sourcePressId,
        message: `Hold pri ${(note.timeMs / 1000).toFixed(2)} s je daljši od 10,23 s.`,
        fix: {
          kind: "trim-hold",
          label: "Skrajšaj hold",
          pressId: note.sourcePressId,
          holdMs: MAX_HOLD_MS,
        },
      });
    }
    if (note.interrupted) {
      issues.push({
        level: "warning",
        code: "interrupted",
        sourcePressId: note.sourcePressId,
        message: `Pritisk pri ${(note.timeMs / 1000).toFixed(2)} s je bil prekinjen; preveri njegov konec.`,
        fix: { kind: "confirm-press", label: "Potrdi konec", pressId: note.sourcePressId },
      });
    }
  }

  for (let index = 1; index < notes.length; index += 1) {
    const previous = notes[index - 1];
    const note = notes[index];
    if (note.timeMs >= previous.timeMs + previous.holdMs) continue;
    const trimmedMs = note.timeMs - previous.timeMs;
    issues.push({
      level: "error",
      code: "overlap",
      sourcePressId: note.sourcePressId,
      message: `Nota pri ${(note.timeMs / 1000).toFixed(2)} s se začne znotraj prejšnjega holda.`,
      fix: trimmedMs > 0
        ? {
          kind: "trim-hold",
          label: "Skrajšaj prejšnji hold",
          pressId: previous.sourcePressId,
          holdMs: trimmedMs,
        }
        : { kind: "make-tap", label: "Prejšnjo v tap", pressId: previous.sourcePressId },
    });
  }

  // Only a repeat inside the *same* lane is unplayable; different lanes may sit
  // as close together as the player managed to hit them.
  for (let index = 1; index < notes.length; index += 1) {
    const note = notes[index];
    for (let earlier = index - 1; earlier >= 0; earlier -= 1) {
      const previous = notes[earlier];
      const gapMs = note.timeMs - previous.timeMs;
      if (gapMs >= MIN_PLAYABLE_GAP_MS) break;
      if (previous.lane !== note.lane) continue;
      issues.push({
        level: "warning",
        code: "too-close",
        sourcePressId: note.sourcePressId,
        message: `Noti v stezi ${note.lane + 1} pri ${(previous.timeMs / 1000).toFixed(2)} s sta manj kot ${MIN_PLAYABLE_GAP_MS} ms narazen.`,
        fix: {
          kind: "move-note",
          label: "Razmakni noti",
          pressId: note.sourcePressId,
          timeMs: nextFreeTimeMs(previous.timeMs + MIN_PLAYABLE_GAP_MS - CHART_TICK_MS),
        },
      });
      break;
    }
  }

  for (let start = 0; start < notes.length;) {
    let end = start + 1;
    while (end < notes.length && notes[end].timeMs === notes[start].timeMs) end += 1;
    const chord = notes.slice(start, end);
    for (const extra of chord.slice(2)) {
      issues.push({
        level: "error",
        code: "invalid-chord",
        sourcePressId: extra.sourcePressId,
        message: `Pri ${(chord[0].timeMs / 1000).toFixed(2)} s so več kot dve sočasni noti.`,
        fix: {
          kind: "move-note",
          label: "Razmakni noto",
          pressId: extra.sourcePressId,
          timeMs: nextFreeTimeMs(chord[0].timeMs),
        },
      });
    }
    if (chord.length > 1) {
      for (const held of chord.filter((note) => note.holdMs > 0)) {
        issues.push({
          level: "error",
          code: "invalid-chord",
          sourcePressId: held.sourcePressId,
          message: `Hold pri ${(chord[0].timeMs / 1000).toFixed(2)} s ne sme biti del akorda.`,
          fix: { kind: "make-tap", label: "Spremeni v tap", pressId: held.sourcePressId },
        });
      }
    }
    start = end;
  }

  let coveredUntil = countdownLeadMs;
  // Razmik je vedno le opozorilo, nikoli napaka: redek uvod je odločitev
  // avtorja chart, ne okvara. Popravek „Zapolni razmik" ostane na dosegu klika,
  // `repairRecording` pa ga brez `includeWarnings` ne bo uporabil sam od sebe —
  // note v prazna mesta doda samo, kdor jih tam hoče.
  const recordGap = (startMs: number, endMs: number) => {
    const gapMs = endMs - startMs;
    if (gapMs <= GAP_WARNING_MS) return;
    issues.push({
      level: "warning",
      code: "long-gap",
      message: `Nepokrit razmik ${(gapMs / 1000).toFixed(2)} s (${(startMs / 1000).toFixed(2)}–${(endMs / 1000).toFixed(2)} s).`,
      fix: { kind: "fill-gap", label: "Zapolni razmik", fromMs: startMs, toMs: endMs },
    });
  };

  for (const note of notes) {
    if (note.timeMs > coveredUntil) recordGap(coveredUntil, note.timeMs);
    coveredUntil = Math.max(coveredUntil, note.timeMs + note.holdMs);
  }
  if (durationMs > coveredUntil) recordGap(coveredUntil, durationMs);

  // Raw presses are passed separately so an interrupted event stays visible
  // even if a later editor version changes tap/hold classification.
  if (presses.some((press) => press.interrupted) && !issues.some((issue) => issue.code === "interrupted")) {
    issues.push({
      level: "warning",
      code: "interrupted",
      message: "Vsaj en pritisk je bil prekinjen; preveri osnutek pred izvozom.",
      fix: { kind: "confirm-press", label: "Potrdi vse" },
    });
  }

  return issues;
}

export function compileRecording(
  presses: readonly RawPress[],
  songId: SongId,
  settings: RecorderSettings,
  countdownLeadMs: number,
  durationMs: number,
): CompiledRecording {
  const capturedEvents: TimedCaptureEvent[] = [...presses]
    .map((press, captureIndex) => ({ press, captureIndex }))
    .sort((first, second) => first.press.downMs - second.press.downMs || first.captureIndex - second.captureIndex)
    .map(({ press, captureIndex }) => {
      const rawDuration = Math.max(0, press.upMs - press.downMs);
      const timeMs = quantizeMs(press.downMs + settings.timingOffsetMs);
      const endMs = quantizeMs(press.upMs + settings.timingOffsetMs);
      const kind = rawDuration >= settings.holdThresholdMs ? "hold" : "tap";
      return {
        sourcePressId: press.id,
        timeMs,
        holdMs: kind === "hold" ? Math.max(CHART_TICK_MS, endMs - timeMs) : 0,
        kind,
        interrupted: Boolean(press.interrupted),
        captureIndex,
        downMs: press.downMs,
        upMs: press.upMs,
        source: press.source,
        laneOverride: press.lane,
      };
    });
  const timedEvents = snapKeyboardTapChords(capturedEvents);

  const notes = assignRecorderLanes(timedEvents, songId, settings.laneSeed);
  const issues = validateNotes(notes, presses, countdownLeadMs, durationMs);
  const ready = !issues.some((issue) => issue.level === "error");
  let encodedChart: string | null = null;
  if (ready) {
    try {
      encodedChart = encodeRecorderChart(notes);
    } catch {
      encodedChart = null;
    }
  }

  return { notes, issues, encodedChart, ready: ready && encodedChart !== null };
}

function fillerPressId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `filler-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Turn a suggested fix into new raw presses. Compiled times are converted back
 * through the global offset, and both ends stay on the chart grid so the note
 * lands exactly where the issue said it would.
 */
export function applyRecorderFix(
  presses: readonly RawPress[],
  fix: RecorderFix,
  settings: RecorderSettings,
): RawPress[] {
  const rawTimeOf = (compiledMs: number) => quantizeMs(compiledMs) - settings.timingOffsetMs;

  switch (fix.kind) {
    case "drop-note":
      return presses.filter((press) => press.id !== fix.pressId);
    case "make-tap":
      return presses.map((press) => (
        press.id === fix.pressId ? { ...press, upMs: press.downMs } : press
      ));
    case "trim-hold":
      return presses.map((press) => (
        press.id === fix.pressId
          ? { ...press, upMs: press.downMs + Math.max(0, quantizeMs(fix.holdMs)) }
          : press
      ));
    case "move-note":
      return presses.map((press) => {
        if (press.id !== fix.pressId) return press;
        const downMs = rawTimeOf(fix.timeMs);
        return { ...press, downMs, upMs: downMs + Math.max(0, press.upMs - press.downMs) };
      });
    case "confirm-press":
      return presses.map((press) => (
        !fix.pressId || press.id === fix.pressId ? { ...press, interrupted: undefined } : press
      ));
    case "fill-gap": {
      // Same shape as the chart builder's safety pass: split the hole into
      // even pieces short enough that none of them warns again.
      const spanMs = fix.toMs - fix.fromMs;
      const pieces = Math.max(2, Math.ceil(spanMs / GAP_FILL_TARGET_MS));
      const added: RawPress[] = [];
      for (let index = 1; index < pieces; index += 1) {
        const downMs = rawTimeOf(fix.fromMs + (spanMs * index) / pieces);
        added.push({ id: fillerPressId(), downMs, upMs: downMs, source: "filler" });
      }
      return [...presses, ...added];
    }
  }
}

export type RecorderRepair = {
  presses: RawPress[];
  applied: number;
  remainingErrors: number;
  remainingWarnings: number;
};

function pressesUnchanged(before: readonly RawPress[], after: readonly RawPress[]) {
  if (before.length !== after.length) return false;
  return before.every((press, index) => {
    const next = after[index];
    return press.id === next.id
      && press.downMs === next.downMs
      && press.upMs === next.upMs
      && Boolean(press.interrupted) === Boolean(next.interrupted);
  });
}

function fixKey(fix: RecorderFix) {
  return JSON.stringify(fix);
}

/**
 * Apply every suggested fix in turn, recompiling in between because one repair
 * moves the ground under the next one. Fixes that change nothing are retired so
 * an unsatisfiable one can never spin the loop.
 */
export function repairRecording(
  presses: readonly RawPress[],
  songId: SongId,
  settings: RecorderSettings,
  countdownLeadMs: number,
  durationMs: number,
  options: { includeWarnings?: boolean } = {},
): RecorderRepair {
  let current = [...presses];
  let applied = 0;

  const exhausted = new Set<string>();
  for (let round = 0; round < 200; round += 1) {
    const { issues } = compileRecording(current, songId, settings, countdownLeadMs, durationMs);
    const target = issues.find((issue) => (
      issue.fix
      && (issue.level === "error" || options.includeWarnings === true)
      && !exhausted.has(fixKey(issue.fix))
    ))?.fix;
    if (!target) break;
    const next = applyRecorderFix(current, target, settings);
    if (pressesUnchanged(current, next)) {
      exhausted.add(fixKey(target));
      continue;
    }
    current = next;
    applied += 1;
  }

  const { issues } = compileRecording(current, songId, settings, countdownLeadMs, durationMs);
  return {
    presses: current,
    applied,
    remainingErrors: issues.filter((issue) => issue.level === "error").length,
    remainingWarnings: issues.filter((issue) => issue.level === "warning").length,
  };
}

export function defaultHoldThresholdMs(bpm: number) {
  return Math.round(Math.max(350, (60_000 / bpm) * 0.75) / 10) * 10;
}

export function storageKey(songId: SongId) {
  return `glasbeni-atlas:beatmap-recorder:v1:${songId}`;
}
