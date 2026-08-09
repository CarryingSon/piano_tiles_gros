#!/usr/bin/env python3
"""Build the note charts for the "Ujemi ritem" game from the sung vocal line.

Offline authoring tool — the site never runs this. Tiles follow the singer:
every sung syllable is a candidate tile, a held note becomes a hold tile, and
the lane comes from the pitch, so the board rises and falls with the melody.

    # 1. isolate the voice (once per master)
    python3 -m demucs --two-stems=vocals -d mps -o stems master.mp3

    # 2. build the charts
    python3 scripts/build-charts.py \
        mrfy=master.mp3:stems/htdemucs/master/vocals.wav ... > src/data/charts.ts

Each argument is `<id>=<master>:<vocal stem>`. The master sets the tempo grid,
the stem provides the notes. Add --preview to also render, for every song, an
mp3 with a click on each tile so the placement can be checked by ear.

The playable audio in public/media/game is encoded from the same masters with a
LEAD-second silent head so the countdown runs before the first bar:

    ffmpeg -i master.mp3 -af "aformat=channel_layouts=mono,adelay=3000" \
           -ac 1 -ar 44100 -c:a aac -b:a 64k -movflags +faststart out.m4a

Chart times already include that lead. Requires ffmpeg and numpy.
"""
import subprocess
import sys
import numpy as np

SR = 22050
N_FFT = 2048
HOP = 256
FPS = SR / HOP
# Analysis frames start at index*HOP but a Hanning window weights the middle,
# so an event detected in a frame really happened half a window later. Without
# this the whole chart lands ~46 ms early, measured against a fine-grained
# energy envelope.
FRAME_CENTRE = N_FFT / (2 * SR)
# Spectral flux fires on the consonant, but a singer's beat is felt on the
# vowel that follows it. Measured against a fine-grained energy envelope, that
# is a further 23 ms; without it every tile sits slightly ahead of the voice.
ONSET_LAG = 0.023

LEAD = 3.0            # silent head encoded into the playable audio (seconds)
TICK = 0.01           # chart time resolution (seconds)
LANES = 4

HOLD_MIN = 0.34       # shortest sung note that may become a hold tile
HOLD_SHARE = 0.22     # roughly this fraction of tiles should be holds
PEAK_RATE = 2.4       # no two-second window may exceed this many tiles/s


# ---------------------------------------------------------------- audio input

def decode(path, sr=SR):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def frame(x):
    n = 1 + (len(x) - N_FFT) // HOP
    return x[np.arange(N_FFT)[None, :] + HOP * np.arange(n)[:, None]]


def z(v):
    s = v.std()
    return (v - v.mean()) / s if s > 1e-9 else v * 0


# ------------------------------------------------------------------ the pulse

def mix_features(x):
    """Onset envelope of the full mix — used only to find the tempo grid."""
    f = frame(x) * np.hanning(N_FFT).astype(np.float32)
    spec = np.abs(np.fft.rfft(f, axis=1))
    logspec = np.log1p(1000.0 * spec)
    flux = np.maximum(np.diff(logspec, axis=0, prepend=logspec[:1]), 0.0)
    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    env = (z(flux[:, freqs < 250].sum(axis=1))
           + 0.7 * z(flux[:, (freqs >= 250) & (freqs < 2000)].sum(axis=1))
           + 0.4 * z(flux[:, freqs >= 2000].sum(axis=1)))
    return np.maximum(env - np.percentile(env, 35), 0.0)


def global_tempo(env, lo=70.0, hi=180.0, step=0.02):
    best = None
    e = z(env)
    for bpm in np.arange(lo, hi + step, step):
        period = 60.0 / bpm * FPS
        n = int((len(e) - 1) / period)
        if n < 16:
            continue
        k = np.arange(n)
        pos = np.arange(0.0, period, 1.0)[:, None] + k[None, :] * period
        i0 = np.floor(pos).astype(int)
        frac = pos - i0
        val = (e[i0] * (1 - frac) + e[np.minimum(i0 + 1, len(e) - 1)] * frac).mean(axis=1)
        j = int(np.argmax(val))
        if best is None or val[j] > best[0]:
            best = (float(val[j]), float(bpm))
    return best[1]


