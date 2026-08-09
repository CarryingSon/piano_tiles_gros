#!/usr/bin/env python3
"""Build the note charts for the "Ujemi ritem" game from the sung vocal line.

Offline authoring tool — the site never runs this. Tiles follow the singer:
every sung syllable is a candidate tile, a held note becomes a hold tile, and
the lane comes from the pitch, so the board rises and falls with the melody.

    # 1. isolate the voice (once per master)
    python3 -m demucs --two-stems=vocals -d mps -o stems master.mp3

    # 2. build the charts
    python3 scripts/build-charts.py --preview \
        mrfy=master.mp3:stems/htdemucs/master/vocals.wav ... > src/data/charts.ts

Each argument is `<id>=<master>:<vocal stem>[:<accompaniment stem>]`. The
master sets the tempo grid, the vocal stem provides syllables and holds, and
the accompaniment fills vocal rests. When the third path is omitted, the
script looks for Demucs' sibling `no_vocals.wav` and only falls back to the
master if it is absent. Add --preview to render, for every song, an mp3 with a
click on each tile so placement can be checked by ear.

The playable audio in public/media/game is encoded from the same masters with a
LEAD-second silent head so the countdown runs before the first bar:

    ffmpeg -i master.mp3 -af "aformat=channel_layouts=mono,adelay=3000" \
           -ac 1 -ar 44100 -c:a aac -b:a 64k -movflags +faststart out.m4a

Chart times already include that lead. Requires ffmpeg and numpy.
"""
import argparse
import json
from pathlib import Path
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

HOLD_MIN_SECONDS = 0.35
HOLD_MIN_BEATS = 0.75
PITCH_TOLERANCE = 0.60  # semitones (60 cents), wide enough for vocal vibrato
PEAK_RATE = 2.4         # early-song ceiling; it rises progressively to 3.2/s
FILL_AFTER = 1.50       # fill a vocal rest longer than this many seconds
MAX_EMPTY_GAP = 1.90    # post-countdown playable time without a tile/hold

# The semantic form is known from the three released songs; analysis below
# re-snaps these approximate starts to the rebuilt beat grid. Keeping the type
# sequence prevents a dense verse from being mislabeled as a chorus merely
# because both happen to contain the same number of syllables.
SECTION_GUIDES = {
    "mrfy": [("intro", 0), ("verse", 24), ("chorus", 48), ("verse", 84),
             ("chorus", 120), ("bridge", 184), ("chorus", 198), ("outro", 216)],
    "kokosy": [("intro", 0), ("verse", 26), ("chorus", 68), ("verse", 108),
               ("chorus", 148), ("bridge", 190), ("outro", 207)],
    "tabu": [("intro", 0), ("verse", 25), ("chorus", 56), ("verse", 84),
             ("chorus", 124), ("verse", 160), ("bridge", 192),
             ("chorus", 202), ("outro", 234)],
}


# ---------------------------------------------------------------- audio input

def decode(path, sr=SR):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def frame(x):
    if len(x) < N_FFT:
        x = np.pad(x, (0, N_FFT - len(x)))
    n = 1 + (len(x) - N_FFT) // HOP
    # A strided view avoids copying roughly 150 MB for a four-minute song.
    return np.lib.stride_tricks.sliding_window_view(x, N_FFT)[:n * HOP:HOP]


def z(v):
    s = v.std()
    return (v - v.mean()) / s if s > 1e-9 else v * 0


def moving_average(values, width):
    """Centred moving average with edge values preserved."""
    width = max(1, int(width))
    if width == 1 or len(values) < 2:
        return np.asarray(values, dtype=float)
    left = width // 2
    right = width - 1 - left
    padded = np.pad(np.asarray(values, dtype=float), (left, right), mode="edge")
    return np.convolve(padded, np.ones(width) / width, mode="valid")


def rolling_median(values, width):
    """Small median smoother used for pitch, without a scipy dependency."""
    width = max(1, int(width) | 1)
    if width == 1 or len(values) < 2:
        return np.asarray(values, dtype=float)
    radius = width // 2
    padded = np.pad(np.asarray(values, dtype=float), radius, mode="edge")
    windows = np.lib.stride_tricks.sliding_window_view(padded, width)
    return np.median(windows, axis=1)


def pitch_track(frames, window):
    """Autocorrelation f0 and confidence, calculated in bounded chunks."""
    lo, hi = int(SR / 700), int(SR / 75)
    pitch = np.zeros(len(frames), dtype=np.float32)
    confidence = np.zeros(len(frames), dtype=np.float32)
    for first in range(0, len(frames), 512):
        chunk = frames[first:first + 512] * window
        padded = np.fft.rfft(chunk, n=2 * N_FFT, axis=1)
        acf = np.fft.irfft(np.abs(padded) ** 2, axis=1)[:, :N_FFT]
        acf /= acf[:, :1] + 1e-9
        candidates = acf[:, lo:hi]
        peak = candidates.max(axis=1)
        # Prefer the first lag close to the maximum. It is much less prone to
        # octave jumps than a naked argmax on a bright vowel.
        lag = lo + np.argmax(candidates >= (0.85 * peak)[:, None], axis=1)
        rows = np.arange(len(lag))
        pitch[first:first + len(lag)] = 12 * np.log2(
            np.maximum(SR / lag, 1) / 55.0)
        confidence[first:first + len(lag)] = acf[rows, lag]
    return pitch, confidence


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

