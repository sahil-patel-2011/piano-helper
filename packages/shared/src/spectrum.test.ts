import { describe, expect, it } from "vitest";
import { chordHeard, notePresence, type Spectrum } from "./spectrum.js";

const RATE = 48000;
const N = 4096;

/** What the browser's AnalyserNode reports: Blackman window, magnitude in dB. */
function analyse(signal: Float64Array): Spectrum {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i += 1) {
    const a = (2 * Math.PI * i) / (N - 1);
    w[i] = 0.42 - 0.5 * Math.cos(a) + 0.08 * Math.cos(2 * a);
  }
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i += 1) re[i] = signal[i] * w[i];
  // In-place radix-2 FFT.
  for (let i = 1, j = 0; i < N; i += 1) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k += 1) {
        const cr = Math.cos(ang * k);
        const ci = Math.sin(ang * k);
        const xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - xr;
        im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr;
        im[i + k] += xi;
      }
    }
  }
  const db = new Float32Array(N / 2);
  for (let b = 0; b < N / 2; b += 1) db[b] = 20 * Math.log10(Math.hypot(re[b], im[b]) / N + 1e-12);
  return { db, binHz: RATE / N };
}

/** Piano-ish keys: 1/n harmonics, slight string stretch, a little room noise. */
function play(midis: number[], opts: { cents?: number; noise?: number } = {}): Spectrum {
  const s = new Float64Array(N);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const m of midis) {
    const f0 = 440 * 2 ** ((m - 69 + (opts.cents ?? 0) / 100) / 12);
    for (let h = 1; h <= 7; h += 1) {
      const f = f0 * h * Math.sqrt(1 + 0.0004 * h * h);
      const phase = rand() * Math.PI;
      for (let i = 0; i < N; i += 1) s[i] += (0.3 / h / Math.sqrt(midis.length)) * Math.sin((2 * Math.PI * f * i) / RATE + phase);
    }
  }
  for (let i = 0; i < N; i += 1) s[i] += (opts.noise ?? 0.002) * rand();
  return analyse(s);
}

describe("chord detection from one mic", () => {
  it("hears a C major chord", () => {
    expect(chordHeard(play([60, 64, 67]), [60, 64, 67])).toBe(true);
  });

  it("hears both hands at once: a high melody over a bass note", () => {
    expect(chordHeard(play([76, 43]), [76, 43])).toBe(true);
  });

  it("hears a five-note two-hand chord", () => {
    expect(chordHeard(play([43, 50, 65, 69, 74]), [43, 50, 65, 69, 74])).toBe(true);
  });

  it("copes with a piano 20 cents flat", () => {
    expect(chordHeard(play([60, 64, 67], { cents: -20 }), [60, 64, 67])).toBe(true);
  });

  it("rejects a different chord", () => {
    expect(chordHeard(play([62, 65, 69]), [60, 64, 67])).toBe(false);
  });

  it("rejects one key of a three-key chord", () => {
    expect(chordHeard(play([60]), [60, 64, 67])).toBe(false);
  });

  it("rejects the chord a semitone off", () => {
    expect(chordHeard(play([61, 65, 68]), [60, 64, 67])).toBe(false);
  });

  it("finds a sounding key and not its neighbour", () => {
    const spec = play([60, 64, 67]);
    expect(notePresence(spec, 64)).toBeGreaterThan(20);
    expect(notePresence(spec, 63)).toBe(-Infinity);
  });

  it("doesn't mistake a harmonic for a played key", () => {
    // C4's 3rd harmonic sits exactly on G4's 2nd; G4 must still count as not played.
    expect(notePresence(play([60]), 67)).toBe(-Infinity);
  });

  it("rejects half of a two-hand step", () => {
    expect(chordHeard(play([76]), [76, 43])).toBe(false);
  });

  it("hears a low left-hand fifth", () => {
    expect(chordHeard(play([36, 43]), [36, 43])).toBe(true);
  });
});
