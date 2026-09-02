import { useAppStore, type Screen } from "../../store/app-store";

const PRIMARY: { id: Screen; label: string }[] = [
  { id: "home", label: "Studio" },
  { id: "library", label: "Library" },
  { id: "practice", label: "Practice" },
  { id: "import", label: "Import" },
];

const DRILLS: { id: Screen; label: string }[] = [
  { id: "rhythm", label: "Rhythm" },
  { id: "sight", label: "Sight-reading" },
  { id: "technique", label: "Technique" },
];

export function Sidebar() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const lesson = useAppStore((s) => s.lesson);

  return (
    <aside className="sidebar">
      <nav className="side-nav">
        {PRIMARY.map((item) => (
          <button
            key={item.id}
            type="button"
            className={screen === item.id || (item.id === "home" && screen === "placement") ? "active" : ""}
            onClick={() => setScreen(item.id === "practice" && !lesson ? "library" : item.id)}
          >
            {item.label}
          </button>
        ))}
        <div className="side-label">Drills</div>
        {DRILLS.map((item) => (
          <button key={item.id} type="button" className={screen === item.id ? "active" : ""} onClick={() => setScreen(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
      <button
        type="button"
        className={`side-settings${screen === "settings" ? " active" : ""}`}
        onClick={() => setScreen("settings")}
      >
        Settings
      </button>
    </aside>
  );
}
