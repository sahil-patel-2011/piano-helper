import { create } from "zustand";
import type {
  AppSettings,
  DeviceProfile,
  Hand,
  Lesson,
  MeasureMasteryMap,
  PracticeMode,
  ProgressStats,
} from "@piano-helper/shared";
import { defaultSettings } from "@piano-helper/shared";

export type Screen =
  | "boot"
  | "onboarding"
  | "home"
  | "library"
  | "practice"
  | "import"
  | "editor"
  | "settings"
  | "placement"
  | "rhythm"
  | "sight"
  | "technique";

export type Toast = { id: number; text: string };

type AppState = {
  screen: Screen;
  settings: AppSettings;
  profile: DeviceProfile | null;
  stats: ProgressStats;
  measures: MeasureMasteryMap;
  library: { id: string; title: string; source: string; difficulty: number }[];
  lesson: Lesson | null;
  mode: PracticeMode;
  hands: Hand | "all";
  loopMeasures: [number, number] | null;
  toast: Toast | null;
  micLevel: number;
  midiName: string | null;
  preferMidiActive: boolean;
  loaded: boolean;
  setScreen: (s: Screen) => void;
  setSettings: (s: AppSettings) => void;
  setProfile: (p: DeviceProfile | null) => void;
  setProgress: (stats: ProgressStats, measures: MeasureMasteryMap) => void;
  setLibrary: (items: AppState["library"]) => void;
  setLesson: (lesson: Lesson | null) => void;
  setMode: (mode: PracticeMode) => void;
  setHands: (hands: Hand | "all") => void;
  setLoopMeasures: (span: [number, number] | null) => void;
  showToast: (text: string) => void;
  clearToast: () => void;
  setMicLevel: (n: number) => void;
  setMidi: (name: string | null, prefer: boolean) => void;
  setLoaded: (v: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  screen: "boot",
  settings: defaultSettings(),
  profile: null,
  stats: { sessions: [], dailySeconds: {}, lastActiveDate: null },
  measures: {},
  library: [],
  lesson: null,
  mode: "wait",
  hands: "all",
  loopMeasures: null,
  toast: null,
  micLevel: 0,
  midiName: null,
  preferMidiActive: false,
  loaded: false,
  setScreen: (screen) => set({ screen }),
  setSettings: (settings) => set({ settings }),
  setProfile: (profile) => set({ profile }),
  setProgress: (stats, measures) => set({ stats, measures }),
  setLibrary: (library) => set({ library }),
  setLesson: (lesson) => set({ lesson }),
  setMode: (mode) => set({ mode }),
  setHands: (hands) => set({ hands }),
  setLoopMeasures: (loopMeasures) => set({ loopMeasures }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
  clearToast: () => set({ toast: null }),
  setMicLevel: (micLevel) => set({ micLevel }),
  setMidi: (midiName, preferMidiActive) => set({ midiName, preferMidiActive }),
  setLoaded: (loaded) => set({ loaded }),
}));
