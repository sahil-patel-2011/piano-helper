import { midiToHz } from "./pitch.js";

/** A magnitude spectrum (dB per bin) captured just after a key strike. */
export type Spectrum = { db: Float32Array | number[]; binHz: number };

type Peak = { hz: number; db: number };

/** Below this a fundamental is too close to its neighbour semitone to resolve; use a harmonic. */
const RESOLVABLE_HZ = 150;
const TOLERANCE_CENTS = 40;
const peakCache = new WeakMap<object, { peaks: Peak[]; floor: number }>();

/**
 * Real peaks in the spectrum, with sub-bin frequency from a parabola through the top three
 * bins. Only peaks well above the noise floor and within 45 dB of the loudest count.
 */
function peaksOf(spec: Spectrum): { peaks: Peak[]; floor: number } {
  const cached = peakCache.get(spec as object);
  if (cached) return cached;
  const db = spec.db;
  const sorted = Array.from(db).filter(Number.isFinite).sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length / 2)] ?? -120;
  const top = sorted[sorted.length - 1] ?? 0;
  const peaks: Peak[] = [];
  for (let b = 2; b < db.length - 2; b += 1) {
    const v = db[b];
    if (v <= db[b - 1] || v < db[b + 1] || v < floor + 20 || v < top - 45) continue;
    const a = db[b - 1];
    const c = db[b + 1];
    const denom = a - 2 * v + c;
    const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    peaks.push({ hz: (b + shift) * spec.binHz, db: v });
  }
  const out = { peaks, floor };
  peakCache.set(spec as object, out);
  return out;
}

/**
 * How clearly a key sounds, in dB above the noise floor, or -Infinity when it doesn't.
 * It needs a real peak within ±40 cents of its fundamental. A harmonic can't stand in,
 * because harmonics of other keys land there (C4's 3rd harmonic is G4's 2nd). The exception
 * is a bass key whose fundamental can't be resolved; it uses its 2nd or 3rd harmonic.
 */
export function notePresence(spec: Spectrum, midi: number): number {
  const { peaks, floor } = peaksOf(spec);
  const f0 = midiToHz(midi);
  const partials = f0 >= RESOLVABLE_HZ ? [1] : [2, 3].filter((h) => f0 * h >= RESOLVABLE_HZ * 0.9);
  let best = -Infinity;
  for (const h of partials) {
    const target = f0 * h * Math.sqrt(1 + 0.0004 * h * h); // piano strings run slightly sharp up the series
    for (const p of peaks) {
      const cents = 1200 * Math.log2(p.hz / target);
      if (Math.abs(cents) <= TOLERANCE_CENTS) best = Math.max(best, p.db - floor);
    }
  }
  return best;
}

/**
 * Did a strike contain these keys? A mic can't name several notes at once, but it can check
 * that each expected key has its own peak. A chord of three or more needs most of its keys
 * (at least two); a two-key step needs both.
 */
export function chordHeard(spec: Spectrum, midis: number[], marginDb = 20): boolean {
  if (!midis.length) return false;
  const present = midis.filter((m) => notePresence(spec, m) >= marginDb).length;
  const need = midis.length >= 3 ? Math.max(2, Math.ceil(midis.length * 0.6)) : midis.length;
  return present >= need;
}
