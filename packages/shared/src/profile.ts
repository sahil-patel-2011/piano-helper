import { z } from "zod";

export const InstrumentSchema = z.enum(["acoustic", "digital", "keyboard"]);
export const BrandSchema = z.enum(["Yamaha", "Steinway", "Casio", "Roland", "Kawai", "Other"]);
export const KeyCountSchema = z.union([z.literal(61), z.literal(76), z.literal(88)]);

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
});

export type Instrument = z.infer<typeof InstrumentSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type KeyCount = z.infer<typeof KeyCountSchema>;
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;

export function calibrationSequence(keyCount: KeyCount): string[] {
  if (keyCount === 61) return ["C4", "E4", "G4", "A4", "C5", "E5"];
  return ["C3", "G3", "C4", "E4", "G4", "A4", "C5"];
}

export function matchWindowForInstrument(instrument: Instrument): number {
  return instrument === "acoustic" ? 50 : 35;
}
