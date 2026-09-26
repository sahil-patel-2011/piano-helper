import { z } from "zod";
import { pitchToMidi } from "./pitch.js";

export const LessonSourceSchema = z.enum(["builtin", "photo", "pdf", "musicxml", "claude"]);
export const HandSchema = z.enum(["rh", "lh", "both"]);
export const PracticeModeSchema = z.enum(["wait", "slow", "loop", "play", "learn"]);

export const LessonEventSchema = z.object({
  beat: z.number().positive(),
  durationBeats: z.number().positive(),
  /** One hand's notes struck together (up to a full five-finger chord). */
  pitches: z.array(z.string().min(2)).min(1).max(5),
  hand: HandSchema.default("rh"),
  fingering: z.array(z.number().int().min(1).max(5)).optional(),
  uncertain: z.boolean().optional(),
  lyric: z.string().optional(),
});

export const LessonMeasureSchema = z.object({
  n: z.number().int().positive(),
  events: z.array(LessonEventSchema),
  /** One short memory cue from the AI, e.g. "Same as bar 1, then walk down to the thumb." */
  tip: z.string().max(160).optional(),
});

export const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: LessonSourceSchema,
  timeSignature: z.object({
    num: z.number().int().positive(),
    den: z.number().int().positive(),
  }),
  tempoBpm: z.number().positive(),
  keySignature: z.string().default("C"),
  difficulty: z.number().int().min(1).max(5).default(1),
  measures: z.array(LessonMeasureSchema).min(1),
  /** Where the hands start and anything worth knowing before playing. */
  summary: z.string().max(400).optional(),
  /** Which photo and AI produced this lesson. Practising always uses this saved copy. */
  origin: z
    .object({
      importId: z.string(),
      engine: z.string(),
      readAt: z.string(),
      photoSha256: z.string(),
    })
    .optional(),
});

export type LessonSource = z.infer<typeof LessonSourceSchema>;
export type Hand = z.infer<typeof HandSchema>;
export type PracticeMode = z.infer<typeof PracticeModeSchema>;
export type LessonEvent = z.infer<typeof LessonEventSchema>;
export type LessonMeasure = z.infer<typeof LessonMeasureSchema>;
export type Lesson = z.infer<typeof LessonSchema>;

export function parseLesson(data: unknown): Lesson {
  return LessonSchema.parse(data);
}

export function lessonHasUncertain(lesson: Lesson): boolean {
  return lesson.measures.some((m) => m.events.some((e) => e.uncertain));
}

/** One key to press in a step, with the hand and finger that press it. */
export type StepNote = {
  midi: number;
  pitch: string;
  hand: "rh" | "lh";
  /** Finger written in the lesson, or null when the planner has to choose. */
  finger: number | null;
};

/**
 * One step of play: every note that starts at the same moment, across both hands.
 * `absBeat` is its position from the start of the piece, used to follow the player's tempo.
 */
export type FlatEvent = LessonEvent & {
  measure: number;
  index: number;
  expectedMidi: number[];
  absBeat: number;
  notes: StepNote[];
};

const SAME_BEAT = 0.01;

function beatsPerMeasure(lesson: Lesson): number {
  // Beats are counted in the time signature's own unit, as the lesson JSON writes them.
  return lesson.timeSignature.num;
}

function notesOf(event: LessonEvent): StepNote[] {
  const hand = event.hand === "lh" ? "lh" : "rh";
  return event.pitches.map((pitch, i) => ({ midi: pitchToMidi(pitch), pitch, hand, finger: event.fingering?.[i] ?? null }));
}

/**
 * Turns a lesson into steps. Right- and left-hand events on the same beat become one step,
 * so both hands are played together, the way the music is written. Within a hand, the
 * lesson's order is kept exactly.
 */
export function flattenLesson(lesson: Lesson, hands: Hand | "all" = "all"): FlatEvent[] {
  const out: FlatEvent[] = [];
  const perMeasure = beatsPerMeasure(lesson);
  let index = 0;
  let lastAbs = -Infinity;
  let lastDur = 0;
  lesson.measures.forEach((measure, mi) => {
    const wanted = measure.events.filter(
      (e) => hands === "all" || hands === "both" || e.hand === "both" || e.hand === hands,
    );
    const rh = wanted.filter((e) => e.hand !== "lh");
    const lh = wanted.filter((e) => e.hand === "lh");
    let i = 0;
    let j = 0;
    while (i < rh.length || j < lh.length) {
      const a = rh[i];
      const b = lh[j];
      let group: LessonEvent[];
      if (a && b && Math.abs(a.beat - b.beat) < SAME_BEAT) {
        group = [a, b];
        i += 1;
        j += 1;
      } else if (a && (!b || a.beat < b.beat)) {
        group = [a];
        i += 1;
      } else {
        group = [b as LessonEvent];
        j += 1;
      }
      const notes = group.flatMap(notesOf);
      const beat = group[0].beat;
      let absBeat = mi * perMeasure + (beat - 1);
      // Out-of-order beats in a lesson must never make time run backwards.
      if (absBeat <= lastAbs) absBeat = lastAbs + lastDur;
      const handsHere = new Set(notes.map((n) => n.hand));
      const written = notes.map((n) => n.finger);
      out.push({
        beat,
        durationBeats: Math.min(...group.map((e) => e.durationBeats)),
        pitches: notes.map((n) => n.pitch),
        hand: handsHere.size > 1 ? "both" : [...handsHere][0],
        fingering: written.every((f): f is number => f !== null) ? written : undefined,
        uncertain: group.some((e) => e.uncertain) || undefined,
        measure: measure.n,
        index,
        expectedMidi: notes.map((n) => n.midi),
        absBeat,
        notes,
      });
      lastAbs = absBeat;
      lastDur = Math.min(...group.map((e) => e.durationBeats));
      index += 1;
    }
  });
  return out;
}

export function filterMeasures(lesson: Lesson, fromMeasure?: number, toMeasure?: number): Lesson {
  if (!fromMeasure && !toMeasure) return lesson;
  const from = fromMeasure ?? 1;
  const to = toMeasure ?? lesson.measures[lesson.measures.length - 1].n;
  return {
    ...lesson,
    measures: lesson.measures.filter((m) => m.n >= from && m.n <= to),
  };
}
