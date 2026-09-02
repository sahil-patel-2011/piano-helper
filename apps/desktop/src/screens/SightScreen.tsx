import { useMemo, useState } from "react";
import { pitchToMidi } from "@piano-helper/shared";
import { PianoKeyboard } from "../components/keyboard/PianoKeyboard";
import { StaffBoard } from "../components/staff/StaffBoard";

export function SightScreen() {
  const [level, setLevel] = useState(1);
  const pool = useMemo(
    () => (level === 1 ? ["C4", "E4", "G4"] : level === 2 ? ["C4", "D4", "E4", "F4", "G4"] : ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"]),
    [level],
  );
  const [target, setTarget] = useState("C4");
  const [score, setScore] = useState({ ok: 0, n: 0 });

  function nextNote() {
    setTarget(pool[Math.floor(Math.random() * pool.length)]);
  }

  function judge(ok: boolean) {
    setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 }));
    nextNote();
  }

  const midi = pitchToMidi(target);

  return (
    <div className="page">
      <div className="stack">
        <h1>Sight-reading</h1>
        <p className="muted">The gold oval is the note. Match it on the gold piano key.</p>
        <div className="row">
          {[1, 2, 3].map((n) => (
            <button key={n} className={level === n ? "primary" : ""} onClick={() => setLevel(n)}>
              Level {n}
            </button>
          ))}
          <span className="muted" style={{ marginLeft: "auto", fontSize: "1.15rem" }}>
            {score.ok} / {score.n} correct
          </span>
        </div>
        <StaffBoard pitches={[target]} />
        <div className="play-hero">
          <div className="play-label">Play this</div>
          <div className="play-note">{target}</div>
        </div>
        <PianoKeyboard targets={[midi]} onPlay={(played) => judge(played === midi)} />
      </div>
    </div>
  );
}
