import { useEffect, useRef, useState } from "react";
import { createMetronome } from "../audio/metronome";

const PATTERN = [1, 0, 1, 1, 0, 1, 0, 1];

export function RhythmScreen() {
  const [running, setRunning] = useState(false);
  const [hits, setHits] = useState(0);
  const [taps, setTaps] = useState(0);
  const [step, setStep] = useState(0);
  const metro = useRef(createMetronome());

  useEffect(() => {
    const m = metro.current;
    m.setBpm(90);
    m.setBeats(8);
    m.setVolume(70);
    m.onBeat = (b) => setStep(b);
    return () => m.stop();
  }, []);

  function tap() {
    setTaps((t) => t + 1);
    if (PATTERN[step]) setHits((h) => h + 1);
  }

  return (
    <div className="page">
      <div className="stack">
        <h1>Rhythm workout</h1>
        <p className="muted">Tap on the accented beats. Isolated from pitches so you do not only learn Guitar-Hero hitting.</p>
        <div className="rhythm-track">
          {PATTERN.map((on, i) => (
            <div key={i} className={`rhythm-cell${on ? " on" : ""}${i === step ? " now" : ""}`}>
              {on ? "TAP" : "·"}
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button
            className="primary"
            onClick={() => {
              if (running) {
                metro.current.stop();
                setRunning(false);
              } else {
                metro.current.start();
                setRunning(true);
              }
            }}
          >
            {running ? "Stop" : "Start"}
          </button>
          <button className="tap-btn" onClick={tap}>
            TAP
          </button>
        </div>
        <p className="muted" style={{ textAlign: "center", fontSize: "1.15rem" }}>
          Hits {hits} / taps {taps} · gold block = now
        </p>
      </div>
    </div>
  );
}
