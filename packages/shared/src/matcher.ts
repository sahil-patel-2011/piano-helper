export type HeardNote = {
  midi: number;
  centsError: number;
  rms: number;
  source: "mic" | "midi";
  t: number;
};

export function notesInWindow(heard: HeardNote[], now: number, windowMs: number): HeardNote[] {
  return heard.filter((h) => now - h.t <= windowMs);
}

export function expectedHit(
  recent: HeardNote[],
  expectedMidi: number[],
  matchWindowCents: number,
): boolean {
  if (expectedMidi.length === 0) return false;
  return expectedMidi.every((target) =>
    recent.some((h) => {
      if (h.source === "midi") return Math.round(h.midi) === target;
      const centsToTarget = (h.midi - target) * 100 + h.centsError;
      return Math.abs(centsToTarget) <= matchWindowCents;
    }),
  );
}

export function unexpectedPitch(recent: HeardNote[], expectedMidi: number[]): number | null {
  for (const h of recent) {
    const midi = Math.round(h.midi);
    if (!expectedMidi.includes(midi)) return midi;
  }
  return null;
}
