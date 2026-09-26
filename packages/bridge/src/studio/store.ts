import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  AppSettingsSchema,
  LessonSchema,
  ProgressStatsSchema,
  type AppSettings,
  type Lesson,
  type MeasureMasteryMap,
  type ProgressStats,
} from "@piano-helper/shared";
import { STARTERS } from "@piano-helper/starters";
import { appDataDir } from "../paths.js";

// Same on-disk layout as apps/desktop/electron/storage.ts so the desktop app
// and the studio server share one library, settings file and progress log.

export type LibraryItem = { id: string; title: string; source: string; difficulty: number };

const file = (name: string) => join(appDataDir(), name);

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

export async function initStore() {
  for (const dir of ["", "library", "imports", "progress", "logs", "studio"]) {
    await mkdir(file(dir), { recursive: true });
  }
}

export async function getSettings(): Promise<AppSettings> {
  return AppSettingsSchema.parse(await readJson(file("settings.json"), {}));
}

export async function saveSettings(settings: unknown) {
  await writeJson(file("settings.json"), AppSettingsSchema.parse(settings));
}

export async function getProgress(): Promise<{ stats: ProgressStats; measures: MeasureMasteryMap }> {
  const stats = ProgressStatsSchema.parse(await readJson(file("progress/stats.json"), {}));
  const measures = await readJson<MeasureMasteryMap>(file("progress/measures.json"), {});
  return { stats, measures };
}

export async function saveProgress(stats: unknown, measures: unknown) {
  await writeJson(file("progress/stats.json"), ProgressStatsSchema.parse(stats));
  await writeJson(file("progress/measures.json"), measures ?? {});
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const imported = await readJson<LibraryItem[]>(file("library/index.json"), []);
  const starters = STARTERS.map((l) => ({ id: l.id, title: l.title, source: l.source, difficulty: l.difficulty }));
  const seen = new Set(starters.map((s) => s.id));
  return [...starters, ...imported.filter((i) => !seen.has(i.id))];
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,120}$/;

export async function loadLesson(id: string): Promise<Lesson | null> {
  const starter = STARTERS.find((s) => s.id === id);
  if (starter) return starter;
  if (!SAFE_ID.test(id)) return null;
  const parsed = LessonSchema.safeParse(await readJson<unknown>(file(`library/${id}.json`), null));
  return parsed.success ? parsed.data : null;
}

export async function saveLesson(lesson: unknown): Promise<Lesson> {
  const parsed = LessonSchema.parse(lesson);
  if (!SAFE_ID.test(parsed.id)) throw new Error("Lesson id may only use letters, numbers, dot, dash and underscore.");
  await writeJson(file(`library/${parsed.id}.json`), parsed);
  const index = await readJson<LibraryItem[]>(file("library/index.json"), []);
  const item = { id: parsed.id, title: parsed.title, source: parsed.source, difficulty: parsed.difficulty };
  await writeJson(file("library/index.json"), [item, ...index.filter((i) => i.id !== item.id)]);
  return parsed;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".pdf"]);

/** Saves uploaded bytes under imports/<uuid>/ and returns the absolute path. */
export async function saveUpload(name: string, bytes: Buffer): Promise<string> {
  return (await saveUploadWithId(name, bytes)).path;
}

export async function saveUploadWithId(name: string, bytes: Buffer): Promise<{ id: string; dir: string; path: string }> {
  let ext = extname(name).toLowerCase();
  if (!IMAGE_EXT.has(ext)) ext = ".jpg";
  const id = randomUUID();
  const dir = file(join("imports", id));
  await mkdir(dir, { recursive: true });
  const path = join(dir, `source${ext}`);
  await writeFile(path, bytes);
  return { id, dir, path };
}

// ---------------------------------------------------------------- read once, keep forever
// Each photo is read by the AI once. Its folder keeps the photo, the AI's answer word for
// word, and the lesson made from it. The same photo again reuses that lesson, no AI call.

type PhotoIndex = Record<string, { importId: string; lessonId: string }>;

export function photoFingerprint(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The lesson already made from this exact photo, if there is one. */
export async function findReading(fingerprint: string): Promise<Lesson | null> {
  const index = await readJson<PhotoIndex>(file("studio/photos.json"), {});
  const hit = index[fingerprint];
  return hit ? loadLesson(hit.lessonId) : null;
}

export async function keepReading(opts: {
  fingerprint: string;
  importId: string;
  dir: string;
  engine: string;
  raw: string[];
  lesson: Lesson;
}) {
  const divider = "\n\n----- asked to fix the JSON; second answer -----\n\n";
  await writeFile(join(opts.dir, "ai-output.txt"), opts.raw.join(divider), "utf8");
  await writeJson(join(opts.dir, "lesson.json"), opts.lesson);
  await writeJson(join(opts.dir, "reading.json"), {
    engine: opts.engine,
    readAt: opts.lesson.origin?.readAt ?? new Date().toISOString(),
    photoSha256: opts.fingerprint,
    lessonId: opts.lesson.id,
    answers: opts.raw.length,
  });
  const index = await readJson<PhotoIndex>(file("studio/photos.json"), {});
  index[opts.fingerprint] = { importId: opts.importId, lessonId: opts.lesson.id };
  await writeJson(file("studio/photos.json"), index);
}

export function studioDir() {
  return file("studio");
}
