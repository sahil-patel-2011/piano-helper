import { z } from "zod";
import { pitchToMidi } from "./pitch.js";

export const LessonSourceSchema = z.enum(["builtin", "photo", "pdf", "musicxml", "claude"]);
export const HandSchema = z.enum(["rh", "lh", "both"]);
export const PracticeModeSchema = z.enum(["wait", "slow", "loop", "play"]);

export const LessonEventSchema = z.object({
  beat: z.number().positive(),
  durationBeats: z.number().positive(),
  pitches: z.array(z.string().min(2)).min(1).max(3),
  hand: HandSchema.default("rh"),
  fingering: z.array(z.number().int().min(1).max(5)).optional(),
  uncertain: z.boolean().optional(),
  lyric: z.string().optional(),
});

export const LessonMeasureSchema = z.object({
  n: z.number().int().positive(),
  events: z.array(LessonEventSchema),
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

export type FlatEvent = LessonEvent & {
  measure: number;
  index: number;
  expectedMidi: number[];
};

export function flattenLesson(lesson: Lesson, hands: Hand | "all" = "all"): FlatEvent[] {
  const out: FlatEvent[] = [];
  let index = 0;
  for (const measure of lesson.measures) {
    for (const event of measure.events) {
      if (hands !== "all" && hands !== "both" && event.hand !== "both" && event.hand !== hands) {
        continue;
      }
      out.push({
        ...event,
        measure: measure.n,
        index,
        expectedMidi: event.pitches.map((p) => pitchToMidi(p)),
      });
      index += 1;
    }
  }
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
