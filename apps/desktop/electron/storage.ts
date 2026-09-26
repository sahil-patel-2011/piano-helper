import { mkdir, readFile, writeFile, copyFile, appendFile, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import {
  AppSettingsSchema,
  DeviceProfileSchema,
  LessonSchema,
  ProgressStatsSchema,
  defaultSettings,
  type AppSettings,
  type DeviceProfile,
  type Lesson,
  type ProgressStats,
  type MeasureMasteryMap,
} from "@piano-helper/shared";
import { STARTERS } from "@piano-helper/starters";
import { filePath, dataDir } from "./paths.js";

async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function initStorage() {
  await ensureDir(dataDir());
  await ensureDir(join(dataDir(), "library"));
  await ensureDir(join(dataDir(), "imports"));
  await ensureDir(join(dataDir(), "progress"));
  await ensureDir(join(dataDir(), "logs"));
}

export async function getProfile(): Promise<DeviceProfile | null> {
  const raw = await readJson<unknown>(filePath("device-profile.json"), null);
  if (!raw) return null;
  const parsed = DeviceProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveProfile(profile: DeviceProfile) {
  const parsed = DeviceProfileSchema.parse(profile);
  await writeFile(filePath("device-profile.json"), JSON.stringify(parsed, null, 2), "utf8");
}

export async function getSettings(): Promise<AppSettings> {
  const raw = await readJson<Record<string, unknown>>(filePath("settings.json"), {});
  return AppSettingsSchema.parse(raw);
}

export async function saveSettings(settings: AppSettings) {
  const parsed = AppSettingsSchema.parse(settings);
  await writeFile(filePath("settings.json"), JSON.stringify(parsed, null, 2), "utf8");
}

export async function getProgress(): Promise<{ stats: ProgressStats; measures: MeasureMasteryMap }> {
  const stats = ProgressStatsSchema.parse(await readJson(filePath("progress/stats.json"), {}));
  const measures = (await readJson(filePath("progress/measures.json"), {})) as MeasureMasteryMap;
  return { stats, measures };
}

export async function saveProgress(stats: ProgressStats, measures: MeasureMasteryMap) {
  await writeFile(filePath("progress/stats.json"), JSON.stringify(stats, null, 2), "utf8");
  await writeFile(filePath("progress/measures.json"), JSON.stringify(measures, null, 2), "utf8");
}

type SecretMap = Record<string, string>;

function secretsPath() {
  return filePath("secrets.bin");
}

async function readSecrets(): Promise<SecretMap> {
  try {
    const buf = await readFile(secretsPath());
    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(buf.toString("utf8")) as SecretMap;
    }
    const dec = safeStorage.decryptString(buf);
    return JSON.parse(dec) as SecretMap;
  } catch {
    return {};
  }
}

async function writeSecrets(map: SecretMap) {
  const json = JSON.stringify(map);
  if (safeStorage.isEncryptionAvailable()) {
    await writeFile(secretsPath(), safeStorage.encryptString(json));
  } else {
    await writeFile(secretsPath(), json, "utf8");
  }
}

export async function storeSecret(provider: string, key: string) {
  const map = await readSecrets();
  map[provider] = key;
  await writeSecrets(map);
}

export async function getSecret(provider: string): Promise<string | null> {
  const map = await readSecrets();
  return map[provider] ?? null;
}

export async function getSecretExists(provider: string): Promise<boolean> {
  return Boolean(await getSecret(provider));
}

export async function deleteSecret(provider: string) {
  const map = await readSecrets();
  delete map[provider];
  await writeSecrets(map);
}

export type LibraryItem = {
  id: string;
  title: string;
  source: string;
  difficulty: number;
};

export async function listLibrary(): Promise<LibraryItem[]> {
  const imported = await readJson<LibraryItem[]>(filePath("library/index.json"), []);
  const starters: LibraryItem[] = STARTERS.map((l) => ({
    id: l.id,
    title: l.title,
    source: l.source,
    difficulty: l.difficulty,
  }));
  const seen = new Set(starters.map((s) => s.id));
  return [...starters, ...imported.filter((i) => !seen.has(i.id))];
}

export async function loadLesson(id: string): Promise<Lesson | null> {
  const starter = STARTERS.find((s) => s.id === id);
  if (starter) return starter;
  const raw = await readJson<unknown>(join(dataDir(), "library", `${id}.json`), null);
  if (!raw) return null;
  const parsed = LessonSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function saveLesson(lesson: Lesson) {
  const parsed = LessonSchema.parse(lesson);
  await writeFile(join(dataDir(), "library", `${parsed.id}.json`), JSON.stringify(parsed, null, 2), "utf8");
  const index = await readJson<LibraryItem[]>(filePath("library/index.json"), []);
  const item: LibraryItem = {
    id: parsed.id,
    title: parsed.title,
    source: parsed.source,
    difficulty: parsed.difficulty,
  };
  const next = [item, ...index.filter((i) => i.id !== item.id)];
  await writeFile(filePath("library/index.json"), JSON.stringify(next, null, 2), "utf8");
}

export async function copyImport(sourcePath: string): Promise<{ id: string; dest: string }> {
  const id = randomUUID();
  const destDir = join(dataDir(), "imports", id);
  await ensureDir(destDir);
  const dest = join(destDir, `source${extname(sourcePath) || ".bin"}`);
  await copyFile(sourcePath, dest);
  return { id, dest };
}

export async function saveImportBytes(name: string, bytes: Buffer): Promise<{ id: string; dest: string }> {
  const id = randomUUID();
  const destDir = join(dataDir(), "imports", id);
  await ensureDir(destDir);
  const ext = extname(name).toLowerCase() || ".jpg";
  const dest = join(destDir, `source${ext}`);
  await writeFile(dest, bytes);
  return { id, dest };
}

export type PendingImport = {
  path: string;
  createdAt: string;
  prompt?: string;
  model?: string;
  effort?: string;
};

export async function writePendingImport(path: string, extra: Partial<PendingImport> = {}): Promise<PendingImport> {
  const pending: PendingImport = { path, createdAt: new Date().toISOString(), ...extra };
  await writeFile(filePath("pending-import.json"), JSON.stringify(pending, null, 2), "utf8");
  return pending;
}

export async function getPendingImport(): Promise<PendingImport | null> {
  const raw = await readJson<PendingImport | null>(filePath("pending-import.json"), null);
  if (!raw?.path || !existsSync(raw.path)) return null;
  return raw;
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export async function appendLog(line: string) {
  const path = filePath("logs/main.log");
  await appendFile(path, `${new Date().toISOString()} ${line}\n`, "utf8");
  try {
    const s = await stat(path);
    if (s.size > 1_000_000) {
      await writeFile(path, `${new Date().toISOString()} log rotated\n`, "utf8");
    }
  } catch {
    /* ignore */
  }
}

