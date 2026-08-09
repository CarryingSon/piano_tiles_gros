#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SONG_IDS = ["mrfy", "kokosy", "tabu"];
const SECTION_TYPES = new Set(["intro", "verse", "chorus", "bridge", "outro"]);
const BASE32 = "0123456789abcdefghijklmnopqrstuv";
const TAP_LANES = "wxyz";
const HOLD_LANES = "WXYZ";
const TICK_SECONDS = 0.01;
const COUNTDOWN_LEAD_SECONDS = 3;
const MAX_UNCOVERED_GAP_SECONDS = 2;
const EPSILON = 1e-9;
const SECTION_END_TOLERANCE_MS = (TICK_SECONDS * 1000) / 2;

const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function fail(message) {
  errors.push(message);
}

function stripComments(value) {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n\r]*/g, "");
}

function parseNumberField(source, field, context) {
  const match = source.match(new RegExp(`\\b${field}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`));
  if (!match) throw new Error(`${context}: missing numeric \`${field}\``);
  return Number(match[1]);
}

function parseCharts(source) {
  const declaration = "export const songCharts = {";
  const start = source.indexOf(declaration);
  const end = source.indexOf("} satisfies", start + declaration.length);
  if (start < 0 || end < 0) throw new Error("charts.ts: could not locate songCharts object");

  const body = source.slice(start + declaration.length, end);
  const blockPattern = /\b([A-Za-z_$][\w$]*)\s*:\s*\{\s*duration\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*bpm\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*chart\s*:\s*"([^"\r\n]*)"\s*,?\s*\}\s*,?/g;
  const charts = new Map();

  for (const match of body.matchAll(blockPattern)) {
    const [, id, duration, bpm, code] = match;
    if (charts.has(id)) throw new Error(`charts.ts: duplicate song block \`${id}\``);
    charts.set(id, { id, duration: Number(duration), bpm: Number(bpm), code });
  }

  const residue = stripComments(body).replace(blockPattern, "").replace(/[\s,]/g, "");
  if (residue) throw new Error(`charts.ts: unparsed songCharts content: ${JSON.stringify(residue.slice(0, 80))}`);

  for (const id of SONG_IDS) {
    if (!charts.has(id)) fail(`charts.ts: missing song \`${id}\``);
  }
  for (const id of charts.keys()) {
    if (!SONG_IDS.includes(id)) fail(`charts.ts: unexpected song \`${id}\``);
  }

  return charts;
}

function decodeChart(id, code) {
  if (!code) throw new Error(`${id}: chart string is empty`);

  const notes = [];
  let tick = 0;
  let offset = 0;

  while (offset < code.length) {
    const deltaStart = offset;
    let delta = 0;

    while (offset < code.length) {
      const digit = BASE32.indexOf(code[offset]);
      if (digit < 0) break;
      delta = delta * 32 + digit;
      if (!Number.isSafeInteger(delta)) {
        throw new Error(`${id}: delta at character ${deltaStart} exceeds safe integer range`);
      }
      offset += 1;
    }

    if (offset === deltaStart) {
      throw new Error(`${id}: note at character ${offset} has no base32 delta`);
    }
    if (offset >= code.length) {
      throw new Error(`${id}: chart ends with a delta and no lane character`);
    }

    const laneCharacter = code[offset];
    const tapLane = TAP_LANES.indexOf(laneCharacter);
    const holdLane = HOLD_LANES.indexOf(laneCharacter);
    if (tapLane < 0 && holdLane < 0) {
      throw new Error(`${id}: invalid lane character ${JSON.stringify(laneCharacter)} at character ${offset}`);
    }
    offset += 1;

    tick += delta;
    if (!Number.isSafeInteger(tick)) {
      throw new Error(`${id}: absolute tick exceeds safe integer range`);
    }

    let holdTicks = 0;
    if (holdLane >= 0) {
      if (offset + 2 > code.length) {
        throw new Error(`${id}: hold at tick ${tick} is missing its two base32 duration digits`);
      }
      const high = BASE32.indexOf(code[offset]);
      const low = BASE32.indexOf(code[offset + 1]);
      if (high < 0 || low < 0) {
        throw new Error(`${id}: hold at tick ${tick} has an invalid two-digit duration`);
      }
      holdTicks = high * 32 + low;
      if (holdTicks === 0) fail(`${id}: hold at ${(tick * TICK_SECONDS).toFixed(2)}s has zero duration`);
      offset += 2;
    }

    notes.push({
      tick,
      time: tick * TICK_SECONDS,
      lane: tapLane >= 0 ? tapLane : holdLane,
      holdTicks,
      hold: holdTicks * TICK_SECONDS,
    });
  }

  return notes;
}

