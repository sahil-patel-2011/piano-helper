import { type FlatEvent, type Hand } from "./lesson.js";
import { isWhiteKey, midiToPitch } from "./pitch.js";

export type Finger = 1 | 2 | 3 | 4 | 5;
export type HandSide = "rh" | "lh";

export type FingerAction = "place" | "stretch" | "shift" | "thumb-under" | "cross-over" | "stay";

export type FingerAdvice = {
  finger: Finger;
  midi: number;
  pitch: string;
  hand: HandSide;
  name: string;
  action: FingerAction;
  coach: string;
  fromFinger: Finger | null;
  fromMidi: number | null;
  stretchSemitones: number;
  shape: Record<number, number>;
};

const FINGER_NAME: Record<Finger, string> = {
  1: "thumb",
  2: "index",
  3: "middle",
  4: "ring",
  5: "pinky",
};

function asHand(hand: Hand | undefined): HandSide {
  return hand === "lh" ? "lh" : "rh";
}

function asFinger(n: number): Finger {
  return Math.max(1, Math.min(5, Math.round(n))) as Finger;
}

function isBlack(midi: number) {
  return !isWhiteKey(midi);
}

function whiteDistance(from: number, to: number): number {
  if (from === to) return 0;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  let n = 0;
  for (let m = lo + 1; m <= hi; m += 1) if (isWhiteKey(m)) n += 1;
  return from < to ? n : -n;
}

function maxComfort(a: Finger, b: Finger): number {
  const d = Math.abs(a - b);
  if (d === 0) return 1;
  if (d === 1) return 5;
  if (d === 2) return 8;
  if (d === 3) return 11;
  return 15;
}

function preferStart(midi: number, hand: HandSide): Finger {
  const pc = ((midi % 12) + 12) % 12;
  if (isBlack(midi)) return pc === 1 || pc === 6 ? 2 : 3;
  if (hand === "rh") {
    if (pc === 0 || pc === 5) return 1;
    if (pc === 2 || pc === 7) return 2;
    if (pc === 4 || pc === 9) return 3;
    return 4;
  }
  if (pc === 0) return 5;
  if (pc === 2) return 4;
  if (pc === 4) return 3;
  if (pc === 5) return 2;
  if (pc === 7) return 1;
  return 3;
}

function fingersLeft(finger: Finger, goingUp: boolean, hand: HandSide): number {
  if (hand === "rh") return goingUp ? 5 - finger : finger - 1;
  return goingUp ? finger - 1 : 5 - finger;
}

function runLength(midis: number[], from: number, goingUp: boolean): number {
  let steps = 0;
  for (let i = from + 1; i < midis.length; i += 1) {
    const d = midis[i] - midis[i - 1];
    if (d === 0) continue;
    if (goingUp ? d < 0 : d > 0) break;
    steps += Math.abs(whiteDistance(midis[i - 1], midis[i]));
  }
  return steps;
}

function chooseNext(
  prev: Finger,
  prevMidi: number,
  nextMidi: number,
  hand: HandSide,
  upcoming: number[],
): { finger: Finger; action: FingerAction } {
  const delta = nextMidi - prevMidi;
  if (delta === 0) return { finger: prev, action: "stay" };

  const goingUp = delta > 0;
  const whites = whiteDistance(prevMidi, nextMidi);
  const dir = hand === "rh" ? (goingUp ? 1 : -1) : goingUp ? -1 : 1;
  const steps = Math.max(1, Math.abs(whites));
  const raw = prev + dir * steps;
  const remainAfter = runLength([nextMidi, ...upcoming], 0, goingUp);

  if (raw >= 1 && raw <= 5) {
    const next = asFinger(raw);
    if (remainAfter > fingersLeft(next, goingUp, hand)) {
      if (hand === "rh" && goingUp && prev >= 3 && !isBlack(nextMidi)) {
        return { finger: 1, action: "thumb-under" };
      }
      if (hand === "lh" && !goingUp && prev >= 3 && !isBlack(nextMidi)) {
        return { finger: 1, action: "thumb-under" };
      }
    }
    const stretch = Math.abs(delta);
    if (stretch > maxComfort(prev, next)) {
      return { finger: preferStart(nextMidi, hand), action: "shift" };
    }
    if (stretch >= 5 && Math.abs(next - prev) >= 2) return { finger: next, action: "stretch" };
    return { finger: next, action: "place" };
  }

  if (hand === "rh" && goingUp && prev >= 3 && !isBlack(nextMidi)) {
    return { finger: 1, action: "thumb-under" };
  }
  if (hand === "rh" && !goingUp && prev <= 2) {
    return { finger: 3, action: "cross-over" };
  }
  if (hand === "lh" && goingUp && prev <= 2) {
    return { finger: 3, action: "cross-over" };
  }
  if (hand === "lh" && !goingUp && prev >= 3 && !isBlack(nextMidi)) {
    return { finger: 1, action: "thumb-under" };
  }
  return { finger: preferStart(nextMidi, hand), action: "shift" };
}

function chordFingers(midis: number[], hand: HandSide): Finger[] {
  const sorted = [...midis].sort((a, b) => a - b);
  if (sorted.length === 1) return [preferStart(sorted[0], hand)];
  if (hand === "rh") {
    const start = asFinger(Math.max(1, 6 - sorted.length));
    return sorted.map((_, i) => asFinger(start + i));
  }
  return sorted.map((_, i) => asFinger(5 - i));
}

