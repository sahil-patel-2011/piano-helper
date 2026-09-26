import {
  AppSettingsSchema,
  DeviceProfileSchema,
  LessonSchema,
  ProgressStatsSchema,
  defaultSettings,
  type AppSettings,
  type DeviceProfile,
  type Lesson,
  type MeasureMasteryMap,
  type ProgressStats,
} from "@piano-helper/shared";
import { STARTERS } from "@piano-helper/starters";
import type { PianoAPI } from "../../electron/preload";
import type { LiveState } from "../../electron/app-state";

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

function browserFallback(): PianoAPI {
  const listeners = new Set<(cmd: Record<string, unknown>) => void>();
  return {
    async getProfile() {
      const raw = lsGet("ph.profile", null);
      const parsed = DeviceProfileSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    async saveProfile(p) {
      lsSet("ph.profile", p);
    },
    async getSettings() {
      return AppSettingsSchema.parse(lsGet("ph.settings", {}));
    },
    async saveSettings(s) {
      lsSet("ph.settings", s);
    },
    async getProgress() {
      return {
        stats: ProgressStatsSchema.parse(lsGet("ph.stats", {})),
        measures: lsGet<MeasureMasteryMap>("ph.measures", {}),
      };
    },
    async saveProgress(stats, measures) {
      lsSet("ph.stats", stats);
      lsSet("ph.measures", measures);
    },
    async storeSecret(provider, key) {
      lsSet(`ph.secret.${provider}`, "saved");
      sessionStorage.setItem(`ph.secret.${provider}`, key);
    },
    async getSecretExists(provider) {
      return Boolean(localStorage.getItem(`ph.secret.${provider}`));
    },
    async deleteSecret(provider) {
      localStorage.removeItem(`ph.secret.${provider}`);
      sessionStorage.removeItem(`ph.secret.${provider}`);
    },
    async pickImportFile() {
      return null;
    },
    async runOmr() {
      throw new Error("Open the Piano Helper window to import a photo.");
    },
    async importBytes() {
      throw new Error("Open the Piano Helper window to import a photo.");
    },
    async saveLesson(lesson) {
      const parsed = LessonSchema.parse(lesson);
      const lib = lsGet<Lesson[]>("ph.imported", []);
      lsSet("ph.imported", [parsed, ...lib.filter((l) => l.id !== parsed.id)]);
    },
    async listLibrary() {
      const imported = lsGet<Lesson[]>("ph.imported", []);
      return [...STARTERS, ...imported].map((l) => ({
        id: l.id,
        title: l.title,
        source: l.source,
        difficulty: l.difficulty,
      }));
    },
    async loadLesson(id) {
      const imported = lsGet<Lesson[]>("ph.imported", []);
      return STARTERS.find((s) => s.id === id) ?? imported.find((s) => s.id === id) ?? null;
    },
    async startBridge() {
      return { port: 18765, token: "browser-dev" };
    },
    async stopBridge() {},
    async getBridgeStatus() {
      return { enabled: false, port: null, connected: false };
    },
    async addClaudeMcp() {
      return { ok: false, message: "Use the Piano Helper window to connect Claude Code." };
    },
    async connectClaude() {
      return {
        ok: false,
        message: "Use the Piano Helper window — Claude Code needs the desktop app.",
        status: {
          cliPath: null,
          cliFound: false,
          cliLoggedIn: false,
          loggedIn: false,
          usingSubscription: false,
          apiKeyInEnv: false,
          mcpRegistered: false,
          mcpTargets: [],
          command: [],
          message: "Open the Piano Helper desktop window to connect.",
          desktopAppFound: false,
          desktopRunning: false,
          desktopSignedIn: false,
          desktopConfigPath: null,
        },
      };
    },
    async claudeStatus() {
      return {
        cliPath: null,
        cliFound: false,
        cliLoggedIn: false,
        loggedIn: false,
        usingSubscription: false,
        apiKeyInEnv: false,
        mcpRegistered: false,
        mcpTargets: [],
        command: [],
        message: "Open the Piano Helper desktop window to connect Claude Desktop.",
        desktopAppFound: false,
        desktopRunning: false,
        desktopSignedIn: false,
        desktopConfigPath: null,
      };
    },
    async openClaudeDesktop() {
      return { ok: false };
    },
    async copyClaudePrompt() {
      return { prompt: "" };
    },
    async handoffImport() {
      throw new Error("Open the Piano Helper window to send a score to Claude Desktop.");
    },
    async handoffPath() {
      throw new Error("Open the Piano Helper window to send a score to Claude Desktop.");
    },
    async mcpConfig() {
      return JSON.stringify({ mcpServers: { "piano-helper": { command: "piano-helper", args: ["mcp"] } } }, null, 2);
    },
    async testProvider() {
      return { ok: false, message: "Provider tests run in the desktop app." };
    },
    pushLive(_state: LiveState) {},
    onCommand(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    minimize() {},
    toggleMaximize() {},
    closeWindow() {},
    async isMaximized() {
      return false;
    },
    onMaximizeChange() {
      return () => {};
    },
  };
}

// ---------------------------------------------------------------- studio server
// When the page is served by `piano-helper studio`, storage and score reading go
// to that computer. The device profile (mic calibration) stays in this browser,
// because a phone mic and a laptop mic hear the same piano differently.

declare global {
  interface Window {
    __PH_STUDIO__?: { studio: true; key: string | null };
  }
}

export type StudioEngine = { id: "claude" | "codex"; label: string; path: string | null; found: boolean };
export type StudioStatus = {
  engines: StudioEngine[];
  active: "claude" | "codex" | null;
  preferred: "auto" | "claude" | "codex";
  dataDir: string;
  lan: string[];
};

export class StudioError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export function isStudio() {
  return !window.piano && Boolean(window.__PH_STUDIO__?.studio);
}

let cachedKey: string | null = null;

function studioKey(): string {
  if (cachedKey !== null) return cachedKey;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("key");
  if (fromUrl) {
    try {
      localStorage.setItem("ph.studioKey", fromUrl);
    } catch {
      /* private mode: key lives for this tab only */
    }
    url.searchParams.delete("key");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("ph.studioKey");
  } catch {
    /* ignore */
  }
  cachedKey = window.__PH_STUDIO__?.key || fromUrl || saved || "";
  return cachedKey;
}

async function studioFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "x-piano-key": studioKey(), ...(init.body && !(init.body instanceof Blob) ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new StudioError(json.error?.message ?? `Studio error ${res.status}`, json.error?.code ?? "ERROR");
  return json;
}

export function studioStatus() {
  return studioFetch<StudioStatus>("/api/status");
}

export async function studioPaired(): Promise<boolean> {
  const r = await studioFetch<{ paired: boolean }>("/api/ping");
  return r.paired;
}

/**
 * Uploads a score photo and waits while Claude Code / Codex on the studio computer reads it.
 * A photo that was read before comes straight back from the saved copy (`cached`), with no AI call.
 */
export async function studioImport(
  file: Blob,
  name: string,
  onTick: (seconds: number) => void,
): Promise<{ lesson: Lesson; cached: boolean; engine?: string }> {
  const started = await studioFetch<{ id: string; status: string; cached?: boolean; lesson?: Lesson }>(`/api/import?name=${encodeURIComponent(name)}`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (started.status === "done" && started.lesson) {
    return { lesson: LessonSchema.parse(started.lesson), cached: Boolean(started.cached) };
  }
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const job = await studioFetch<{ status: string; lesson?: Lesson; error?: string; elapsedMs: number; engine?: string; cached?: boolean }>(`/api/jobs/${started.id}`);
    onTick(Math.round(job.elapsedMs / 1000));
    if (job.status === "done" && job.lesson) return { lesson: LessonSchema.parse(job.lesson), cached: Boolean(job.cached), engine: job.engine };
    if (job.status === "error") throw new StudioError(job.error ?? "Could not read that page.", "IMPORT_FAILED");
  }
}

function studioApi(): PianoAPI {
  const local = browserFallback();
  let liveTimer = 0;
  let pendingLive: LiveState | null = null;
  const state = () =>
    studioFetch<{
      settings: unknown;
      progress: { stats: unknown; measures: MeasureMasteryMap };
    }>("/api/state");

  return {
    ...local,
    async getSettings() {
      return AppSettingsSchema.parse((await state()).settings);
    },
    async saveSettings(s) {
      await studioFetch("/api/settings", { method: "PUT", body: JSON.stringify(s) });
    },
    async getProgress() {
      const { progress } = await state();
      return { stats: ProgressStatsSchema.parse(progress.stats), measures: progress.measures ?? {} };
    },
    async saveProgress(stats, measures) {
      await studioFetch("/api/progress", { method: "PUT", body: JSON.stringify({ stats, measures }) });
    },
    async saveLesson(lesson) {
      await studioFetch("/api/lessons", { method: "PUT", body: JSON.stringify(LessonSchema.parse(lesson)) });
    },
    async listLibrary() {
      return (await studioFetch<{ items: Awaited<ReturnType<PianoAPI["listLibrary"]>> }>("/api/library")).items;
    },
    async loadLesson(id) {
      try {
        return LessonSchema.parse(await studioFetch(`/api/lessons/${encodeURIComponent(id)}`));
      } catch {
        return null;
      }
    },
    pushLive(live) {
      // Throttled so Claude's app_status / get_expected tools see the current note without flooding Wi-Fi.
      pendingLive = live;
      if (liveTimer) return;
      liveTimer = window.setTimeout(() => {
        liveTimer = 0;
        const body = JSON.stringify(pendingLive);
        void fetch("/api/live", { method: "POST", body, headers: { "x-piano-key": studioKey(), "Content-Type": "application/json" } }).catch(() => undefined);
      }, 250);
    },
    onCommand(cb) {
      const source = new EventSource(`/api/events?key=${encodeURIComponent(studioKey())}`);
      source.onmessage = (e) => {
        try {
          cb(JSON.parse(e.data) as Record<string, unknown>);
        } catch {
          /* ignore malformed */
        }
      };
      return () => source.close();
    },
  };
}

let singleton: PianoAPI | null = null;

export function getPiano(): PianoAPI {
  if (window.piano) return window.piano;
  singleton ??= isStudio() ? studioApi() : browserFallback();
  return singleton;
}

export function isDesktopApp() {
  return Boolean(window.piano);
}

export const defaultAppSettings = (): AppSettings => defaultSettings();
export type { DeviceProfile };