def vocal_notes(stem, beat):
    """Return syllable nuclei and stable sung durations.

    Flux still supplies the consonant attack, but the timestamp moves forward
    to the first energetic, stably voiced frame: the vowel nucleus listeners
    actually synchronise with. A sustain then ends at the first real energy or
    f0 break. Weak flux peaks inside that span are vibrato/harmonics and are
    suppressed; a strong re-articulation remains a separate syllable.
    """
    x = decode(stem)
    f = frame(x)
    window = np.hanning(N_FFT).astype(np.float32)
    spec = np.abs(np.fft.rfft(f * window, axis=1))
    rms = np.sqrt(np.einsum("ij,ij->i", f, f) / N_FFT)

    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    vocal_band = (freqs >= 180) & (freqs <= 5000)
    band = np.log1p(500 * spec[:, vocal_band])
    flux = np.maximum(np.diff(band, axis=0, prepend=band[:1]), 0).sum(axis=1)
    band_energy = np.sqrt(np.mean(spec[:, vocal_band] ** 2, axis=1))
    energy = moving_average(band_energy, int(0.035 * FPS))

    semitones, voicing = pitch_track(f, window)
    floor = max(np.percentile(energy, 25) * 0.65,
                np.percentile(energy, 95) * 0.055)
    raw_voiced = (energy > floor) & (voicing > 0.42)
    voiced = close_gaps(raw_voiced, int(0.065 * FPS))

    pitch_centre = rolling_median(semitones, int(0.075 * FPS))
    stable_share = moving_average(voiced.astype(float), int(0.075 * FPS))
    stable = (voiced & (stable_share >= 0.72)
              & (np.abs(semitones - pitch_centre) <= PITCH_TOLERANCE))

    # Adaptive flux peaks are possible consonants. Unlike the old fixed 23 ms
    # shift, `vowel_frame` checks both the energy rise and stable f0. ONSET_LAG
    # remains a conservative fallback for breathy/unpitched vowel attacks.
    local = moving_average(flux, int(FPS))
    spread = max(float(flux.std()), 1e-9)
    refractory = max(1, int(0.115 * FPS))
    attacks = []
    last = -10 ** 9
    for i in range(1, len(flux) - 1):
        voiced_soon = voiced[i:min(len(voiced), i + int(0.13 * FPS) + 1)].any()
        if not voiced_soon:
            continue
        if (flux[i] > local[i] + 0.50 * spread
                and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1]
                and i - last >= refractory):
            attacks.append(i)
            last = i

    # A phrase onset can be soft enough to have no sharp spectral peak.
    for i in range(1, len(voiced)):
        if voiced[i] and not voiced[i - 1] \
                and all(abs(i - attack) > refractory for attack in attacks):
            attacks.append(i)
    attacks.sort()
    if not attacks:
        return [], {"attacks": 0, "suppressed_inside_holds": 0,
                    "median_vowel_shift_ms": 0.0, "p90_vowel_shift_ms": 0.0,
                    "stable_hold_candidates": 0}

    def vowel_frame(attack):
        stop = min(len(energy), attack + max(2, int(0.13 * FPS)) + 1)
        peak = float(energy[attack:stop].max())
        threshold = max(floor * 1.12, peak * 0.48)
        eligible = np.flatnonzero(stable[attack:stop]
                                  & (energy[attack:stop] >= threshold))
        if len(eligible):
            # Take the beginning of the energetic stable region, not its peak;
            # choosing the peak would land well inside slow vowels.
            return attack + int(eligible[0])
        return min(len(energy) - 1, attack + int(round(ONSET_LAG * FPS)))

    events = [[attack, vowel_frame(attack), float(flux[attack])]
              for attack in attacks]
    # Two consonant peaks may converge onto the same vowel nucleus. Keep only
    # the stronger attack inside a 70 ms nucleus refractory.
    merged = []
    nucleus_refractory = int(0.07 * FPS)
    for event in events:
        if merged and event[1] - merged[-1][1] <= nucleus_refractory:
            if event[2] > merged[-1][2]:
                merged[-1] = event
        else:
            merged.append(event)
    events = merged

    strengths = np.array([event[2] for event in events])
    strong_gate = float(np.percentile(strengths, 55))
    very_strong_gate = float(np.percentile(strengths, 82))
    hold_threshold = max(HOLD_MIN_SECONDS, HOLD_MIN_BEATS * beat)
    bad_tolerance = max(1, int(0.065 * FPS))
    notes = []
    suppressed = 0
    stable_candidates = 0
    k = 0

    while k < len(events):
        attack, start, strength = events[k]
        reference_stop = min(len(semitones), start + max(2, int(0.12 * FPS)))
        reference_values = semitones[start:reference_stop][stable[start:reference_stop]]
        reference = float(np.median(reference_values)) if len(reference_values) \
            else float(pitch_centre[start])

        # A fresh consonant is a new syllable when it also creates an energy /
        # voicing break, or when the following vowel moves to another pitch.
        # Flux strength alone is deliberately insufficient: bright harmonics
        # and vibrato can produce a very large peak inside one held vowel.
        articulation = len(stable)
        for later_attack, later_start, later_strength in events[k + 1:]:
            before = energy[max(start, later_start - int(0.08 * FPS)):later_start + 1]
            neighbourhood = energy[max(start, later_start - int(0.16 * FPS)):
                                   min(len(energy), later_start + int(0.05 * FPS) + 1)]
            valley_ratio = (float(before.min()) / (float(neighbourhood.max()) + 1e-9)
                            if len(before) and len(neighbourhood) else 1.0)
            consonant = raw_voiced[
                max(start, later_attack - int(0.045 * FPS)):later_start + 1]
            voiced_share = float(consonant.mean()) if len(consonant) else 1.0
            later_stop = min(len(semitones), later_start + max(2, int(0.12 * FPS)))
            later_values = semitones[later_start:later_stop][stable[later_start:later_stop]]
            later_reference = float(np.median(later_values)) if len(later_values) \
                else float(pitch_centre[later_start])
            pitch_changed = abs(later_reference - reference) > PITCH_TOLERANCE
            clear_break = valley_ratio < 0.78 or voiced_share < 0.58
            softer_break = valley_ratio < 0.90 or voiced_share < 0.82
            if ((later_strength >= strong_gate and (clear_break or pitch_changed))
                    or (later_strength >= very_strong_gate
                        and (softer_break or pitch_changed))):
                articulation = later_start
                break

        last_good = start
        bad = 0
        j = start
        while j + 1 < min(len(stable), articulation):
            j += 1
            # Follow the short rolling f0 centre rather than a single raw ACF
            # frame. This admits natural vibrato while the centre itself must
            # remain inside the explicit ±60-cent band.
            good = (energy[j] > floor and voiced[j]
                    and abs(float(pitch_centre[j]) - reference) <= PITCH_TOLERANCE)
            if good:
                last_good = j
                bad = 0
            else:
                bad += 1
                if bad > bad_tolerance:
                    break

        length = max(1 / FPS, (last_good - start + 1) / FPS)
        pitch_values = semitones[start:last_good + 1][voiced[start:last_good + 1]]
        pitch = float(np.median(pitch_values)) if len(pitch_values) else reference
        segment = slice(start, last_good + 1)
        metadata = {
            "vowel_time": start / FPS + FRAME_CENTRE,
            "energy_above_floor_pct": float(np.mean(energy[segment] > floor) * 100),
            "pitch_within_60c_pct": float(np.mean(
                voiced[segment] & (np.abs(pitch_centre[segment] - reference)
                                   <= PITCH_TOLERANCE)) * 100),
        }
        notes.append([start / FPS + FRAME_CENTRE, length, pitch, strength,
                      "vocal", metadata])

        if length >= hold_threshold:
            stable_candidates += 1
            next_k = k + 1
            while next_k < len(events) and events[next_k][1] <= last_good:
                next_k += 1
            suppressed += next_k - k - 1
            k = next_k
        else:
            k += 1

    shifts = np.array([(event[1] - event[0]) / FPS * 1000 for event in events])
    diagnostics = {
        "attacks": len(events),
        "suppressed_inside_holds": suppressed,
        "median_vowel_shift_ms": float(np.median(shifts)),
        "p90_vowel_shift_ms": float(np.percentile(shifts, 90)),
        "stable_hold_candidates": stable_candidates,
        "stable_voiced_frames_pct": float(stable.mean() * 100),
    }
    return notes, diagnostics


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