function base32(value, width = 0) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`cannot encode invalid base32 value ${value}`);
  }
  let remaining = value;
  let encoded = "";
  do {
    encoded = BASE32[remaining % 32] + encoded;
    remaining = Math.floor(remaining / 32);
  } while (remaining > 0);
  return encoded.padStart(width, "0");
}

function encodeChart(notes) {
  let previousTick = 0;
  let encoded = "";
  for (const note of notes) {
    encoded += base32(note.tick - previousTick);
    encoded += note.holdTicks > 0
      ? HOLD_LANES[note.lane] + base32(note.holdTicks, 2)
      : TAP_LANES[note.lane];
    previousTick = note.tick;
  }
  return encoded;
}

function parseScoring(source) {
  const match = source.match(/const scoring\s*=\s*\{([\s\S]*?)\}\s*as const/);
  if (!match) throw new Error("game.ts: could not locate scoring constants");
  const block = match[1];
  return {
    perfect: parseNumberField(block, "perfect", "game.ts scoring"),
    hold: parseNumberField(block, "hold", "game.ts scoring"),
    holdGraceBonus: parseNumberField(block, "holdGraceBonus", "game.ts scoring"),
    finaleBonus: parseNumberField(block, "finaleBonus", "game.ts scoring"),
    multiplierEvery: parseNumberField(block, "multiplierEvery", "game.ts scoring"),
    maxMultiplier: parseNumberField(block, "maxMultiplier", "game.ts scoring"),
  };
}

/** Mirrors finaleStartSeconds() in src/data/game.ts. */
function finaleStartSeconds(sections) {
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    if (sections[index].type === "chorus") return sections[index].startMs / 1000;
  }
  return Infinity;
}

function maximumScore(notes, scoring, finaleStart) {
  let total = 0;
  for (let index = 0; index < notes.length; index += 1) {
    const combo = index + 1;
    const multiplier = Math.min(
      scoring.maxMultiplier,
      1 + Math.floor(combo / scoring.multiplierEvery),
    ) * (notes[index].time >= finaleStart ? 1 + scoring.finaleBonus : 1);
    const base = notes[index].holdTicks > 0
      ? scoring.hold * (1 + scoring.holdGraceBonus)
      : scoring.perfect;
    total += base * multiplier;
  }
  return Math.floor(total);
}

function groupByTick(notes) {
  const groups = [];
  for (const note of notes) {
    const last = groups.at(-1);
    if (last?.tick === note.tick) last.notes.push(note);
    else groups.push({ tick: note.tick, notes: [note] });
  }
  return groups;
}

