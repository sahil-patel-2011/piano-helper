import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, DeviceProfile, Lesson, MeasureMasteryMap, ProgressStats } from "@piano-helper/shared";
import type { LiveState } from "./app-state";
import type { ClaudeStatus } from "./claude-types";

export type PianoAPI = {
  getProfile: () => Promise<DeviceProfile | null>;
  saveProfile: (p: DeviceProfile) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (s: AppSettings) => Promise<void>;
  getProgress: () => Promise<{ stats: ProgressStats; measures: MeasureMasteryMap }>;
  saveProgress: (stats: ProgressStats, measures: MeasureMasteryMap) => Promise<void>;
  storeSecret: (provider: string, key: string) => Promise<void>;
  getSecretExists: (provider: string) => Promise<boolean>;
  deleteSecret: (provider: string) => Promise<void>;
  pickImportFile: () => Promise<string | null>;
  runOmr: (path: string) => Promise<Lesson>;
  importBytes: (payload: { name: string; base64: string }) => Promise<Lesson>;
  saveLesson: (lesson: Lesson) => Promise<void>;
  listLibrary: () => Promise<{ id: string; title: string; source: string; difficulty: number }[]>;
  loadLesson: (id: string) => Promise<Lesson | null>;
  startBridge: () => Promise<{ port: number; token: string }>;
  stopBridge: () => Promise<void>;
  getBridgeStatus: () => Promise<{ enabled: boolean; port: number | null; connected: boolean }>;
  addClaudeMcp: () => Promise<{ ok: boolean; message: string; status?: ClaudeStatus }>;
  connectClaude: () => Promise<{ ok: boolean; message: string; status: ClaudeStatus }>;
  claudeStatus: () => Promise<ClaudeStatus>;
  openClaudeDesktop: () => Promise<{ ok: boolean }>;
  copyClaudePrompt: () => Promise<{ prompt: string }>;
  handoffImport: (payload: { name: string; base64: string }) => Promise<{
    ok: boolean;
    path: string;
    prompt: string;
    message: string;
  }>;
  handoffPath: (path: string) => Promise<{
    ok: boolean;
    path: string;
    prompt: string;
    message: string;
  }>;
  mcpConfig: () => Promise<string>;
  testProvider: () => Promise<{ ok: boolean; message: string }>;
  pushLive: (state: LiveState) => void;
  onCommand: (cb: (cmd: Record<string, unknown>) => void) => () => void;
  minimize: () => void;
  toggleMaximize: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (cb: (maxed: boolean) => void) => () => void;
};

const piano: PianoAPI = {
  getProfile: () => ipcRenderer.invoke("piano:getProfile"),
  saveProfile: (p) => ipcRenderer.invoke("piano:saveProfile", p),
  getSettings: () => ipcRenderer.invoke("piano:getSettings"),
  saveSettings: (s) => ipcRenderer.invoke("piano:saveSettings", s),
  getProgress: () => ipcRenderer.invoke("piano:getProgress"),
  saveProgress: (stats, measures) => ipcRenderer.invoke("piano:saveProgress", stats, measures),
  storeSecret: (provider, key) => ipcRenderer.invoke("piano:storeSecret", provider, key),
  getSecretExists: (provider) => ipcRenderer.invoke("piano:getSecretExists", provider),
  deleteSecret: (provider) => ipcRenderer.invoke("piano:deleteSecret", provider),
  pickImportFile: () => ipcRenderer.invoke("piano:pickImportFile"),
  runOmr: (path) => ipcRenderer.invoke("piano:runOmr", path),
  importBytes: (payload) => ipcRenderer.invoke("piano:importBytes", payload),
  saveLesson: (lesson) => ipcRenderer.invoke("piano:saveLesson", lesson),
  listLibrary: () => ipcRenderer.invoke("piano:listLibrary"),
  loadLesson: (id) => ipcRenderer.invoke("piano:loadLesson", id),
  startBridge: () => ipcRenderer.invoke("piano:startBridge"),
  stopBridge: () => ipcRenderer.invoke("piano:stopBridge"),
  getBridgeStatus: () => ipcRenderer.invoke("piano:getBridgeStatus"),
  addClaudeMcp: () => ipcRenderer.invoke("piano:addClaudeMcp"),
  connectClaude: () => ipcRenderer.invoke("piano:connectClaude"),
  claudeStatus: () => ipcRenderer.invoke("piano:claudeStatus"),
  openClaudeDesktop: () => ipcRenderer.invoke("piano:openClaudeDesktop"),
  copyClaudePrompt: () => ipcRenderer.invoke("piano:copyClaudePrompt"),
  handoffImport: (payload) => ipcRenderer.invoke("piano:handoffImport", payload),
  handoffPath: (path) => ipcRenderer.invoke("piano:handoffPath", path),
  mcpConfig: () => ipcRenderer.invoke("piano:mcpConfig"),
  testProvider: () => ipcRenderer.invoke("piano:testProvider"),
  pushLive: (state) => ipcRenderer.send("piano:live", state),
  onCommand: (cb) => {
    const listener = (_: unknown, cmd: Record<string, unknown>) => cb(cmd);
    ipcRenderer.on("piano:command", listener);
    return () => ipcRenderer.removeListener("piano:command", listener);
  },
  minimize: () => ipcRenderer.send("win:minimize"),
  toggleMaximize: () => ipcRenderer.send("win:maximize"),
  closeWindow: () => ipcRenderer.send("win:close"),
  isMaximized: () => ipcRenderer.invoke("win:isMaximized"),
  onMaximizeChange: (cb) => {
    const listener = (_: unknown, maxed: boolean) => cb(maxed);
    ipcRenderer.on("win:state", listener);
    return () => ipcRenderer.removeListener("win:state", listener);
  },
};

contextBridge.exposeInMainWorld("piano", piano);
