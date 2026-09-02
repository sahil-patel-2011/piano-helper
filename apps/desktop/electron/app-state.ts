import type { BrowserWindow } from "electron";
import type { Lesson, Mixer, PracticeMode } from "@piano-helper/shared";

export type LiveState = {
  calibrated: boolean;
  input: "mic" | "midi";
  midiName: string | null;
  pieceId: string | null;
  pieceTitle: string | null;
  mode: PracticeMode | null;
  measure: number;
  measureCount: number;
  expected: string[];
  elapsedMs: number;
  accuracy: number;
  lastHit: string | null;
  lastMiss: string | null;
  mixer: Mixer;
  screen: string;
};

export const defaultLive = (): LiveState => ({
  calibrated: false,
  input: "mic",
  midiName: null,
  pieceId: null,
  pieceTitle: null,
  mode: null,
  measure: 1,
  measureCount: 1,
  expected: [],
  elapsedMs: 0,
  accuracy: 0,
  lastHit: null,
  lastMiss: null,
  mixer: { metronome: 0, preview: 40, backing: 50, ui: 15 },
  screen: "boot",
});

let live = defaultLive();
let win: BrowserWindow | null = null;

export function setWindow(w: BrowserWindow | null) {
  win = w;
}

export function getLive(): LiveState {
  return live;
}

export function setLive(next: LiveState) {
  live = next;
}

export function sendCommand(command: Record<string, unknown>) {
  win?.webContents.send("piano:command", command);
}

export const lastConnectedAt = { t: 0 };

export function touchConnected() {
  lastConnectedAt.t = Date.now();
}

export function isConnected(): boolean {
  return Date.now() - lastConnectedAt.t < 60_000;
}

export type ImportJob = {
  id: string;
  status: "running" | "done" | "error";
  error?: string;
  lesson?: Lesson;
};

export const jobs = new Map<string, ImportJob>();