function validateChart(chart, notes) {
  const { id, duration, bpm, code } = chart;
  if (!Number.isFinite(duration) || duration <= COUNTDOWN_LEAD_SECONDS) {
    fail(`${id}: invalid duration ${duration}`);
  }
  if (!Number.isFinite(bpm) || bpm <= 0) fail(`${id}: invalid BPM ${bpm}`);
  if (encodeChart(notes) !== code) {
    fail(`${id}: encode(decode(chart)) differs from the generated chart string`);
  }
  if (notes.length === 0) {
    fail(`${id}: chart has no notes`);
    return { maxGap: duration - COUNTDOWN_LEAD_SECONDS, gapStart: COUNTDOWN_LEAD_SECONDS, gapEnd: duration };
  }

  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    const previous = notes[index - 1];
    if (previous && note.tick < previous.tick) {
      fail(`${id}: note ${index + 1} is earlier than note ${index}`);
    }
    if (note.lane < 0 || note.lane >= TAP_LANES.length) {
      fail(`${id}: note ${index + 1} has invalid lane ${note.lane}`);
    }
    if (note.time + EPSILON < COUNTDOWN_LEAD_SECONDS) {
      fail(`${id}: note ${index + 1} starts before the ${COUNTDOWN_LEAD_SECONDS}s countdown boundary`);
    }
    if (note.time > duration + EPSILON) {
      fail(`${id}: note ${index + 1} starts at ${note.time.toFixed(2)}s after duration ${duration.toFixed(2)}s`);
    }
    const end = note.time + note.hold;
    if (end > duration + EPSILON) {
      fail(`${id}: note ${index + 1} ends at ${end.toFixed(2)}s after duration ${duration.toFixed(2)}s`);
    }
  }

  const groups = groupByTick(notes);
  for (const group of groups) {
    if (group.notes.length > 2) {
      fail(`${id}: chord at ${(group.tick * TICK_SECONDS).toFixed(2)}s has ${group.notes.length} notes (maximum is 2)`);
    }
    const lanes = new Set(group.notes.map((note) => note.lane));
    if (lanes.size !== group.notes.length) {
      fail(`${id}: chord at ${(group.tick * TICK_SECONDS).toFixed(2)}s repeats a lane`);
    }
  }

  for (let index = 0; index < notes.length; index += 1) {
    const hold = notes[index];
    if (hold.holdTicks === 0) continue;
    const holdEndTick = hold.tick + hold.holdTicks;
    for (let later = index + 1; later < notes.length; later += 1) {
      const onset = notes[later];
      if (onset.tick >= holdEndTick) break;
      if (onset.tick > hold.tick) {
        fail(
          `${id}: note ${later + 1} at ${onset.time.toFixed(2)}s starts inside hold ${index + 1} `
          + `(${hold.time.toFixed(2)}–${(holdEndTick * TICK_SECONDS).toFixed(2)}s)`,
        );
      }
    }
  }

  let coveredUntil = COUNTDOWN_LEAD_SECONDS;
  let maxGap = 0;
  let gapStart = coveredUntil;
  let gapEnd = coveredUntil;
  const longGaps = [];

  function recordGap(start, end, kind) {
    const gap = end - start;
    if (gap > maxGap) {
      maxGap = gap;
      gapStart = start;
      gapEnd = end;
    }
    if (gap > MAX_UNCOVERED_GAP_SECONDS + EPSILON) {
      longGaps.push({ start, end, gap, kind });
    }
  }

  for (const group of groups) {
    const onset = group.tick * TICK_SECONDS;
    if (onset > coveredUntil) {
      recordGap(coveredUntil, onset, coveredUntil === COUNTDOWN_LEAD_SECONDS ? "opening" : "internal");
    }
    const groupEnd = Math.max(...group.notes.map((note) => note.time + note.hold));
    coveredUntil = Math.max(coveredUntil, groupEnd);
  }
  if (duration > coveredUntil) recordGap(coveredUntil, duration, "trailing");

  for (const gap of longGaps) {
    fail(
      `${id}: ${gap.kind} uncovered gameplay gap is ${gap.gap.toFixed(2)}s `
      + `(${gap.start.toFixed(2)}–${gap.end.toFixed(2)}s), above ${MAX_UNCOVERED_GAP_SECONDS.toFixed(2)}s`,
    );
  }

  return { maxGap, gapStart, gapEnd };
}

function extractArray(source, id) {
  const startMatch = new RegExp(`\\b${id}\\s*:\\s*\\[`).exec(source);
  if (!startMatch) throw new Error(`song-sections.ts: missing section array for \`${id}\``);
  const start = startMatch.index + startMatch[0].length;
  const end = source.indexOf("]", start);
  if (end < 0) throw new Error(`song-sections.ts: unterminated section array for \`${id}\``);
  return source.slice(start, end);
}

function parseSections(source, id) {
  const body = extractArray(source, id);
  const entryPattern = /\{\s*type\s*:\s*"([^"]+)"\s*,\s*startMs\s*:\s*([0-9]+)\s*,\s*endMs\s*:\s*([0-9]+)\s*,?\s*\}/g;
  const sections = [...body.matchAll(entryPattern)].map((match) => ({
    type: match[1],
    startMs: Number(match[2]),
    endMs: Number(match[3]),
  }));
  const residue = stripComments(body).replace(entryPattern, "").replace(/[\s,]/g, "");
  if (residue) {
    throw new Error(`${id}: unparsed song section content: ${JSON.stringify(residue.slice(0, 80))}`);
  }
  return sections;
}

function validateSections(chart, sections) {
  const { id, duration } = chart;
  if (sections.length === 0) {
    fail(`${id}: section map is empty`);
    return;
  }
  if (sections[0].startMs !== 0) {
    fail(`${id}: first section starts at ${sections[0].startMs}ms instead of 0ms`);
  }

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const previous = sections[index - 1];
    if (!SECTION_TYPES.has(section.type)) {
      fail(`${id}: section ${index + 1} has invalid type ${JSON.stringify(section.type)}`);
    }
    if (section.endMs <= section.startMs) {
      fail(`${id}: section ${index + 1} has non-positive range ${section.startMs}–${section.endMs}ms`);
    }
    if (previous && section.startMs !== previous.endMs) {
      fail(
        `${id}: sections ${index} and ${index + 1} are not contiguous `
        + `(${previous.endMs}ms then ${section.startMs}ms)`,
      );
    }
  }

  const expectedEndMs = Math.round(duration * 1000);
  const actualEndMs = sections.at(-1).endMs;
  if (Math.abs(actualEndMs - expectedEndMs) > SECTION_END_TOLERANCE_MS) {
    fail(
      `${id}: sections end at ${actualEndMs}ms; chart duration ends at ${expectedEndMs}ms `
      + `(tolerance ${SECTION_END_TOLERANCE_MS}ms)`,
    );
  }
}