def track_beats(env, bpm):
    """Ellis dynamic-programming beat tracker."""
    period = 60.0 / bpm * FPS
    o = np.maximum(z(env), 0.0)
    lags = np.arange(int(np.round(-2 * period)), int(np.round(-period / 2)) + 1)
    penalty = -120.0 * (np.log(-lags / period) ** 2)

    score = np.zeros(len(o))
    back = np.zeros(len(o), dtype=int)
    for n in range(len(o)):
        idx = n + lags
        ok = idx >= 0
        if not ok.any():
            score[n], back[n] = o[n], -1
            continue
        cand = score[idx[ok]] + penalty[ok]
        j = int(np.argmax(cand))
        score[n] = o[n] + cand[j]
        back[n] = idx[ok][j]

    tail = int(len(o) - period)
    n = int(np.argmax(score[tail:]) + tail) if tail > 0 else int(np.argmax(score))
    beats = []
    while n >= 0:
        beats.append(n)
        n = back[n]
    return np.array(beats[::-1]) / FPS + FRAME_CENTRE


# ------------------------------------------------------------------ the voice

def vocal_notes(stem):
    """Sung notes as (start, length, pitch in semitones, attack strength).

    Onsets and sustains are measured separately on purpose. Vibrato and
    consonants produce a flurry of spectral peaks inside one held note, so
    taking "note ends where the next peak starts" collapses every long note to
    a fraction of a second. Instead a note runs until the voice stops or until
    the next *strong* attack.
    """
    x = decode(stem)
    f = frame(x)
    window = np.hanning(N_FFT).astype(np.float32)
    spec = np.abs(np.fft.rfft(f * window, axis=1))
    rms = np.sqrt((f ** 2).mean(axis=1))

    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    band = np.log1p(500 * spec[:, (freqs >= 200) & (freqs <= 5000)])
    flux = np.maximum(np.diff(band, axis=0, prepend=band[:1]), 0).sum(axis=1)

    # pitch by autocorrelation; take the lowest lag that is nearly as strong as
    # the best one, otherwise a vibrato peak reads an octave too high
    padded = np.fft.rfft(f * window, n=2 * N_FFT, axis=1)
    acf = np.fft.irfft(np.abs(padded) ** 2, axis=1)[:, :N_FFT]
    acf /= (acf[:, :1] + 1e-9)
    lo, hi = int(SR / 700), int(SR / 75)
    window_acf = acf[:, lo:hi]
    lag = lo + np.argmax(window_acf > (0.85 * window_acf.max(axis=1))[:, None], axis=1)
    voicing = acf[np.arange(len(lag)), lag]
    semitones = 12 * np.log2(np.maximum(SR / lag, 1) / 55.0)

    floor = max(np.percentile(rms, 25) * 0.6, np.percentile(rms, 95) * 0.06)
    voiced = (rms > floor) & (voicing > 0.42)
    voiced = close_gaps(voiced, int(0.07 * FPS))

    # adaptive onset threshold, plus a refractory so one syllable fires once
    half = int(0.5 * FPS)
    cumulative = np.cumsum(np.insert(flux, 0, 0))
    local = np.array([(cumulative[min(len(flux), i + half)] - cumulative[max(0, i - half)])
                      / (min(len(flux), i + half) - max(0, i - half)) for i in range(len(flux))])
    spread = flux.std()
    refractory = int(0.14 * FPS)

    starts = []
    last = -10 ** 9
    for i in range(1, len(flux) - 1):
        if not voiced[i]:
            continue
        if flux[i] > local[i] + 0.55 * spread and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1] \
                and i - last >= refractory:
            starts.append(i)
            last = i
    for i in range(1, len(voiced)):                 # a phrase beginning is a note too
        if voiced[i] and not voiced[i - 1] and all(abs(i - s) > refractory for s in starts):
            starts.append(i)
    starts.sort()
    if not starts:
        return []

    attack = np.array([flux[i] for i in starts])
    strong = {i for i, a in zip(starts, attack) if a >= np.percentile(attack, 45)}

    notes = []
    for k, i in enumerate(starts):
        stop = len(voiced) - 1
        for later in starts[k + 1:]:
            if later in strong:
                stop = later
                break
        j = i
        while j + 1 < stop and voiced[j + 1]:
            j += 1
        notes.append([i / FPS + FRAME_CENTRE + ONSET_LAG, (j - i + 1) / FPS,
                      float(np.median(semitones[i:j + 1])), float(flux[i])])
    return notes