def late_ease(time, duration):
    """First third flat, then a smooth ease-in towards the finale."""
    progress = np.clip(time / max(duration, 1e-9), 0.0, 1.0)
    return float(np.clip((progress - 1 / 3) / (2 / 3), 0.0, 1.0) ** 1.7)


def playable_min_gap(time, beat, duration):
    early = max(0.22, 0.42 * beat)
    late = max(0.16, 0.28 * beat)
    return early + (late - early) * late_ease(time, duration)


def cap_density(notes, duration, hold_threshold, window=2.0):
    """Thin busy passages with a ceiling that opens up late in the song.

    One forward pass over a trailing window. A note that would breach the cap
    is dropped, unless it is long enough to carry a hold — then the softest
    plain tap already inside the window makes way for it instead.
    """
    accepted = []
    for note in notes:
        rate = PEAK_RATE + 0.8 * late_ease(note[0], duration)
        allowed = max(1, round(rate * window))
        recent = [n for n in accepted if note[0] - n[0] < window]
        if len(recent) < allowed:
            accepted.append(note)
            continue
        if note[1] < hold_threshold:
            continue
        taps = [n for n in recent if n[1] < hold_threshold]
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


def accompaniment_features(path):
    """Compact onset/pitch tracks for instrumental-rest placement."""
    x = decode(path)
    f = frame(x)
    window = np.hanning(N_FFT).astype(np.float32)
    spec = np.abs(np.fft.rfft(f * window, axis=1))
    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)

    logspec = np.log1p(600 * spec)
    flux = np.maximum(np.diff(logspec, axis=0, prepend=logspec[:1]), 0.0)
    low = flux[:, (freqs >= 55) & (freqs < 250)].sum(axis=1)
    melodic = flux[:, (freqs >= 250) & (freqs < 2500)].sum(axis=1)
    bright = flux[:, (freqs >= 2500) & (freqs < 8000)].sum(axis=1)
    onset = np.maximum(z(low) + 0.8 * z(melodic) + 0.35 * z(bright), 0.0)

    # The strongest low/mid-frequency ridge is a useful approximation of the
    # leading instrument. It need not be a transcription-quality f0: lane
    # smoothing below turns it into coherent board motion, and low-confidence
    # frames fall back to neighbouring melody positions.
    pitch_band = (freqs >= 80) & (freqs <= 2200)
    band_freqs = freqs[pitch_band]
    weighted = spec[:, pitch_band] / np.sqrt(np.maximum(band_freqs, 1))[None, :]
    peak_bin = np.argmax(weighted, axis=1)
    peak = weighted[np.arange(len(weighted)), peak_bin]
    baseline = np.mean(weighted, axis=1) + 1e-9
    confidence = peak / baseline
    pitch = 12 * np.log2(np.maximum(band_freqs[peak_bin], 1) / 55.0)
    pitch = rolling_median(pitch, int(0.07 * FPS))
    return {"onset": onset, "pitch": pitch, "confidence": confidence,
            "duration": len(x) / SR}


