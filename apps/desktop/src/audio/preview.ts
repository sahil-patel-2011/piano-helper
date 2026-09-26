import { midiToHz, type FlatEvent } from "@piano-helper/shared";

export type PreviewHandle = { stop: () => void; done: Promise<void> };

let ctx: AudioContext | null = null;

/** A soft piano-ish tone: two detuned partials with a fast attack and a long decay. */
function strike(context: AudioContext, dest: AudioNode, midi: number, at: number, seconds: number, gain: number) {
  const out = context.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(gain, at + 0.008);
  out.gain.exponentialRampToValueAtTime(gain * 0.35, at + 0.25);
  out.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(0.35, seconds) + 0.4);
  out.connect(dest);
  const hz = midiToHz(midi);
  for (const [type, mult, level] of [
    ["triangle", 1, 1],
    ["sine", 2, 0.25],
  ] as const) {
    const osc = context.createOscillator();
    const g = context.createGain();
    osc.type = type;
    osc.frequency.value = hz * mult;
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + Math.max(0.35, seconds) + 0.5);
  }
}

/**
 * Plays `events` at `bpm` and calls `onStep(i)` as each one sounds, so the
 * keyboard can light the matching key. Learning the sound first, then the
 * hand position, is faster than decoding notation.
 */
export function playPreview(
  events: FlatEvent[],
  bpm: number,
  volume0to100: number,
  onStep: (index: number | null) => void,
): PreviewHandle {
  ctx ??= new AudioContext();
  const context = ctx;
  void context.resume();
  const beat = 60 / Math.max(30, bpm);
  const gain = Math.max(0.05, Math.min(1, volume0to100 / 100)) * 0.28;
  const t0 = context.currentTime + 0.12;
  // One bus per preview, so Stop can silence notes that are already scheduled.
  const bus = context.createGain();
  bus.connect(context.destination);
  const timers: number[] = [];
  let at = 0;
  events.forEach((ev, i) => {
    const ring = Math.max(0.25, ev.durationBeats) * beat;
    // Steps are spaced by where they sit in the bar, so a held left-hand note under a moving
    // right hand keeps ringing while the melody moves on.
    const gapBeats = events[i + 1] ? events[i + 1].absBeat - ev.absBeat : ev.durationBeats;
    const gap = Math.max(0.2, gapBeats > 0 ? gapBeats : ev.durationBeats) * beat;
    for (const midi of ev.expectedMidi) strike(context, bus, midi, t0 + at, ring, gain / Math.sqrt(ev.expectedMidi.length));
    timers.push(window.setTimeout(() => onStep(i), (0.12 + at) * 1000));
    at += gap;
  });
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  // Leave a short tail so the last note's ring-out is not scored by the mic.
  timers.push(
    window.setTimeout(() => {
      onStep(null);
      finish();
    }, (0.12 + at + 0.5) * 1000),
  );
  return {
    done,
    stop() {
      timers.forEach((t) => window.clearTimeout(t));
      bus.disconnect();
      onStep(null);
      finish();
    },
  };
}