function parseCaseValues(caseBody, label, migrationName) {
  const values = new Map();
  const casePattern = /WHEN\s+'([^']+)'\s+THEN\s+([0-9]+)/gi;
  for (const match of caseBody.matchAll(casePattern)) {
    const [, id, value] = match;
    if (values.has(id)) fail(`${migrationName}: duplicate ${label} CASE for \`${id}\``);
    values.set(id, Number(value));
  }
  for (const id of SONG_IDS) {
    if (!values.has(id)) fail(`${migrationName}: missing ${label} CASE for \`${id}\``);
  }
  for (const id of values.keys()) {
    if (!SONG_IDS.includes(id)) fail(`${migrationName}: unexpected ${label} CASE for \`${id}\``);
  }
  return values;
}

function readLatestMigration() {
  const directory = path.join(ROOT, "supabase", "migrations");
  const migrations = fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
  if (migrations.length === 0) throw new Error("supabase/migrations: no SQL migrations found");
  const name = migrations.at(-1);
  return { name, source: fs.readFileSync(path.join(directory, name), "utf8") };
}

function parseMigrationValues(name, source) {
  const functionStart = source.search(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.submit_leaderboard_score\s*\(/i);
  if (functionStart < 0) {
    throw new Error(`${name}: lexically latest migration does not replace public.submit_leaderboard_score`);
  }
  const functionSource = source.slice(functionStart);
  const cases = functionSource.match(
    /SELECT\s+CASE\s+p_song_id([\s\S]*?)END\s*,\s*CASE\s+p_song_id([\s\S]*?)END\s+INTO\s+v_max_score\s*,\s*v_note_count/i,
  );
  if (!cases) {
    throw new Error(`${name}: could not locate v_max_score/v_note_count CASE expressions`);
  }
  return {
    maxScores: parseCaseValues(cases[1], "v_max_score", name),
    noteCounts: parseCaseValues(cases[2], "v_note_count", name),
  };
}

function main() {
  let charts;
  let scoring;
  let sectionsSource;
  let migration;
  let migrationValues;

  try {
    charts = parseCharts(read("src/data/charts.ts"));
    scoring = parseScoring(read("src/data/game.ts"));
    sectionsSource = read("src/data/song-sections.ts");
  } catch (error) {
    console.error(`Game-data verification could not start: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    migration = readLatestMigration();
    migrationValues = parseMigrationValues(migration.name, migration.source);
  } catch (error) {
    fail(error.message);
  }

  const reports = [];
  for (const id of SONG_IDS) {
    const chart = charts.get(id);
    if (!chart) continue;

    try {
      const notes = decodeChart(id, chart.code);
      const gap = validateChart(chart, notes);
      const sections = parseSections(sectionsSource, id);
      validateSections(chart, sections);
      const noteCount = notes.length;
      const holdCount = notes.filter((note) => note.holdTicks > 0).length;
      const maxScore = maximumScore(notes, scoring, finaleStartSeconds(sections));

      if (migrationValues) {
        const sqlCount = migrationValues.noteCounts.get(id);
        const sqlScore = migrationValues.maxScores.get(id);
        if (sqlCount !== noteCount) {
          fail(`${migration.name}: ${id} v_note_count is ${sqlCount}; decoded chart has ${noteCount}`);
        }
        if (sqlScore !== maxScore) {
          fail(`${migration.name}: ${id} v_max_score is ${sqlScore}; decoded chart ceiling is ${maxScore}`);
        }
      }

      reports.push({ id, noteCount, holdCount, maxScore, gap });
    } catch (error) {
      fail(`${id}: ${error.message}`);
    }
  }

  console.log("Game data report");
  for (const report of reports) {
    const { id, noteCount, holdCount, maxScore, gap } = report;
    console.log(
      `  ${id.padEnd(7)} ${String(noteCount).padStart(4)} notes  ${String(holdCount).padStart(3)} holds  `
      + `maxScore ${String(maxScore).padStart(7)}  max gap ${gap.maxGap.toFixed(2)}s `
      + `(${gap.gapStart.toFixed(2)}–${gap.gapEnd.toFixed(2)}s)`,
    );
  }
  if (migration) console.log(`  migration ${migration.name}`);

  if (errors.length > 0) {
    console.error(`\nVerification failed with ${errors.length} problem${errors.length === 1 ? "" : "s"}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("\nVerification passed.");
}

main();