def instrument_event(target, start, end, beat, features):
    """Move a grid target to a nearby instrumental attack and read its pitch."""
    centre = int(round((target - FRAME_CENTRE) * FPS))
    radius = max(2, int(max(0.07, 0.16 * beat) * FPS))
    first = max(0, centre - radius)
    last = min(len(features["onset"]), centre + radius + 1)
    if first >= last:
        index = int(np.clip(centre, 0, len(features["onset"]) - 1))
    else:
        index = first + int(np.argmax(features["onset"][first:last]))
    time = float(np.clip(index / FPS + FRAME_CENTRE, start + 0.04, end - 0.04))
    pitch = float(features["pitch"][index])
    confidence = float(features["confidence"][index])
    if confidence < 2.0:
        # Very flat spectra (drums/noise) get a stable middle-board fallback.
        pitch = 25.0
    attack = float(features["onset"][index])
    metadata = {"grid_target": target, "spectral_confidence": confidence}
    return [time, 0.0, pitch, attack, -1, "instrumental", metadata]


def merge_activity(notes, duration):
    """Union of time spans in which a detected singer is active."""
    spans = sorted((max(0.0, n[0] - 0.08), min(duration, n[0] + n[1] + 0.12))
                   for n in notes)
    merged = []
    for start, end in spans:
        if not merged or start - merged[-1][1] > 0.18:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return merged


def extend_beat_grid(beats, beat, duration):
    if len(beats):
        phase = float(beats[0])
    else:
        phase = 0.0
    first = int(np.floor((0.0 - phase) / beat)) - 1
    last = int(np.ceil((duration - phase) / beat)) + 1
    return phase + np.arange(first, last + 1) * beat


def fill_vocal_rests(raw_vocal, duration, beats, beat, features):
    """Sparse accompaniment tiles wherever the singer rests for >1.5 s."""
    activity = merge_activity(raw_vocal, duration)
    gaps = []
    cursor = 0.0
    for start, end in activity:
        if start - cursor > FILL_AFTER:
            gaps.append((cursor, start))
        cursor = max(cursor, end)
    if duration - cursor > FILL_AFTER:
        gaps.append((cursor, duration))

    grid = extend_beat_grid(beats, beat, duration)
    stride = max(2, int(np.ceil(1.15 / beat)))
    notes = []
    for start, end in gaps:
        inside = grid[(grid >= start + min(0.45, 0.55 * beat))
                      & (grid <= end - min(0.32, 0.45 * beat))]
        if not len(inside):
            inside = np.array([(start + end) / 2])
        # Pick every Nth beat, but centre the selection so neither edge is left
        # with a two-second dead zone.
        chosen = inside[::stride]
        if len(chosen) and end - chosen[-1] > MAX_EMPTY_GAP:
            chosen = np.append(chosen, inside[-1])
        for target in chosen:
            notes.append(instrument_event(float(target), start, end, beat, features))
    return notes, gaps


def empty_gaps(notes, duration):
    """Uncovered intervals; a running hold counts as active gameplay."""
    gaps = []
    covered_until = 0.0
    for note in sorted(notes, key=lambda n: (n[0], n[4])):
        if note[0] > covered_until:
            gaps.append((covered_until, note[0]))
        covered_until = max(covered_until, note[0] + note[1])
    if duration > covered_until:
        gaps.append((covered_until, duration))
    return gaps


def close_empty_gaps(notes, duration, beat, features):
    """Safety pass guaranteeing no post-countdown empty run exceeds 1.9 s."""
    added = []
    for start, end in empty_gaps(notes, duration):
        length = end - start
        if length <= MAX_EMPTY_GAP:
            continue
        pieces = int(np.ceil(length / MAX_EMPTY_GAP))
        for index in range(1, pieces):
            target = start + length * index / pieces
            added.append(instrument_event(target, start, end, beat, features))
    return sorted(notes + added, key=lambda n: (n[0], n[4])), added


