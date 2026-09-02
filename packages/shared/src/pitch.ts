const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#",
  Eb: "D#",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToPitch(midi: number): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const oct = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

export function pitchToMidi(pitch: string): number {
  const match = pitch.trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) {
    throw new Error(`Invalid pitch: ${pitch}`);
  }
  let name = match[1].toUpperCase() + (match[2] ?? "");
  if (name.endsWith("b")) {
    const mapped = FLAT_TO_SHARP[name];
    if (!mapped) throw new Error(`Invalid pitch: ${pitch}`);
    name = mapped;
  }
  const oct = Number(match[3]);
  const pc = NOTE_NAMES.indexOf(name as (typeof NOTE_NAMES)[number]);
  if (pc < 0) throw new Error(`Invalid pitch: ${pitch}`);
  return (oct + 1) * 12 + pc;
}

export function centsBetweenMidi(heardMidi: number, targetMidi: number): number {
  return (heardMidi - targetMidi) * 100;
}

export function centsErrorHz(hz: number, targetMidi: number, offsetCents = 0): number {
  const midi = hzToMidi(hz) + offsetCents / 100;
  return centsBetweenMidi(midi, targetMidi);
}

export function applyCentsOffset(midi: number, offsetCents: number): number {
  return midi + offsetCents / 100;
}

export const MIDI_A0 = 21;
export const MIDI_C8 = 108;
export const MIDI_C4 = 60;
export const MIDI_A4 = 69;

export function keyRangeForCount(keyCount: 61 | 76 | 88): { from: number; to: number } {
  if (keyCount === 88) return { from: MIDI_A0, to: MIDI_C8 };
  if (keyCount === 76) return { from: 28, to: 103 };
  return { from: 36, to: 96 };
}

export function isWhiteKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return [0, 2, 4, 5, 7, 9, 11].includes(pc);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
