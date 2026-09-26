import { z } from "zod";
import { keyRangeForCount, median, midiToPitch } from "./pitch.js";

export const InstrumentSchema = z.enum(["acoustic", "digital", "keyboard"]);
export const BrandSchema = z.enum(["Yamaha", "Steinway", "Casio", "Roland", "Kawai", "Other"]);
export const KeyCountSchema = z.union([z.literal(61), z.literal(76), z.literal(88)]);

export const CalibrationPointSchema = z.object({
  /** The key the player was asked to press. */
  midi: z.number().int(),
  /** The key this mic reported most often, or null when it heard nothing usable. */
  heard: z.number().int().nullable(),
  /** Median cents sharp (+) or flat (-) when heard on the right key. */
  cents: z.number().nullable(),
  /** Typical loudness of that key through this mic. */
  rms: z.number().nullable(),
});

export type CalibrationPoint = z.infer<typeof CalibrationPointSchema>;

export const DeviceProfileSchema = z.object({
  instrument: InstrumentSchema,
  brand: BrandSchema,
  keyCount: KeyCountSchema,
  centsOffset: z.number().default(0),
  noiseFloorRms: z.number().default(0.01),
  minHitRms: z.number().default(0.02),
  confirmedOctaves: z.record(z.string(), z.number()).default({}),
  preferMidi: z.boolean().default(false),
  lastMidiId: z.string().nullable().default(null),
  yinThreshold: z.number().default(0.15),
  matchWindowCents: z.number().default(35),
  calibratedAt: z.string(),
  /** One entry per key played in the mic check. */
  calibration: z.array(CalibrationPointSchema).default([]),
});

export type Instrument = z.infer<typeof InstrumentSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type KeyCount = z.infer<typeof KeyCountSchema>;
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;


export function matchWindowForInstrument(instrument: Instrument): number {
  return instrument === "acoustic" ? 50 : 35;
}

export type CalibrationStep = { midi: number; label: string; hint: string };

/**
 * The one-time mic check. Starts in the middle (easy to find, most reliable),
 * then visits the extremes, where cheap mics most often mishear.
 */
export function calibrationPlan(keyCount: KeyCount): CalibrationStep[] {
  const { from, to } = keyRangeForCount(keyCount);
  const steps: CalibrationStep[] = [
    { midi: 60, label: "Middle C", hint: "The white key just left of the two black keys, nearest the middle of the piano." },
    { midi: 64, label: "E", hint: "Two white keys right of middle C." },
    { midi: 67, label: "G", hint: "Four white keys right of middle C." },
    { midi: 72, label: "C above middle C", hint: "Eight white keys right of middle C." },
    { midi: 48, label: "Low C", hint: "The C one octave left of middle C." },
    { midi: Math.max(from, 36), label: from < 36 ? "Deep C" : "Lowest key", hint: from < 36 ? "Two octaves left of middle C." : "The very last key on the left." },
    { midi: from, label: "Lowest key", hint: "The very last key on the far left." },
    { midi: 84, label: "High C", hint: "Two octaves right of middle C." },
    { midi: to, label: "Highest key", hint: "The very last key on the far right." },
  ];
  const seen = new Set<number>();
  return steps.filter((s) => s.midi >= from && s.midi <= to && !seen.has(s.midi) && seen.add(s.midi));
}

/** Semitones this mic's reading is off for keys near `midi` (usually 0, or +12 when low notes read an octave high). */
export function octaveShiftNear(calibration: CalibrationPoint[], midi: number): number {
  const usable = calibration.filter((p) => p.heard !== null);
  if (!usable.length) return 0;
  const nearest = usable.reduce((a, b) => (Math.abs(b.midi - midi) < Math.abs(a.midi - midi) ? b : a));
  const shift = (nearest.heard as number) - nearest.midi;
  return shift !== 0 && shift % 12 === 0 ? shift : 0;
}

/** Cents to add to every reading so an out-of-tune piano still lands on the right key. */
export function tuningOffset(calibration: CalibrationPoint[]): number {
  const cents = calibration
    .filter((p) => p.heard === p.midi && p.cents !== null && p.midi >= 48 && p.midi <= 84)
    .map((p) => p.cents as number);
  if (cents.length < 2) return 0;
  return Math.max(-60, Math.min(60, Math.round(-median(cents))));
}

export function describePoint(p: CalibrationPoint): { ok: boolean; text: string } {
  if (p.heard === null) return { ok: false, text: "Not heard. Tap those keys on screen instead." };
  if (p.heard === p.midi) return { ok: true, text: "Heard clearly" };
  const shift = p.heard - p.midi;
  if (shift % 12 === 0) return { ok: true, text: `Mic reads it an octave ${shift > 0 ? "high" : "low"} (corrected automatically)` };
  return { ok: false, text: `Heard ${midiToPitch(p.heard)} instead` };
}
