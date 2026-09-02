import { z } from "zod";

export const MasterySchema = z.enum(["needs_work", "getting_it", "mastered"]);

export const SessionRowSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  durationSec: z.number(),
  pieceId: z.string(),
  pieceTitle: z.string(),
  accuracy: z.number().min(0).max(1),
  stars: z.number().int().min(0).max(3),
  source: z.string(),
});

export const MeasureMasterySchema = z.record(
  z.string(),
  z.record(z.string(), z.object({ state: MasterySchema, cleanWaits: z.number().int() })),
);

export const ProgressStatsSchema = z.object({
  sessions: z.array(SessionRowSchema).default([]),
  dailySeconds: z.record(z.string(), z.number()).default({}),
  lastActiveDate: z.string().nullable().default(null),
});

export type Mastery = z.infer<typeof MasterySchema>;
export type SessionRow = z.infer<typeof SessionRowSchema>;
export type MeasureMasteryMap = z.infer<typeof MeasureMasterySchema>;
export type ProgressStats = z.infer<typeof ProgressStatsSchema>;

export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function yesterdayKey(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - 1);
  return localDateKey(d);
}

export function computeStreak(dailySeconds: Record<string, number>, now = new Date()): number {
  const THRESHOLD = 5 * 60;
  let streak = 0;
  const cursor = new Date(now);
  let key = localDateKey(cursor);
  if ((dailySeconds[key] ?? 0) < THRESHOLD) {
    cursor.setDate(cursor.getDate() - 1);
    key = localDateKey(cursor);
  }
  while ((dailySeconds[key] ?? 0) >= THRESHOLD) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
    key = localDateKey(cursor);
  }
  return streak;
}

export function todaySeconds(stats: ProgressStats, now = new Date()): number {
  return stats.dailySeconds[localDateKey(now)] ?? 0;
}

export function weekMinutes(stats: ProgressStats, now = new Date()): number {
  let total = 0;
  const cursor = new Date(now);
  for (let i = 0; i < 7; i += 1) {
    total += stats.dailySeconds[localDateKey(cursor)] ?? 0;
    cursor.setDate(cursor.getDate() - 1);
  }
  return Math.round(total / 60);
}

export function scoreStars(input: {
  noteHitRate: number;
  onTimeRate: number;
  finished: boolean;
  longestGapMs: number;
}): number {
  let stars = 0;
  if (input.noteHitRate >= 0.8) stars += 1;
  if (input.onTimeRate >= 0.7) stars += 1;
  if (input.finished && input.longestGapMs <= 2000) stars += 1;
  return stars;
}

export function nextMastery(cleanWaits: number): { state: Mastery; cleanWaits: number } {
  if (cleanWaits >= 3) return { state: "mastered", cleanWaits };
  if (cleanWaits >= 1) return { state: "getting_it", cleanWaits };
  return { state: "needs_work", cleanWaits };
}
