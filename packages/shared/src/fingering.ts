import { type FlatEvent, type Hand, type StepNote } from "./lesson.js";
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

/**
 * Fingers for notes struck together, by how far apart they are rather than by count:
 * C-E-G → 1-3-5, an octave → 1-5, C-E-G-C → 1-2-3-5 (left hand mirrored: 5-3-1, 5-1, ...).
 * Returned in ascending pitch order.
 */
function chordFingers(midis: number[], hand: HandSide): Finger[] {
  const sorted = [...midis].sort((a, b) => a - b);
  if (sorted.length === 1) return [preferStart(sorted[0], hand)];
  const lo = sorted[0];
  const span = Math.max(1, whiteDistance(lo, sorted[sorted.length - 1]));
  // Right-hand numbering from the bottom note; small chords keep a finger per white key.
  const rh: number[] = sorted.map((m, i) => {
    if (i === 0) return 1;
    const up = Math.max(1, whiteDistance(lo, m));
    return span >= 4 ? 1 + Math.round((up * 4) / span) : Math.min(5, 1 + up);
  });
  // Strictly increasing and within 1-5, even for crowded chords.
  for (let i = 1; i < rh.length; i += 1) rh[i] = Math.max(rh[i], rh[i - 1] + 1);
  for (let i = rh.length - 1; i >= 0; i -= 1) rh[i] = Math.min(rh[i], 5 - (rh.length - 1 - i));
  return rh.map((f) => asFinger(hand === "rh" ? f : 6 - f));
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

// ---------------------------------------------------------------- whole-step planning (chords, both hands)

export type PlannedNote = { midi: number; pitch: string; hand: HandSide; finger: Finger };

export type HandPose = {
  side: HandSide;
  /** midi → finger for where every finger of this hand sits. */
  shape: Record<number, number>;
  /** Fingers pressing a key in this step (empty when the hand is resting). */
  active: Finger[];
  resting: boolean;
};

export type StepPlan = {
  /** Every key to press now, each with its hand and finger. */
  notes: PlannedNote[];
  /** One pose per hand the piece uses; the idle hand shows where it waits. */
  hands: HandPose[];
  /** Coaching for the most important note (top of the right hand, else the left hand). */
  primary: FingerAdvice | null;
};

/** Fingers for a one-hand chord: written ones first, the rest spread by pitch order. */
function fingersForChord(notes: StepNote[], hand: HandSide): Finger[] {
  const byPitch = [...notes].map((n, i) => ({ n, i })).sort((a, b) => a.n.midi - b.n.midi);
  const guess = chordFingers(byPitch.map((x) => x.n.midi), hand);
  const out: Finger[] = new Array(notes.length);
  byPitch.forEach((x, k) => {
    const written = x.n.finger;
    out[x.i] = written && written >= 1 && written <= 5 ? asFinger(written) : guess[k];
  });
  return out;
}

/**
 * Plans every step: a finger for every key (chords and both hands included), and a hand
 * pose per hand so the screen can draw both hands where they belong.
 */
export function planSteps(events: FlatEvent[]): StepPlan[] {
  const sides: HandSide[] = (["rh", "lh"] as const).filter((side) => events.some((e) => e.notes.some((n) => n.hand === side)));
  // Per hand: fingers for its notes in each step, then the melody planner over that hand alone.
  const perHand = new Map<HandSide, { step: number; notes: StepNote[]; fingers: Finger[]; advice?: FingerAdvice }[]>();
  for (const side of sides) {
    const rows = events
      .map((e, step) => ({ step, notes: e.notes.filter((n) => n.hand === side) }))
      .filter((r) => r.notes.length)
      .map((r) => ({ ...r, fingers: r.notes.length > 1 ? fingersForChord(r.notes, side) : [] as Finger[] }));
    // The planner follows one line per hand: the top note of a right-hand chord, the bottom of a left-hand one.
    const lead = (r: (typeof rows)[number]) => {
      if (r.notes.length === 1) return { midi: r.notes[0].midi, pitch: r.notes[0].pitch, finger: r.notes[0].finger ?? undefined };
      const k = r.notes.reduce((best, n, i) => ((side === "rh" ? n.midi > r.notes[best].midi : n.midi < r.notes[best].midi) ? i : best), 0);
      return { midi: r.notes[k].midi, pitch: r.notes[k].pitch, finger: r.fingers[k] };
    };
    const line: FlatEvent[] = rows.map((r, i) => {
      const l = lead(r);
      return {
        beat: 1,
        durationBeats: 1,
        pitches: [l.pitch],
        hand: side,
        fingering: l.finger ? [l.finger] : undefined,
        measure: events[r.step].measure,
        index: i,
        expectedMidi: [l.midi],
        absBeat: events[r.step].absBeat,
        notes: [],
      };
    });
    const advice = planFingering(line);
    rows.forEach((r, i) => {
      const a = advice[i];
      if (r.notes.length === 1) r.fingers = [a.finger];
      Object.assign(r, { advice: a });
    });
    perHand.set(side, rows);
  }

  const lastPose = new Map<HandSide, HandPose>();
  // A hand that hasn't started yet waits where it will first play.
  for (const side of sides) {
    const first = perHand.get(side)?.[0];
    if (first) lastPose.set(side, poseFor(side, first.notes, first.fingers, first.advice, true));
  }

  return events.map((_, step) => {
    const notes: PlannedNote[] = [];
    let primary: FingerAdvice | null = null;
    for (const side of sides) {
      const row = perHand.get(side)?.find((r) => r.step === step);
      if (!row) continue;
      row.notes.forEach((n, k) => notes.push({ midi: n.midi, pitch: n.pitch, hand: side, finger: row.fingers[k] }));
      lastPose.set(side, poseFor(side, row.notes, row.fingers, row.advice, false));
      if (side === "rh" || !primary) primary = row.advice ?? null; // rh is visited first
    }
    const hands = sides.map((side) => {
      const pose = lastPose.get(side) as HandPose;
      const pressing = notes.some((n) => n.hand === side);
      return pressing ? pose : { ...pose, active: [], resting: true };
    });
    return { notes, hands, primary };
  });
}

function poseFor(side: HandSide, notes: StepNote[], fingers: Finger[], advice: FingerAdvice | undefined, resting: boolean): HandPose {
  const anchor = advice ? { midi: advice.midi, finger: advice.finger } : { midi: notes[0].midi, finger: fingers[0] };
  const shape = shapeFromAnchor(anchor.midi, anchor.finger, side);
  // Keys actually pressed win over the guessed resting spots.
  notes.forEach((n, k) => {
    for (const [m, f] of Object.entries(shape)) if (f === fingers[k] || Number(m) === n.midi) delete shape[Number(m)];
  });
  notes.forEach((n, k) => (shape[n.midi] = fingers[k]));
  return { side, shape, active: resting ? [] : [...new Set(fingers)], resting };
}