def close_gaps(mask, gap):
    """Bridge short unvoiced dips so a consonant does not split a word."""
    out = mask.copy()
    i = 0
    while i < len(out):
        if not out[i]:
            j = i
            while j < len(out) and not out[j]:
                j += 1
            if i > 0 and j < len(out) and j - i <= gap:
                out[i:j] = True
            i = j
        else:
            i += 1
    return out


# ------------------------------------------------------------------ the chart

class Rng:
    """mulberry32 — deterministic so charts rebuild identically."""

    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next(self):
        self.s = (self.s + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.s
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


def cap_density(notes, window=2.0):
    """Thin the busiest passages down to PEAK_RATE tiles per second.

    One forward pass over a trailing window. A note that would breach the cap
    is dropped, unless it is long enough to carry a hold — then the softest
    plain tap already inside the window makes way for it instead.
    """
    allowed = max(1, round(PEAK_RATE * window))
    accepted = []
    for note in notes:
        recent = [n for n in accepted if note[0] - n[0] < window]
        if len(recent) < allowed:
            accepted.append(note)
            continue
        if note[1] < HOLD_MIN:
            continue
        taps = [n for n in recent if n[1] < HOLD_MIN]
        if taps:
            accepted.remove(min(taps, key=lambda n: n[3]))
            accepted.append(note)
    return accepted


def snap(times, beats, beat, tolerance=0.035):
    """Pull a note onto the sixteenth-note grid when it is already close."""
    out = []
    for t in times:
        i = int(np.clip(np.searchsorted(beats, t) - 1, 0, len(beats) - 1))
        step = beat / 4
        grid = beats[i] + round((t - beats[i]) / step) * step
        out.append(grid if abs(grid - t) <= tolerance else t)
    return out


def build(master, stem, seed):
    mix = decode(master)
    env = mix_features(mix)
    bpm = global_tempo(env)
    beats = track_beats(env, bpm)
    beat = float(np.median(np.diff(beats)))
    duration = len(mix) / SR

    raw = vocal_notes(stem)
    for note, snapped in zip(raw, snap([n[0] for n in raw], beats, beat)):
        note[0] = snapped

    # Thin the syllables down to something a thumb can follow. Long notes are
    # never dropped: they carry the melody and they are the hold tiles.
    min_gap = max(0.22, 0.42 * beat)
    kept = []
    for note in raw:
        if kept and note[0] - kept[-1][0] < min_gap:
            previous = kept[-1]
            sustained, was_sustained = note[1] >= HOLD_MIN, previous[1] >= HOLD_MIN
            if sustained and not was_sustained:
                kept[-1] = note                       # prefer the note we can hold
            elif sustained == was_sustained and note[3] > previous[3]:
                kept[-1] = note                       # otherwise the harder attack
            continue
        kept.append(note)

    # Cap the busiest passages. Songs differ wildly in how much the singer
    # crams in, and without this the densest thirty seconds of Tabu ran at
    # three tiles a second.
    kept = cap_density(kept)

    # Only the longest notes become holds, so the share stays comparable
    # between songs instead of following how sustained the singer happens to be.
    lengths = sorted((n[1] for n in kept), reverse=True)
    hold_gate = max(HOLD_MIN, 0.9 * beat)
    if lengths:
        wanted = lengths[min(len(lengths) - 1, int(len(lengths) * HOLD_SHARE))]
        hold_gate = max(hold_gate, wanted)

    notes = []
    for k, note in enumerate(kept):
        start, length, pitch, attack = note
        hold = 0.0
        if length >= hold_gate:
            room = (kept[k + 1][0] - start - 0.12) if k + 1 < len(kept) else length
            hold = float(min(min(length, room), 2.5 * beat))
            if hold < 0.5 * beat:                    # no room to hold before the next tile
                hold = 0.0
        notes.append([start, hold, pitch, attack])

    # lane from pitch: low notes left, high notes right
    pitches = np.array([n[2] for n in notes])
    edges = [np.percentile(pitches, q) for q in (25, 50, 75)]
    rng = Rng(seed)
    placed = []
    for note in notes:
        lane = int(np.searchsorted(edges, note[2]))
        if placed and lane == placed[-1]:
            lane = lane + 1 if lane < LANES - 1 else lane - 1
        placed.append(lane)
        note.append(lane)

    # a handful of two-at-once accents on the hardest-hit syllables
    attacks = np.array([n[3] for n in notes])
    accent_gate = np.percentile(attacks, 86)
    doubles = 0
    extra = []
    for k, note in enumerate(notes):
        if doubles >= 12 or note[1] > 0 or note[3] < accent_gate:
            continue
        if k == 0 or note[0] - notes[k - 1][0] < 0.6 * beat:
            continue
        if k + 1 < len(notes) and notes[k + 1][0] - note[0] < 0.6 * beat:
            continue
        if extra and note[0] - extra[-1][0] < 8 * beat:     # keep them special
            continue
        partner = note[4] + 2 if note[4] < 2 else note[4] - 2
        extra.append([note[0], 0.0, note[2], note[3], partner])
        doubles += 1

    notes = sorted(notes + extra, key=lambda n: (n[0], n[4]))
    return {"duration": duration, "bpm": bpm, "beat": beat, "notes": notes,
            "doubles": doubles, "beats": beats}


# ---------------------------------------------------------------- the encoder

BASE32 = "0123456789abcdefghijklmnopqrstuv"
TAP = "wxyz"
HOLD = "WXYZ"


def b32(n, width=0):
    n = int(n)
    s = ""
    while n:
        s = BASE32[n % 32] + s
        n //= 32
    s = s or "0"
    return s.rjust(width, "0") if width else s


def encode(notes):
    """<delta base32><lane char>; holds add a fixed 2-char base32 duration.

    A delta of zero is how two tiles land on the same beat.
    """
    out = []
    previous = 0
    for start, hold, _pitch, _attack, lane in notes:
        tick = int(round((start + LEAD) / TICK))
        out.append(b32(tick - previous))
        previous = tick
        if hold > 0:
            out.append(HOLD[lane] + b32(min(1023, round(hold / TICK)), 2))
        else:
            out.append(TAP[lane])
    return "".join(out)


def max_score(notes):
    """Mirror of maxPossibleScore() in src/data/game.ts.

    Taps pay 100, a hold carried to the end pays 300 plus the 10 % grace bonus,
    both times the combo multiplier of their position in the chart.
    """
    return int(sum((330 if note[1] > 0 else 100) * min(4, 1 + combo // 10)
                   for combo, note in enumerate(notes, start=1)))


def preview(song_id, master, notes):
    """Render master + a click on every tile, so placement can be judged by ear."""
    audio = decode(master, 44100).copy()
    click = (np.sin(2 * np.pi * 1400 * np.arange(int(0.03 * 44100)) / 44100)
             * np.linspace(1, 0, int(0.03 * 44100)) ** 2).astype(np.float32)
    for start, hold, *_ in notes:
        at = int(start * 44100)
        end = min(len(audio), at + len(click))
        if at < len(audio):
            audio[at:end] += 0.5 * click[:end - at]
        if hold > 0:                       # mark the release of a hold too
            at = int((start + hold) * 44100)
            end = min(len(audio), at + len(click))
            if at < len(audio):
                audio[at:end] += 0.25 * click[:end - at]
    audio = np.clip(audio, -1, 1)
    out = f"preview-{song_id}.mp3"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", "44100", "-ac", "1",
                    "-i", "-", "-b:a", "128k", out], input=audio.tobytes(), check=True)
    return out