def build(master, stem, accompaniment, seed):
    mix = decode(master)
    env = mix_features(mix)
    bpm = global_tempo(env)
    beats = track_beats(env, bpm)
    beat = float(np.median(np.diff(beats)))
    duration = len(mix) / SR
    hold_threshold = max(HOLD_MIN_SECONDS, HOLD_MIN_BEATS * beat)

    raw, vocal_diagnostics = vocal_notes(stem, beat)
    for note, snapped in zip(raw, snap([n[0] for n in raw], beats, beat)):
        note[5]["snap_offset_ms"] = (snapped - note[5]["vowel_time"]) * 1000
        note[0] = snapped
    raw.sort(key=lambda note: note[0])

    # Thin close syllables just enough for a thumb. The gap eases from the old
    # value to a denser but still human 0.16/0.28-beat floor in the final third.
    kept = []
    for note in raw:
        min_gap = playable_min_gap(note[0], beat, duration)
        if kept and note[0] - kept[-1][0] < min_gap:
            previous = kept[-1]
            sustained = note[1] >= hold_threshold
            was_sustained = previous[1] >= hold_threshold
            if sustained and not was_sustained:
                kept[-1] = note                       # prefer the note we can hold
            elif sustained == was_sustained and note[3] > previous[3]:
                kept[-1] = note                       # otherwise the harder attack
            continue
        kept.append(note)

    kept = cap_density(kept, duration, hold_threshold)

    notes = []
    for k, note in enumerate(kept):
        start, length, pitch, attack, source, metadata = note
        hold = 0.0
        if length >= hold_threshold:
            room = (kept[k + 1][0] - start - 0.08) if k + 1 < len(kept) \
                else duration - start
            # No fixed musical cap: the tail follows the measured vowel until
            # its energy/f0 break (bounded only by the two-character encoding).
            hold = float(min(length, room, 10.23))
            if hold < hold_threshold:
                hold = 0.0
        notes.append([start, hold, pitch, attack, -1, source, metadata])

    features = accompaniment_features(accompaniment)
    instrumental, vocal_rests = fill_vocal_rests(raw, duration, beats, beat, features)
    notes = sorted(notes + instrumental, key=lambda n: n[0])
    notes, safety_notes = close_empty_gaps(notes, duration, beat, features)

    # Lane from pitch, constrained by interval size. Small melodic motion may
    # stay in place or move one lane, never teleport across the whole board.
    vocal_pitches = np.array([n[2] for n in notes if n[5] == "vocal"])
    lane_pitches = vocal_pitches if len(vocal_pitches) else np.array([n[2] for n in notes])
    low, high = np.percentile(lane_pitches, (10, 90))
    if high - low < 1e-6:
        high = low + 1.0
    previous_lane = None
    previous_pitch = None
    for note in notes:
        lane = int(np.clip(round((note[2] - low) / (high - low) * (LANES - 1)),
                           0, LANES - 1))
        if previous_lane is not None:
            interval = abs(note[2] - previous_pitch)
            max_step = 1 if interval < 4.0 else 2
            lane = int(np.clip(lane, previous_lane - max_step, previous_lane + max_step))
        note[4] = lane
        previous_lane, previous_pitch = lane, note[2]

    # Strong vocal taps receive simultaneous partners. Per-third budgets and
    # gates deliberately favour the final third, alongside its denser taps.
    extra = []
    doubles_by_third = [0, 0, 0]
    for third, (budget, percentile, spacing_beats) in enumerate(
            ((2, 92, 10), (5, 86, 7), (12, 76, 4))):
        candidates = [n for n in notes
                      if n[5] == "vocal" and n[1] == 0
                      and min(2, int(n[0] / max(duration, 1e-9) * 3)) == third]
        if not candidates:
            continue
        gate = float(np.percentile([n[3] for n in candidates], percentile))
        last_double = -1e9
        for note in candidates:
            if doubles_by_third[third] >= budget or note[3] < gate:
                continue
            index = notes.index(note)
            previous_gap = note[0] - notes[index - 1][0] if index else 1e9
            next_gap = notes[index + 1][0] - note[0] if index + 1 < len(notes) else 1e9
            if min(previous_gap, next_gap) < 0.35 * beat:
                continue
            if note[0] - last_double < spacing_beats * beat:
                continue
            partner = note[4] + 2 if note[4] < 2 else note[4] - 2
            extra.append([note[0], 0.0, note[2], note[3], partner,
                          "accent", {"partner_of": note[4]}])
            doubles_by_third[third] += 1
            last_double = note[0]

    notes = sorted(notes + extra, key=lambda n: (n[0], n[4]))
    playable_gaps = empty_gaps(notes, duration)
    max_gap = max((end - start for start, end in playable_gaps), default=0.0)
    holds = [n for n in notes if n[1] > 0]
    click_offsets = [abs(n[6].get("snap_offset_ms", 0.0)) for n in notes
                     if n[5] == "vocal"]
    hold_energy = [n[6]["energy_above_floor_pct"] for n in holds]
    hold_pitch = [n[6]["pitch_within_60c_pct"] for n in holds]
    vocal_diagnostics.update({
        "vocal_clicks_within_35ms_pct": float(
            np.mean(np.array(click_offsets) <= 35.0) * 100) if click_offsets else 0.0,
        "median_click_to_vowel_ms": float(np.median(click_offsets)) if click_offsets else 0.0,
        "p95_click_to_vowel_ms": float(np.percentile(click_offsets, 95)) if click_offsets else 0.0,
        "hold_energy_coverage_pct": float(np.mean(hold_energy)) if hold_energy else 0.0,
        "hold_pitch_within_60c_pct": float(np.mean(hold_pitch)) if hold_pitch else 0.0,
        "hold_threshold_seconds": hold_threshold,
    })
    return {"duration": duration, "bpm": bpm, "beat": beat, "notes": notes,
            "doubles": sum(doubles_by_third), "doubles_by_third": doubles_by_third,
            "beats": beats, "vocal_rests": vocal_rests,
            "instrumental_notes": len(instrumental) + len(safety_notes),
            "safety_notes": len(safety_notes), "max_gap": max_gap,
            "diagnostics": vocal_diagnostics,
            "accompaniment": str(accompaniment), "seed": seed}


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
    for note in notes:
        start, hold, _pitch, _attack, lane = note[:5]
        tick = int(round((start + LEAD) / TICK))
        out.append(b32(tick - previous))
        previous = tick
        if hold > 0:
            out.append(HOLD[lane] + b32(min(1023, round(hold / TICK)), 2))
        else:
            out.append(TAP[lane])
    return "".join(out)


def decode_encoded(code):
    """Python mirror of decodeChart(), used to audit the generated payload."""
    notes = []
    tick = 0
    delta = 0
    index = 0
    while index < len(code):
        char = code[index]
        digit = BASE32.find(char)
        if digit >= 0:
            delta = delta * 32 + digit
            index += 1
            continue
        tap = TAP.find(char)
        held = HOLD.find(char)
        if tap < 0 and held < 0:
            raise ValueError(f"invalid chart character {char!r} at {index}")
        lane = tap if tap >= 0 else held
        tick += delta
        delta = 0
        hold = 0.0
        if held >= 0:
            if index + 2 >= len(code):
                raise ValueError("truncated hold duration")
            high = BASE32.find(code[index + 1])
            low = BASE32.find(code[index + 2])
            if high < 0 or low < 0:
                raise ValueError("invalid hold duration")
            hold = (high * 32 + low) * TICK
            index += 2
        notes.append([tick * TICK, hold, lane])
        index += 1
    if delta:
        raise ValueError("chart ends with an unterminated delta")
    return notes


