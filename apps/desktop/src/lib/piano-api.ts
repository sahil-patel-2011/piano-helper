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

export function getPiano(): PianoAPI {
  return window.piano ?? browserFallback();
}

export function isDesktopApp() {
  return Boolean(window.piano);
}

export const defaultAppSettings = (): AppSettings => defaultSettings();
export type { DeviceProfile };