HEADER = '''// Generated by scripts/build-charts.py — do not edit by hand.
//
// One string per song, decoded by decodeChart() in src/data/game.ts. Tiles
// follow the sung line: a syllable is a tap, a held note is a hold, and the
// lane comes from the pitch. Times are absolute seconds in the shipped audio
// file (the 3 s silent head that covers the countdown is already included).

export type ChartData = {
  /** Length of the audio file in seconds. */
  duration: number;
  /** Detected tempo, kept for reference and for the results screen. */
  bpm: number;
  /** Encoded note list: base32 tick delta + lane char (w–z tap, W–Z hold+2). */
  chart: string;
};
'''


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    want_preview = "--preview" in sys.argv
    seeds = {"mrfy": 0x51A7, "kokosy": 0x2C41, "tabu": 0x7E33}
    rows = []

    for arg in args:
        song_id, paths = arg.split("=", 1)
        master, stem = paths.rsplit(":", 1)
        chart = build(master, stem, seeds.get(song_id, 1))
        notes = chart["notes"]
        holds = sum(1 for n in notes if n[1] > 0)
        code = encode(notes)
        times = np.array([n[0] for n in notes])
        gaps = np.diff(times)
        total = chart["duration"] + LEAD
        buckets = np.histogram(times, bins=np.arange(0, chart["duration"] + 30, 30))[0] / 30

        sys.stderr.write(
            f"{song_id}: {total:.1f}s bpm {chart['bpm']:.2f} notes {len(notes)} "
            f"({len(notes)/chart['duration']:.2f}/s) holds {holds} ({holds/len(notes)*100:.0f}%) "
            f"doubles {chart['doubles']} chars {len(code)}\n"
            f"    gap min {gaps.min():.2f}s median {np.median(gaps):.2f}s\n"
            f"    tiles/s per 30 s: {' '.join(f'{b:.1f}' for b in buckets)}\n")
        if want_preview:
            sys.stderr.write(f"    preview -> {preview(song_id, master, notes)}\n")
        rows.append((song_id, len(notes), holds, chart["bpm"], total, code, notes))

    print(HEADER)
    print("export const songCharts = {")
    for song_id, count, holds, bpm, total, code, _ in rows:
        print(f"  // {count} notes ({holds} holds), {bpm:.2f} BPM")
        print(f"  {song_id}: {{")
        print(f"    duration: {total:.2f},")
        print(f"    bpm: {bpm:.2f},")
        print(f'    chart: "{code}",')
        print("  },")
    print("} satisfies Record<string, ChartData>;")

    # submit_leaderboard_score keeps its own copy of these numbers and rejects
    # anything above them, so a new chart is only half-deployed until the SQL moves.
    sys.stderr.write("\nUpdate submit_leaderboard_score in supabase/migrations with:\n")
    sys.stderr.write("  v_max_score\n")
    for song_id, *_, notes in rows:
        sys.stderr.write(f"    WHEN '{song_id}' THEN {max_score(notes)}\n")
    sys.stderr.write("  v_note_count\n")
    for song_id, count, *_ in rows:
        sys.stderr.write(f"    WHEN '{song_id}' THEN {count}\n")
