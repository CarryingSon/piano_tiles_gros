#!/usr/bin/env python3
"""Build the note charts for the "Ujemi ritem" game from the master tracks.

Offline authoring tool — the site never runs this. It beat-tracks each song,
places notes on the detected grid with a density that follows the song's own
energy, and prints `src/data/charts.ts`.

    python3 scripts/build-charts.py mrfy=master/prjatucki.mp3 ... > src/data/charts.ts

The playable files in public/media/game are encoded from the same masters with
a LEAD-second silent head so the countdown runs before the first bar:

    ffmpeg -i master.mp3 -af "aformat=channel_layouts=mono,adelay=3000" \
           -ac 1 -ar 44100 -c:a aac -b:a 64k -movflags +faststart out.m4a

Chart times below already include that lead, so they are absolute positions in
the shipped audio file. Requires ffmpeg and numpy.
"""
import subprocess
import sys
import numpy as np

SR = 22050
HOP = 256
N_FFT = 1024
FPS = SR / HOP

LEAD = 3.0           # silent head encoded into the playable audio (seconds)
TICK = 0.01          # chart time resolution (seconds)
MIN_GAP = 0.16       # closest two consecutive notes may sit
LANES = 4


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def features(x):
    n = 1 + (len(x) - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(n)[:, None]
    frames = x[idx] * np.hanning(N_FFT).astype(np.float32)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    logspec = np.log1p(1000.0 * spec)
    flux = np.maximum(np.diff(logspec, axis=0, prepend=logspec[:1]), 0.0)
    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    low = flux[:, freqs < 250].sum(axis=1)
    mid = flux[:, (freqs >= 250) & (freqs < 2000)].sum(axis=1)
    high = flux[:, freqs >= 2000].sum(axis=1)
    env = z(low) + 0.7 * z(mid) + 0.4 * z(high)
    env = np.maximum(env - np.percentile(env, 35), 0.0)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    return env, rms


def z(v):
    s = v.std()
    return (v - v.mean()) / s if s > 1e-9 else v * 0


def global_tempo(env, lo=70.0, hi=180.0, step=0.02):
    best = None
    e = z(env)
    for bpm in np.arange(lo, hi + step, step):
        period = 60.0 / bpm * FPS
        nb = int((len(e) - 1) / period)
        if nb < 16:
            continue
        k = np.arange(nb)
        pos = np.arange(0.0, period, 1.0)[:, None] + k[None, :] * period
        i0 = np.floor(pos).astype(int)
        f = pos - i0
        val = (e[i0] * (1 - f) + e[np.minimum(i0 + 1, len(e) - 1)] * f).mean(axis=1)
        j = int(np.argmax(val))
        if best is None or val[j] > best[0]:
            best = (float(val[j]), float(bpm))
    return best[1]


def track_beats(env, bpm):
    """Ellis dynamic-programming beat tracker."""
    period = 60.0 / bpm * FPS
    o = z(env)
    o = np.maximum(o, 0.0)
    tightness = 120.0
    lo, hi = int(np.round(-2 * period)), int(np.round(-period / 2))
    lags = np.arange(lo, hi + 1)
    penalty = -tightness * (np.log(-lags / period) ** 2)

    score = np.zeros(len(o))
    back = np.zeros(len(o), dtype=int)
    for n in range(len(o)):
        idx = n + lags
        ok = idx >= 0
        if not ok.any():
            score[n] = o[n]
            back[n] = -1
            continue
        cand = score[idx[ok]] + penalty[ok]
        j = int(np.argmax(cand))
        score[n] = o[n] + cand[j]
        back[n] = idx[ok][j]

    # start backtracking from a strong late peak
    tail = int(len(o) - period)
    end = int(np.argmax(score[tail:]) + tail) if tail > 0 else int(np.argmax(score))
    beats = []
    n = end
    while n >= 0:
        beats.append(n)
        n = back[n]
    return np.array(beats[::-1]) / FPS


def sample(curve, t):
    i = np.clip(t * FPS, 0, len(curve) - 1.001)
    i0 = np.floor(i).astype(int)
    f = i - i0
    return curve[i0] * (1 - f) + curve[i0 + 1] * f


def smooth(v, win):
    if win < 2:
        return v
    k = np.ones(win) / win
    return np.convolve(v, k, mode="same")


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

    def pick(self, seq):
        return seq[int(self.next() * len(seq)) % len(seq)]


def build(path, seed):
    x = decode(path)
    duration = len(x) / SR
    env, rms = features(x)
    bpm = global_tempo(env)
    beats = track_beats(env, bpm)
    beat_len = float(np.median(np.diff(beats)))

    strength = sample(env, beats)
    loud = smooth(sample(rms, beats), 9)
    ceiling = np.percentile(loud, 92)
    level = np.clip(loud / max(ceiling, 1e-9), 0, 1.25)
    off_strength = sample(env, beats[:-1] + beat_len / 2)
    off_gate = np.percentile(env, 88)
    strong_gate = np.percentile(strength, 45)
    silence = np.percentile(rms, 55) * 0.35

    raw = []  # (time, kind, hold_len)
    spike = np.percentile(strength, 90)
    for i, t in enumerate(beats[:-1]):
        if sample(rms, np.array([t]))[0] < silence:
            continue
        lvl = level[i]
        beat_in_bar = i % 4
        if lvl < 0.34:
            take = beat_in_bar == 0                      # intro: one tap per bar
        elif lvl < 0.58:
            take = beat_in_bar % 2 == 0                  # verse: half notes
        else:
            take = True                                  # chorus: every beat
        if not take and strength[i] > spike:
            take = True
        if not take:
            continue

        hold = 0.0
        # a breathing point at the end of an 8-bar phrase becomes a hold
        if (lvl >= 0.45 and beat_in_bar == 0 and i % 32 == 24
                and i + 3 < len(beats) and strength[i + 1] < strong_gate):
            hold = beat_len * 1.5
        raw.append([float(t), "hold" if hold else "tap", hold])

        if hold:
            continue
        # eighth-note fills only in the loudest passages, and only on the
        # second half of a bar so the pulse stays readable
        if (lvl >= 0.82 and beat_in_bar in (1, 3) and i < len(off_strength)
                and off_strength[i] > off_gate):
            raw.append([float(t) + beat_len / 2, "tap", 0.0])

    # enforce spacing and drop notes swallowed by a hold
    min_gap = max(MIN_GAP, beat_len * 0.45)
    notes = []
    blocked_until = -1.0
    for t, kind, hold in raw:
        if t < blocked_until - 1e-6:
            continue
        if notes and t - notes[-1][0] < min_gap:
            continue
        notes.append([t, kind, hold])
        blocked_until = t + hold + min_gap if hold else t + min_gap

    # lane assignment: never repeat a lane back to back, keep runs comfortable
    rng = Rng(seed)
    recent = []
    for i, note in enumerate(notes):
        options = [l for l in range(LANES) if not recent[-1:] or l != recent[-1]]
        if len(recent) >= 3 and len(set(recent[-3:])) == 1:
            options = [l for l in options if l != recent[-1]]
        # after a fast pair, step to a neighbouring lane so it plays like a roll
        if i > 0 and note[0] - notes[i - 1][0] < 0.7 * beat_len and recent:
            near = [l for l in options if abs(l - recent[-1]) == 1]
            if near:
                options = near
        lane = rng.pick(options)
        note.append(lane)
        recent.append(lane)

    return {
        "duration": duration,
        "bpm": bpm,
        "beat": beat_len,
        "first": notes[0][0] if notes else 0.0,
        "notes": notes,
        "env": env,
        "beats": beats,
    }


def alignment(chart):
    """How far each note sits from the nearest onset-envelope peak (ms)."""
    env = chart["env"]
    peaks = []
    for i in range(1, len(env) - 1):
        if env[i] > env[i - 1] and env[i] >= env[i + 1] and env[i] > 0:
            peaks.append(i / FPS)
    peaks = np.array(peaks)
    times = np.array([n[0] for n in chart["notes"]])
    j = np.searchsorted(peaks, times)
    j = np.clip(j, 1, len(peaks) - 1)
    d = np.minimum(np.abs(times - peaks[j - 1]), np.abs(times - peaks[j]))
    return d * 1000


def density_profile(chart, window=30):
    times = np.array([n[0] for n in chart["notes"]])
    edges = np.arange(0, chart["duration"] + window, window)
    counts, _ = np.histogram(times, bins=edges)
    return " ".join(f"{c / window:.1f}" for c in counts)


B32 = "0123456789abcdefghijklmnopqrstuv"
TAP = "wxyz"
HOLD = "WXYZ"


def b32(n, width=0):
    n = int(n)
    s = ""
    while n:
        s = B32[n % 32] + s
        n //= 32
    s = s or "0"
    return s.rjust(width, "0") if width else s


def encode(notes):
    """<delta base32><lane char>; holds add a fixed 2-char base32 duration."""
    out = []
    prev = 0
    for t, kind, hold, lane in notes:
        tick = int(round((t + LEAD) / TICK))
        out.append(b32(tick - prev))
        prev = tick
        if kind == "hold":
            out.append(HOLD[lane] + b32(min(1023, round(hold / TICK)), 2))
        else:
            out.append(TAP[lane])
    return "".join(out)


HEADER = '''// Generated by scripts/build-charts.py — do not edit by hand.
//
// One string per song, decoded by decodeChart() in src/data/game.ts. Times are
// absolute seconds in the shipped audio file (the 3 s silent head that covers
// the countdown is already included).

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
    seeds = {"mrfy": 0x51A7, "kokosy": 0x2C41, "tabu": 0x7E33}
    rows = []
    for arg in sys.argv[1:]:
        song_id, path = arg.split("=", 1)
        chart = build(path, seeds.get(song_id, 1))
        notes = chart["notes"]
        holds = sum(1 for n in notes if n[1] == "hold")
        code = encode(notes)
        gaps = np.diff([n[0] for n in notes])
        align = alignment(chart)
        beat_dev = np.abs(np.diff(chart["beats"]) - chart["beat"]) * 1000
        total = chart["duration"] + LEAD
        sys.stderr.write(
            f"{song_id}: {total:.1f}s bpm {chart['bpm']:.2f} "
            f"beat {chart['beat']:.4f} notes {len(notes)} (holds {holds}) "
            f"first {chart['first'] + LEAD:.2f}s chars {len(code)} "
            f"gap min {gaps.min():.2f} med {np.median(gaps):.2f} "
            f"notes/s {len(notes)/chart['duration']:.2f}\n"
            f"    onset align: median {np.median(align):.0f}ms  p90 {np.percentile(align, 90):.0f}ms\n"
            f"    beat interval dev: median {np.median(beat_dev):.1f}ms max {beat_dev.max():.1f}ms\n"
            f"    notes/s per 30s: {density_profile(chart)}\n")
        rows.append((song_id, len(notes), holds, chart["bpm"], total, code))

    print(HEADER)
    print("export const songCharts = {")
    for song_id, count, holds, bpm, total, code in rows:
        print(f"  // {count} notes ({holds} holds), {bpm:.2f} BPM")
        print(f"  {song_id}: {{")
        print(f"    duration: {total:.2f},")
        print(f"    bpm: {bpm:.2f},")
        print(f'    chart: "{code}",')
        print("  },")
    print("} satisfies Record<string, ChartData>;")
