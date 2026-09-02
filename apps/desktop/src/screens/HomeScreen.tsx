import { computeStreak, todaySeconds } from "@piano-helper/shared";
import { STARTERS } from "@piano-helper/starters";
import { useAppStore } from "../store/app-store";
import { getPiano } from "../lib/piano-api";

export function HomeScreen() {
  const settings = useAppStore((s) => s.settings);
  const stats = useAppStore((s) => s.stats);
  const profile = useAppStore((s) => s.profile);
  const measures = useAppStore((s) => s.measures);
  const setScreen = useAppStore((s) => s.setScreen);
  const setLesson = useAppStore((s) => s.setLesson);
  const today = todaySeconds(stats);
  const goal = settings.dailyGoalMinutes * 60;
  const pct = Math.min(100, Math.round((today / goal) * 100));
  const streak = computeStreak(stats.dailySeconds);
  const lastSession = stats.sessions[0];
  const last = settings.lastPieceId
    ? STARTERS.find((s) => s.id === settings.lastPieceId) ?? STARTERS[0]
    : STARTERS[0];
  const preview = last?.measures.flatMap((m) => m.events.flatMap((e) => e.pitches)).slice(0, 8).join("  →  ");
  const pieceMastery = last ? measures[last.id] ?? {} : {};
  const mastered = Object.values(pieceMastery).filter((m) => m.state === "mastered").length;
  const totalBars = last?.measures.length ?? 0;
  const weakBar = last?.measures.find((m) => (pieceMastery[String(m.n)]?.state ?? "needs_work") !== "mastered");

  return (
    <div className="page">
      <div className="stack wide">
        <div className="page-head">
          <div>
            <h1>Studio</h1>
            <p className="muted">Your piano on this computer. No catalog, no subscription.</p>
          </div>
        </div>
        <div className="studio-grid">
          <div className="card studio-now">
            <div className="muted">Ready to play</div>
            <div className="serif studio-title">{last?.title ?? "C major five-finger"}</div>
            {preview && <div className="note-preview">{preview}</div>}
            <div className="muted" style={{ margin: "0.7rem 0 1.1rem" }}>
              {profile ? `${profile.brand} · ${profile.keyCount} keys` : "Mic tuner starts when you practice"}
              {totalBars ? ` · ${mastered}/${totalBars} bars locked` : ""}
              {lastSession ? ` · last run ${Math.round(lastSession.accuracy * 100)}%` : ""}
            </div>
            <div className="row">
              <button
                className="primary"
                onClick={async () => {
                  const id = settings.lastPieceId ?? last?.id;
                  if (!id) return;
                  const loaded = (await getPiano().loadLesson(id)) ?? last;
                  if (!loaded) return;
                  setLesson(loaded);
                  const next = { ...settings, lastPieceId: loaded.id };
                  useAppStore.getState().setSettings(next);
                  await getPiano().saveSettings(next);
                  setScreen("practice");
                }}
              >
                Start this piece
              </button>
              {weakBar && (
                <button
                  onClick={async () => {
                    if (!last) return;
                    setLesson(last);
                    useAppStore.getState().setLoopMeasures([weakBar.n, weakBar.n]);
                    useAppStore.getState().setMode("loop");
                    const next = { ...settings, lastPieceId: last.id };
                    useAppStore.getState().setSettings(next);
                    await getPiano().saveSettings(next);
                    setScreen("practice");
                  }}
                >
                  Drill bar {weakBar.n}
                </button>
              )}
              <button onClick={() => setScreen("library")}>Open library</button>
            </div>
          </div>
          <div className="card studio-goal">
            <svg className="ring" viewBox="0 0 36 36">
              <path
                d="M18 2.5 a 15.5 15.5 0 1 1 0 31 a 15.5 15.5 0 1 1 0 -31"
                fill="none"
                stroke="#2a2925"
                strokeWidth="3"
              />
              <path
                d="M18 2.5 a 15.5 15.5 0 1 1 0 31 a 15.5 15.5 0 1 1 0 -31"
                fill="none"
                stroke="#f0c75a"
                strokeWidth="3"
                strokeDasharray={`${pct * 0.97} 100`}
              />
            </svg>
            <div className="goal-num">
              {Math.round(today / 60)} / {settings.dailyGoalMinutes}
            </div>
            <div className="muted">minutes today · streak {streak}</div>
          </div>
        </div>
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
      </div>
    </div>
  );
}
