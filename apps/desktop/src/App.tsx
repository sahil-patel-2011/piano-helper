import { useEffect } from "react";
import { lessonHasUncertain } from "@piano-helper/shared";
import { Sidebar } from "./components/chrome/Sidebar";
import { Titlebar } from "./components/chrome/Titlebar";
import { useAppStore } from "./store/app-store";
import { getPiano, isDesktopApp } from "./lib/piano-api";
import { BootScreen } from "./screens/BootScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { PracticeScreen } from "./screens/PracticeScreen";
import { ImportScreen } from "./screens/ImportScreen";
import { EditorScreen } from "./screens/EditorScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { PlacementScreen } from "./screens/PlacementScreen";
import { RhythmScreen } from "./screens/RhythmScreen";
import { SightScreen } from "./screens/SightScreen";
import { TechniqueScreen } from "./screens/TechniqueScreen";

export function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);
  const setLesson = useAppStore((s) => s.setLesson);
  const setMode = useAppStore((s) => s.setMode);
  const setHands = useAppStore((s) => s.setHands);
  const setLoopMeasures = useAppStore((s) => s.setLoopMeasures);
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);

  useEffect(() => {
    return getPiano().onCommand(async (cmd) => {
      if (cmd.type === "open" && typeof cmd.id === "string") {
        const lesson = await getPiano().loadLesson(cmd.id);
        if (!lesson) return;
        if (lessonHasUncertain(lesson)) {
          setLesson(lesson);
          setScreen("editor");
          return;
        }
        setLesson(lesson);
        if (cmd.mode === "wait" || cmd.mode === "slow" || cmd.mode === "loop" || cmd.mode === "play") {
          setMode(cmd.mode);
        }
        if (Array.isArray(cmd.measures) && cmd.measures.length === 2) {
          setLoopMeasures([Number(cmd.measures[0]), Number(cmd.measures[1])]);
        }
        if (cmd.hands === "rh" || cmd.hands === "lh" || cmd.hands === "both" || cmd.hands === "all") {
          setHands(cmd.hands);
        }
        setScreen("practice");
      }
      if (cmd.type === "stop") setScreen("home");
      if (cmd.type === "mixer" && cmd.patch && typeof cmd.patch === "object") {
        const mixer = { ...settings.mixer, ...(cmd.patch as object) };
        const next = { ...settings, mixer };
        setSettings(next);
        await getPiano().saveSettings(next);
      }
      if (cmd.type === "imported" && cmd.lesson) {
        setLesson(cmd.lesson as never);
        setScreen("editor");
      }
    });
  }, [setHands, setLesson, setLoopMeasures, setMode, setScreen, setSettings, settings]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(clearToast, 4000);
    return () => window.clearTimeout(t);
  }, [toast, clearToast]);

  const hideSidebar = screen === "boot" || screen === "onboarding";

  return (
    <div className={`app${isDesktopApp() ? " is-desktop" : " is-web"}`}>
      <Titlebar />
      <div className="shell">
        {!hideSidebar && <Sidebar />}
        <main className="workspace">
          {screen === "boot" && <BootScreen />}
          {screen === "onboarding" && <OnboardingScreen />}
          {screen === "home" && <HomeScreen />}
          {screen === "library" && <LibraryScreen />}
          {screen === "practice" && <PracticeScreen />}
          {screen === "import" && <ImportScreen />}
          {screen === "editor" && <EditorScreen />}
          {screen === "settings" && <SettingsScreen />}
          {screen === "placement" && <PlacementScreen />}
          {screen === "rhythm" && <RhythmScreen />}
          {screen === "sight" && <SightScreen />}
          {screen === "technique" && <TechniqueScreen />}
        </main>
      </div>
      {toast && <div className="toast">{toast.text}</div>}
    </div>
  );
}
