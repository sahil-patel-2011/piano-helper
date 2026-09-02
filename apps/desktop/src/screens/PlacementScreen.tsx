import { useState } from "react";
import { pitchToMidi } from "@piano-helper/shared";
import { PianoKeyboard } from "../components/keyboard/PianoKeyboard";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

const PROMPTS = [
  { label: "Single C4", pitches: ["C4"] },
  { label: "Stepwise E4", pitches: ["E4"] },
  { label: "Skip G4", pitches: ["G4"] },
  { label: "Black key F#4", pitches: ["F#4"] },
  { label: "Two-note C-E", pitches: ["C4", "E4"] },
];

export function PlacementScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setScreen = useAppStore((s) => s.setScreen);
  const [i, setI] = useState(0);
  const current = PROMPTS[i];

  async function done() {
    const next = { ...settings, placementComplete: true };
    setSettings(next);
    await getPiano().saveSettings(next);
    setScreen("home");
  }

  return (
    <div className="page">
      <div className="stack">
        <h1>Placement</h1>
        <p className="muted">Optional. The library stays open either way.</p>
        {current && (
          <>
            <h2>
              {i + 1} / {PROMPTS.length} — {current.label}
            </h2>
            <PianoKeyboard targets={current.pitches.map(pitchToMidi)} />
          </>
        )}
        <div className="row">
          <button
            className="primary"
            onClick={() => {
              if (i + 1 >= PROMPTS.length) void done();
              else setI(i + 1);
            }}
          >
            I can play this
          </button>
          <button
            onClick={() => {
              if (i + 1 >= PROMPTS.length) void done();
              else setI(i + 1);
            }}
          >
            Too hard
          </button>
          <button className="ghost" onClick={() => void done()}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
