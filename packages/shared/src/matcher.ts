import { chordHeard, type Spectrum } from "./spectrum.js";

export type HeardNote = {
  midi: number;
  centsError: number;
  rms: number;
  source: "mic" | "midi";
  t: number;
  /**
   * "strike": the mic heard a key go down and took a spectrum, whatever the pitch tracker made
   * of it. Used to check chords and both-hand steps, which one pitch can't describe.
   */
  kind?: "pitch" | "strike";
  spectrum?: Spectrum;
};

const isPitch = (h: HeardNote) => h.kind !== "strike";

export function notesInWindow(heard: HeardNote[], now: number, windowMs: number): HeardNote[] {
  return heard.filter((h) => now - h.t <= windowMs);
}

/** Semitones a mic misreads keys near `midi` by (from calibration). */
export type ShiftFor = (midi: number) => number;

function micMatches(h: HeardNote, target: number, windowCents: number, shiftFor?: ShiftFor): boolean {
  const near = (t: number) => Math.abs((h.midi - t) * 100 + h.centsError) <= windowCents;
  if (near(target)) return true;
  const shift = shiftFor?.(target) ?? 0;
  return shift !== 0 && near(target + shift);
}

function matches(h: HeardNote, target: number, windowCents: number, shiftFor?: ShiftFor): boolean {
  return h.source === "midi" ? Math.round(h.midi) === target : micMatches(h, target, windowCents, shiftFor);
}

export function expectedHit(
  recent: HeardNote[],
  expectedMidi: number[],
  matchWindowCents: number,
  shiftFor?: ShiftFor,
): boolean {
  if (expectedMidi.length === 0) return false;
  const hasMidi = recent.some((h) => h.source === "midi");
  const heard = (target: number) => recent.some((h) => isPitch(h) && matches(h, target, matchWindowCents, shiftFor));
  if (hasMidi) return expectedMidi.every(heard);
  if (expectedMidi.length === 1) return heard(expectedMidi[0]);
  // Several keys at once: check the spectrum of the latest strike for each expected key.
  const strike = [...recent].reverse().find((h) => h.kind === "strike" && h.spectrum);
  if (strike?.spectrum) return chordHeard(strike.spectrum, expectedMidi);
  // A mic pitch tracker hears one note of a chord, and often in the wrong octave:
  // C-E-G together repeats at a low C. Any chord tone's name, any octave, proves the hand landed.
  return recent.some((h) => {
    if (h.source !== "mic") return false;
    const cents = h.centsError + (h.midi - Math.round(h.midi)) * 100;
    if (Math.abs(cents) > matchWindowCents) return false;
    return expectedMidi.some((t) => (((Math.round(h.midi) - t) % 12) + 12) % 12 === 0);
  });
}

export function unexpectedPitch(
  recent: HeardNote[],
  expectedMidi: number[],
  matchWindowCents = 50,
  shiftFor?: ShiftFor,
): number | null {
  // One pitch can't describe a chord, so the mic never calls a chord step wrong; it just waits for it.
  if (expectedMidi.length > 1 && !recent.some((h) => h.source === "midi")) return null;
  for (const h of recent) {
    if (!isPitch(h)) continue;
    if (expectedMidi.some((t) => matches(h, t, matchWindowCents, shiftFor))) continue;
    return Math.round(h.midi);
  }
  return null;
}