def canonical_audit(notes, duration):
    """Assert encode/decode identity and gameplay invariants on tick values."""
    code = encode(notes)
    decoded = decode_encoded(code)
    canonical = [[time - LEAD, hold, 0.0, 0.0, lane]
                 for time, hold, lane in decoded]
    if encode(canonical) != code:
        raise AssertionError("encode -> decode -> encode is not canonical")
    if len(decoded) != len(notes):
        raise AssertionError("decode changed the note count")

    groups = {}
    for time, hold, lane in decoded:
        groups.setdefault(round(time / TICK), []).append((hold, lane))
    for tick, chord in groups.items():
        if len(chord) > 1 and any(hold > 0 for hold, _lane in chord):
            raise AssertionError(f"mixed tap/hold chord at tick {tick}")

    for index, (time, hold, _lane) in enumerate(decoded):
        if hold <= 0:
            continue
        end = time + hold
        for later_time, _later_hold, _later_lane in decoded[index + 1:]:
            if later_time >= end - TICK / 2:
                break
            if later_time > time + TICK / 2:
                raise AssertionError(
                    f"note onset {later_time:.2f}s falls inside hold ending {end:.2f}s")

    master_notes = [[time - LEAD, hold, 0.0, 0.0, lane]
                    for time, hold, lane in decoded]
    gaps = empty_gaps(master_notes, duration)
    longest = max(gaps, key=lambda gap: gap[1] - gap[0]) if gaps else (0.0, 0.0)
    return {"code": code, "decoded": decoded, "roundtrip": True,
            "decoded_count": len(decoded), "decoded_max_score": max_score(decoded),
            "max_gap": longest[1] - longest[0], "max_gap_interval": longest}


def max_score(notes):
    """Mirror of maxPossibleScore() in src/data/game.ts.

    Taps pay 100, a hold carried to the end pays 300 plus the 10 % grace bonus,
    both times the combo multiplier of their position in the chart.
    """
    return int(sum((330 if note[1] > 0 else 100) * min(4, 1 + combo // 10)
                   for combo, note in enumerate(notes, start=1)))


def derive_sections(chart, song_id=None):
    """Infer contiguous musical sections from vocal rests and tile density."""
    duration = chart["duration"] + LEAD
    beat = chart["beat"]
    bar = max(1.5, 4 * beat)
    min_section = max(2 * bar, 6.0)
    notes = chart["notes"]
    vocal_times = np.array([n[0] + LEAD for n in notes if n[5] == "vocal"])
    all_times = np.array([n[0] + LEAD for n in notes if n[5] != "accent"])

    def snap_bar(time):
        return float(np.clip(round(time / bar) * bar, min_section, duration - min_section))

    # Intro ends at the first bar after the melody becomes continuously active,
    # rather than at an isolated pickup syllable.
    intro_end = min_section
    if len(vocal_times):
        for time in vocal_times:
            if np.sum((vocal_times >= time) & (vocal_times < time + 10.0)) >= 7:
                intro_end = snap_bar(time)
                break
    intro_end = max(min_section, intro_end)
    outro_start = snap_bar(duration - max(bar, 4.0))
    if outro_start - intro_end < min_section:
        outro_start = duration - min_section

    candidates = []
    for start, end in chart["vocal_rests"]:
        length = end - start
        if length < FILL_AFTER:
            continue
        candidates.append((snap_bar(start + LEAD), 3.0 + length))
        candidates.append((snap_bar(end + LEAD), 3.0 + length))

    # Density change across two-bar windows catches verse/chorus boundaries
    # even where the singer never fully rests.
    grid = np.arange(intro_end + min_section, outro_start, bar)
    densities = []
    for time in grid:
        left = np.sum((all_times >= time - 2 * bar) & (all_times < time)) / (2 * bar)
        right = np.sum((all_times >= time) & (all_times < time + 2 * bar)) / (2 * bar)
        densities.append(abs(float(right - left)))
    scale = float(np.median(densities)) + 1e-6 if densities else 1.0
    candidates.extend((snap_bar(float(time)), float(change / scale))
                      for time, change in zip(grid, densities))

    guide = SECTION_GUIDES.get(song_id)
    if guide:
        starts = [0.0]
        for _section_type, approximate in guide[1:]:
            target = float(np.clip(round(approximate / bar) * bar,
                                   starts[-1] + bar, duration - 0.75 * bar))
            nearby = [(time, score) for time, score in candidates
                      if abs(time - target) <= 0.60 * bar
                      and time > starts[-1] + 0.75 * bar]
            if nearby:
                # Prefer a measured rest/density edge, but moving a full bar
                # is more expensive than a merely stronger local contrast.
                target = max(nearby, key=lambda item:
                             item[1] - 2.0 * abs(item[0] - target) / bar)[0]
            starts.append(target)

        total_ms = int(round(duration * 1000))
        result = []
        for index, (section_type, _approximate) in enumerate(guide):
            start = starts[index]
            end = starts[index + 1] if index + 1 < len(starts) else duration
            count = np.sum((all_times >= start) & (all_times < end))
            vocal = np.sum((vocal_times >= start) & (vocal_times < end))
            start_ms = 0 if index == 0 else result[-1]["endMs"]
            end_ms = total_ms if index == len(guide) - 1 else int(round(end * 1000))
            result.append({
                "type": section_type,
                "startMs": start_ms,
                "endMs": end_ms,
                "density": float(count / max(end - start, 1e-9)),
                "vocalShare": float(vocal / max(count, 1)),
            })
        return result

    boundaries = [0.0, intro_end, outro_start, duration]
    for time, _score in sorted(candidates, key=lambda item: item[1], reverse=True):
        if len(boundaries) >= 10:
            break
        if time <= intro_end or time >= outro_start:
            continue
        trial = sorted(boundaries + [time])
        if min(np.diff(trial)) >= min_section:
            boundaries = trial
    boundaries = sorted(set(round(value, 3) for value in boundaries))

    segments = []
    interior_densities = []
    for start, end in zip(boundaries, boundaries[1:]):
        count = np.sum((all_times >= start) & (all_times < end))
        vocal = np.sum((vocal_times >= start) & (vocal_times < end))
        density = float(count / max(end - start, 1e-9))
        vocal_share = float(vocal / max(count, 1))
        segments.append({"start": start, "end": end, "density": density,
                         "vocal_share": vocal_share})
        if start > 0 and end < duration:
            interior_densities.append(density)
    chorus_gate = (float(np.percentile(interior_densities, 58))
                   if interior_densities else 0.0)

    for index, segment in enumerate(segments):
        if index == 0:
            segment["type"] = "intro"
        elif index == len(segments) - 1:
            segment["type"] = "outro"
        elif index == len(segments) - 2:
            segment["type"] = "chorus"
        elif segment["vocal_share"] < 0.42:
            segment["type"] = "bridge"
        elif segment["density"] >= chorus_gate:
            segment["type"] = "chorus"
        else:
            segment["type"] = "verse"

    # Adjacent blocks with the same inferred character are one section.
    merged = []
    for segment in segments:
        if merged and merged[-1]["type"] == segment["type"]:
            merged[-1]["end"] = segment["end"]
            merged[-1]["density"] = max(merged[-1]["density"], segment["density"])
            merged[-1]["vocal_share"] = max(merged[-1]["vocal_share"],
                                             segment["vocal_share"])
        else:
            merged.append(segment.copy())

    result = []
    total_ms = int(round(duration * 1000))
    cursor = 0
    for index, segment in enumerate(merged):
        end_ms = total_ms if index == len(merged) - 1 else int(round(segment["end"] * 1000))
        result.append({"type": segment["type"], "startMs": cursor, "endMs": end_ms,
                       "density": segment["density"],
                       "vocalShare": segment["vocal_share"]})
        cursor = end_ms
    return result


def sections_source(rows):
    lines = [
        '// Generated by scripts/build-charts.py --sections-output — do not edit by hand.',
        '',
        'import type { SongId } from "@/data/game";',
        '',
        'export type SectionType = "intro" | "verse" | "chorus" | "bridge" | "outro";',
        '',
        'export type SongSection = {',
        '  type: SectionType;',
        '  /** Milliseconds into the shipped audio file, countdown head included. */',
        '  startMs: number;',
        '  endMs: number;',
        '};',
        '',
        '/** Contiguous boundaries inferred from vocal rests and local tile density. */',
        'export const songSections = {',
    ]
    for row in rows:
        lines.append(f'  {row["id"]}: [')
        for section in row["sections"]:
            lines.append(
                f'    {{ type: "{section["type"]}", startMs: {section["startMs"]}, '
                f'endMs: {section["endMs"]} }},')
        lines.append('  ],')
    lines.extend(['} satisfies Record<SongId, SongSection[]>;', ''])
    return "\n".join(lines)


def preview(song_id, master, notes, output_dir="."):
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
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    out = output_dir / f"preview-{song_id}.mp3"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", "44100", "-ac", "1",
                    "-i", "-", "-b:a", "128k", str(out)],
                   input=audio.tobytes(), check=True)
    return str(out.resolve())


