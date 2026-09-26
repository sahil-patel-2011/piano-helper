import { useEffect, useState } from "react";
import { computeStreak, todaySeconds, type Lesson } from "@piano-helper/shared";
import { useAppStore } from "../store/app-store";
import { getPiano } from "../lib/piano-api";

export function HomeScreen() {
  const settings = useAppStore((s) => s.settings);
  const stats = useAppStore((s) => s.stats);
  const measures = useAppStore((s) => s.measures);
  const library = useAppStore((s) => s.library);
  const setScreen = useAppStore((s) => s.setScreen);
  const setLesson = useAppStore((s) => s.setLesson);
  const setMode = useAppStore((s) => s.setMode);
  const [last, setLast] = useState<Lesson | null>(null);
  const simple = settings.simpleView !== false;

  const today = todaySeconds(stats);
  const streak = computeStreak(stats.dailySeconds);
  const mine = library.filter((i) => i.source !== "builtin");

  useEffect(() => {
    const id = settings.lastPieceId ?? mine[0]?.id ?? library[0]?.id;
    if (!id) return;
    void getPiano().loadLesson(id).then(setLast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.lastPieceId, library.length]);

  async function open(id: string, mode: "learn" | "wait" = "learn") {
    const lesson = id === last?.id ? last : await getPiano().loadLesson(id);
    if (!lesson) return;
    setLesson(lesson);
    setMode(mode);
    const next = { ...settings, lastPieceId: lesson.id };
    useAppStore.getState().setSettings(next);
    void getPiano().saveSettings(next);
    setScreen("practice");
  }

  const mastery = last ? (measures[last.id] ?? {}) : {};
  const learned = last ? last.measures.filter((m) => mastery[String(m.n)]?.state === "mastered").length : 0;

  return (
    <div className="page">
      <div className="stack wide">
        <button className="card snap-card" onClick={() => setScreen("import")}>
          <div className="snap-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" strokeLinejoin="round" />
              <circle cx="12" cy="13" r="3.6" />
            </svg>
          </div>
          <div>
            <div className="serif snap-title">Snap your music</div>
            <div className="muted">Take a photo of a page. The AI works out the keys and fingers, then teaches it to you bar by bar.</div>
          </div>
        </button>

        {last && (
          <div className="card studio-now">
            <div className="muted">Keep learning</div>
            <div className="serif studio-title">{last.title}</div>
            <div className="bar-strip" aria-label={`${learned} of ${last.measures.length} bars learned`}>
              {last.measures.map((m) => (
                <span key={m.n} className={mastery[String(m.n)]?.state ?? "needs_work"} />
              ))}
            </div>
            <div className="muted" style={{ margin: "0.5rem 0 1rem" }}>
              {learned} of {last.measures.length} bars learned
              {last.summary ? ` · ${last.summary}` : ""}
            </div>
            <div className="row">
              <button className="primary big" onClick={() => void open(last.id, "learn")}>
                {learned === 0 ? "Start learning" : learned >= last.measures.length ? "Play from memory" : "Continue"}
              </button>
              <button onClick={() => void open(last.id, "wait")}>Just practise</button>
            </div>
          </div>
        )}

        {mine.length > 0 && (
          <div className="stack" style={{ gap: "0.5rem" }}>
            <h3 style={{ margin: 0 }}>Your music</h3>
            <div className="piece-list">
              {mine.slice(0, 8).map((p) => {
                const m = measures[p.id] ?? {};
                const done = Object.values(m).filter((x) => x.state === "mastered").length;
                return (
                  <button key={p.id} className="piece-row" onClick={() => void open(p.id)}>
                    <span className="serif">{p.title}</span>
                    <span className="muted">{done ? `${done} bars learned` : "new"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="row muted today-line">
          <span>
            {Math.round(today / 60)} min today · {streak}-day streak
          </span>
          <button className="ghost" onClick={() => setScreen("library")}>
            All pieces
          </button>
        </div>

        {!simple && (
          <div className="tool-grid">
            <button className="card tool-card" onClick={() => setScreen("rhythm")}>
              <div className="serif">Rhythm</div>
              <div className="muted">Tap the gold beat. No pitches.</div>
            </button>
            <button className="card tool-card" onClick={() => setScreen("sight")}>
              <div className="serif">Sight-reading</div>
              <div className="muted">Read the staff, play the gold key.</div>
            </button>
            <button className="card tool-card" onClick={() => setScreen("technique")}>
              <div className="serif">Technique</div>
              <div className="muted">Camera overlay for sit-tall / wrists.</div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