export function shapeFromAnchor(midi: number, finger: Finger, hand: HandSide): Record<number, number> {
  const shape: Record<number, number> = { [midi]: finger };
  const dir = hand === "rh" ? 1 : -1;
  for (const f of [1, 2, 3, 4, 5] as Finger[]) {
    if (f === finger) continue;
    let walk = midi;
    let need = (f - finger) * dir;
    while (need !== 0) {
      walk += need > 0 ? 1 : -1;
      if (isWhiteKey(walk)) need += need > 0 ? -1 : 1;
      if (walk < 21 || walk > 108) break;
    }
    if (walk >= 21 && walk <= 108) shape[walk] = f;
  }
  return shape;
}

function coachLine(advice: Omit<FingerAdvice, "coach" | "shape">, shape: Record<number, number>): string {
  const hand = advice.hand === "rh" ? "Right hand" : "Left hand";
  const who = `${FINGER_NAME[advice.finger]} (${advice.finger})`;
  if (advice.action === "stay") return `${hand}: keep ${who} on ${advice.pitch}. Same finger, same key — feel the repeat.`;
  if (advice.action === "thumb-under") {
    return `${hand}: tuck the thumb under to ${advice.pitch}. Let the hand slide, don't twist the wrist.`;
  }
  if (advice.action === "cross-over") {
    return `${hand}: cross ${who} over the thumb onto ${advice.pitch}. Elbow stays quiet.`;
  }
  if (advice.action === "shift") {
    return `${hand}: lift and shift. Plant ${who} on ${advice.pitch}, then settle the other fingers around it.`;
  }
  if (advice.action === "stretch" && advice.fromFinger && advice.fromMidi) {
    const fromPitch = midiToPitch(advice.fromMidi);
    return `${hand}: stretch ${who} to ${advice.pitch}. Keep finger ${advice.fromFinger} on ${fromPitch} — don't collapse the arch.`;
  }
  if (advice.fromFinger && advice.fromMidi) {
    const home = Object.entries(shape).find(([, f]) => f === 1 || f === 5);
    const homeBit = home ? ` Home is ${FINGER_NAME[home[1] as Finger]} on ${midiToPitch(Number(home[0]))}.` : "";
    return `${hand}: ${who} on ${advice.pitch}.${homeBit} Move only that finger if the next key is inside the hand.`;
  }
  return `${hand}: put ${who} on ${advice.pitch}. Curve the finger; play with the pad, not the nail.`;
}

export function planFingering(events: FlatEvent[]): FingerAdvice[] {
  const last: Record<HandSide, { finger: Finger; midi: number } | null> = { rh: null, lh: null };
  const midisByHand: Record<HandSide, number[]> = { rh: [], lh: [] };
  for (const ev of events) {
    const hand = asHand(ev.hand);
    midisByHand[hand].push(ev.expectedMidi[0] ?? 60);
  }
  const seen: Record<HandSide, number> = { rh: 0, lh: 0 };
  const out: FingerAdvice[] = [];

  for (const ev of events) {
    const hand = asHand(ev.hand);
    const midis = ev.expectedMidi.length ? ev.expectedMidi : [60];
    const melody = midis[0];
    const written = ev.fingering?.[0];
    const prev = last[hand];
    const idx = seen[hand];
    const upcoming = midisByHand[hand].slice(idx + 1, idx + 6);
    seen[hand] += 1;

    let finger: Finger;
    let action: FingerAction = "place";
    if (written && written >= 1 && written <= 5) {
      finger = written as Finger;
      if (prev) {
        if (prev.midi === melody) action = "stay";
        else if (Math.abs(melody - prev.midi) >= 5 && Math.abs(finger - prev.finger) >= 2) action = "stretch";
        else if (hand === "rh" && melody > prev.midi && prev.finger >= 3 && finger === 1) action = "thumb-under";
        else if (hand === "rh" && melody < prev.midi && prev.finger <= 2 && finger >= 3) action = "cross-over";
        else if (hand === "lh" && melody < prev.midi && prev.finger >= 3 && finger === 1) action = "thumb-under";
        else if (hand === "lh" && melody > prev.midi && prev.finger <= 2 && finger >= 3) action = "cross-over";
      }
    } else if (midis.length > 1) {
      finger = chordFingers(midis, hand)[0] ?? preferStart(melody, hand);
      action = "place";
    } else if (!prev) {
      finger = preferStart(melody, hand);
    } else {
      const picked = chooseNext(prev.finger, prev.midi, melody, hand, upcoming);
      finger = picked.finger;
      action = picked.action;
    }

    const shape = shapeFromAnchor(melody, finger, hand);
    const stretchSemitones = prev ? Math.abs(melody - prev.midi) : 0;
    const base = {
      finger,
      midi: melody,
      pitch: ev.pitches[0] ?? midiToPitch(melody),
      hand,
      name: FINGER_NAME[finger],
      action,
      fromFinger: prev?.finger ?? null,
      fromMidi: prev?.midi ?? null,
      stretchSemitones,
    };
    out.push({ ...base, shape, coach: coachLine(base, shape) });
    last[hand] = { finger, midi: melody };
  }
  return out;
}

export function adviceAt(events: FlatEvent[], cursor: number): FingerAdvice | null {
  if (!events.length) return null;
  const plan = planFingering(events);
  return plan[Math.min(Math.max(cursor, 0), plan.length - 1)] ?? null;
}
