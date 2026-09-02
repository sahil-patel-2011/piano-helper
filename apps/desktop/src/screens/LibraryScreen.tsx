import { useMemo, useState } from "react";
import { STARTERS } from "@piano-helper/starters";
import { useAppStore } from "../store/app-store";
import { getPiano } from "../lib/piano-api";

export function LibraryScreen() {
  const library = useAppStore((s) => s.library);
  const measures = useAppStore((s) => s.measures);
  const settings = useAppStore((s) => s.settings);
  const setLesson = useAppStore((s) => s.setLesson);
  const setScreen = useAppStore((s) => s.setScreen);
  const [q, setQ] = useState("");

  const items = useMemo(() => {
    const list = library.length ? library : STARTERS.map((s) => ({ id: s.id, title: s.title, source: s.source, difficulty: s.difficulty }));
    return list.filter((i) => i.title.toLowerCase().includes(q.toLowerCase()));
  }, [library, q]);

  return (
    <div className="page">
      <div className="stack wide">
        <div className="page-head">
          <h1>Library</h1>
          <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pieces" />
        </div>
        <div className="library-grid">
          {items.map((item) => {
            const dots = measures[item.id] ?? {};
            const full = STARTERS.find((s) => s.id === item.id);
            const preview = full?.measures
              .flatMap((m) => m.events.flatMap((e) => e.pitches))
              .slice(0, 8)
              .join("  →  ");
            return (
              <div key={item.id} className="card piece-card">
                <div className="serif piece-title">{item.title}</div>
                <div className="muted">
                  {item.source} · level {item.difficulty}
                </div>
                {preview && <div className="note-preview">{preview}</div>}
                <div className="dots">
                  {Object.values(dots).map((d, i) => (
                    <span key={i} className={`dot ${d.state}`} />
                  ))}
                </div>
                <button
                  className="primary"
                  onClick={async () => {
                    const lesson = await getPiano().loadLesson(item.id);
                    if (!lesson) return;
                    setLesson(lesson);
                    const next = { ...settings, lastPieceId: item.id };
                    useAppStore.getState().setSettings(next);
                    await getPiano().saveSettings(next);
                    setScreen("practice");
                  }}
                >
                  Practice
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