HEADER = '''// Generated by scripts/build-charts.py — do not edit by hand.
//
// One string per song, decoded by decodeChart() in src/data/game.ts. Tiles
// follow the sung line: a syllable is a tap, a held note is a hold, and vocal
// rests use sparse accompaniment taps. The lane follows pitch. Times are
// absolute seconds in the shipped audio file (the 3 s countdown head is
// already included).

export type ChartData = {
  /** Length of the audio file in seconds. */
  duration: number;
  /** Detected tempo, kept for reference and for the results screen. */
  bpm: number;
  /** Encoded note list: base32 tick delta + lane char (w–z tap, W–Z hold+2). */
  chart: string;
};
'''


def parse_track(spec):
    try:
        song_id, paths = spec.split("=", 1)
    except ValueError as error:
        raise ValueError(f"expected <id>=<master>:<vocals>[:<accompaniment>], got {spec!r}") \
            from error
    parts = paths.split(":")
    if len(parts) not in (2, 3):
        raise ValueError(f"expected two or three audio paths in {spec!r}")
    master, stem = map(Path, parts[:2])
    if len(parts) == 3:
        accompaniment = Path(parts[2])
    else:
        sibling = stem.with_name("no_vocals.wav")
        accompaniment = sibling if sibling.exists() else master
        if accompaniment == master:
            sys.stderr.write(
                f"warning: {song_id}: no accompaniment stem supplied; using master for fills\n")
    for label, path in (("master", master), ("vocal stem", stem),
                        ("accompaniment stem", accompaniment)):
        if not path.is_file():
            raise FileNotFoundError(f"{song_id}: {label} not found: {path}")
    return song_id, str(master), str(stem), str(accompaniment)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tracks", nargs="+",
                        help="<id>=<master>:<vocals>[:<accompaniment>]")
    parser.add_argument("--preview", action="store_true",
                        help="render an audible click-track preview per song")
    parser.add_argument("--preview-dir", default=".",
                        help="directory for --preview files (default: current directory)")
    parser.add_argument("--sections-output",
                        help="also write the inferred song-sections.ts file")
    parser.add_argument("--report", help="write machine-readable analysis JSON")
    options = parser.parse_args(argv)

    seeds = {"mrfy": 0x51A7, "kokosy": 0x2C41, "tabu": 0x7E33}
    rows = []

    for spec in options.tracks:
        song_id, master, stem, accompaniment = parse_track(spec)
        chart = build(master, stem, accompaniment, seeds.get(song_id, 1))
        notes = chart["notes"]
        holds = sum(1 for n in notes if n[1] > 0)
        audit = canonical_audit(notes, chart["duration"])
        code = audit["code"]
        times = np.array([n[0] for n in notes])
        total = chart["duration"] + LEAD
        buckets = np.histogram(times, bins=np.arange(0, chart["duration"] + 30, 30))[0] / 30
        thirds = [sum(1 for n in notes
                      if min(2, int(n[0] / max(chart["duration"], 1e-9) * 3)) == third)
                  for third in range(3)]
        hold_lengths = [n[1] for n in notes if n[1] > 0]
        sources = {source: sum(1 for n in notes if n[5] == source)
                   for source in ("vocal", "instrumental", "accent")}
        sections = derive_sections(chart, song_id)
        preview_path = None
        if options.preview:
            preview_path = preview(song_id, master, notes, options.preview_dir)

        diagnostics = chart["diagnostics"]
        gap_start, gap_end = audit["max_gap_interval"]

        sys.stderr.write(
            f"{song_id}: {total:.1f}s bpm {chart['bpm']:.2f} notes {len(notes)} "
            f"({len(notes)/chart['duration']:.2f}/s) holds {holds} ({holds/len(notes)*100:.0f}%) "
            f"avg hold {np.mean(hold_lengths) if hold_lengths else 0:.2f}s "
            f"doubles {chart['doubles']} {chart['doubles_by_third']} chars {len(code)}\n"
            f"    sources vocal {sources['vocal']} instrumental {sources['instrumental']} "
            f"accent {sources['accent']}; tiles/third {'/'.join(map(str, thirds))}\n"
            f"    longest empty gap {audit['max_gap']:.2f}s at "
            f"{gap_start + LEAD:.2f}-{gap_end + LEAD:.2f}s shipped; "
            f"safety fills {chart['safety_notes']}\n"
            f"    vowel QA <=35ms {diagnostics['vocal_clicks_within_35ms_pct']:.1f}% "
            f"median {diagnostics['median_click_to_vowel_ms']:.1f}ms "
            f"p95 {diagnostics['p95_click_to_vowel_ms']:.1f}ms; "
            f"suppressed-in-hold {diagnostics['suppressed_inside_holds']}\n"
            f"    hold QA energy {diagnostics['hold_energy_coverage_pct']:.1f}% "
            f"f0-within-60c {diagnostics['hold_pitch_within_60c_pct']:.1f}% "
            f"threshold {diagnostics['hold_threshold_seconds']:.2f}s\n"
            f"    tiles/s per 30 s: {' '.join(f'{b:.1f}' for b in buckets)}\n"
            f"    decoded {audit['decoded_count']} maxScore {audit['decoded_max_score']} "
            f"canonical roundtrip OK\n")
        if preview_path:
            sys.stderr.write(f"    preview -> {preview_path}\n")

        rows.append({
            "id": song_id, "count": len(notes), "holds": holds,
            "average_hold_seconds": float(np.mean(hold_lengths)) if hold_lengths else 0.0,
            "bpm": chart["bpm"], "duration": total, "code": code, "notes": notes,
            "chart": chart, "audit": audit, "sections": sections,
            "tiles_by_third": thirds, "sources": sources, "preview": preview_path,
        })

    print(HEADER)
    print("export const songCharts = {")
    for row in rows:
        print(f"  // {row['count']} notes ({row['holds']} holds), {row['bpm']:.2f} BPM")
        print(f"  {row['id']}: {{")
        print(f"    duration: {row['duration']:.2f},")
        print(f"    bpm: {row['bpm']:.2f},")
        print(f'    chart: "{row["code"]}",')
        print("  },")
    print("} satisfies Record<string, ChartData>;")

    if options.sections_output:
        sections_path = Path(options.sections_output)
        sections_path.parent.mkdir(parents=True, exist_ok=True)
        sections_path.write_text(sections_source(rows), encoding="utf-8")
        sys.stderr.write(f"\nsections -> {sections_path.resolve()}\n")

    if options.report:
        report = {"generator": "scripts/build-charts.py", "countdownLead": LEAD,
                  "songs": []}
        for row in rows:
            diagnostics = row["chart"]["diagnostics"]
            gap_start, gap_end = row["audit"]["max_gap_interval"]
            report["songs"].append({
                "id": row["id"], "duration": row["duration"], "bpm": row["bpm"],
                "beatSeconds": row["chart"]["beat"], "noteCount": row["count"],
                "holdCount": row["holds"],
                "averageHoldSeconds": row["average_hold_seconds"],
                "sourceCounts": row["sources"], "tilesByThird": row["tiles_by_third"],
                "doublesByThird": row["chart"]["doubles_by_third"],
                "longestEmptyGapSeconds": row["audit"]["max_gap"],
                "longestEmptyGapShipped": [gap_start + LEAD, gap_end + LEAD],
                "maxScore": row["audit"]["decoded_max_score"],
                "decodedNoteCount": row["audit"]["decoded_count"],
                "canonicalRoundtrip": row["audit"]["roundtrip"],
                "vocalQA": diagnostics,
                "preview": row["preview"],
                "accompaniment": row["chart"]["accompaniment"],
                "sections": [{key: value for key, value in section.items()
                              if key in ("type", "startMs", "endMs")}
                             for section in row["sections"]],
            })
        report_path = Path(options.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n",
                               encoding="utf-8")
        sys.stderr.write(f"report -> {report_path.resolve()}\n")

    # submit_leaderboard_score keeps its own copy of these numbers and rejects
    # anything above them, so a new chart is only half-deployed until the SQL moves.
    sys.stderr.write("\nUpdate submit_leaderboard_score in supabase/migrations with:\n")
    sys.stderr.write("  v_max_score\n")
    for row in rows:
        sys.stderr.write(
            f"    WHEN '{row['id']}' THEN {row['audit']['decoded_max_score']}\n")
    sys.stderr.write("  v_note_count\n")
    for row in rows:
        sys.stderr.write(f"    WHEN '{row['id']}' THEN {row['audit']['decoded_count']}\n")


if __name__ == "__main__":
    main()
