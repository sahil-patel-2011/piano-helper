import { useEffect, useMemo, useRef, useState } from "react";
import {
  COPY,
  calibrationPlan,
  describePoint,
  hzToMidi,
  median,
  tuningOffset,
  type CalibrationPoint,
  type DeviceProfile,
  type KeyCount,
} from "@piano-helper/shared";
import { PianoKeyboard } from "../components/keyboard/PianoKeyboard";
import { KeyboardMap } from "../components/keyboard/KeyboardMap";
import { MicTuner } from "../components/tuner/MicTuner";
import { startListening, type ListenHandle } from "../audio/listen";
import { silentTuner, type TunerReading } from "../audio/capture";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

type Stage = "keys" | "quiet" | "play" | "done";

const QUIET_MS = 3000;
/** Frames (~16 ms each) of steady pitch needed before a key counts. */
const WINDOW = 20;
const NEEDED = 9;

type Frame = { midi: number; cents: number; rms: number };

export function OnboardingScreen() {
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const setProfile = useAppStore((s) => s.setProfile);
  const setSettings = useAppStore((s) => s.setSettings);
  const setScreen = useAppStore((s) => s.setScreen);

  const [stage, setStage] = useState<Stage>("keys");
  const [keyCount, setKeyCount] = useState<KeyCount>(profile?.keyCount ?? 88);
  const plan = useMemo(() => calibrationPlan(keyCount), [keyCount]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<CalibrationPoint[]>([]);
  const [tuner, setTuner] = useState<TunerReading>(silentTuner("silent"));
  const [feedback, setFeedback] = useState<{ text: string; wrong: number | null; good?: boolean } | null>(null);
  const [quietLeft, setQuietLeft] = useState(QUIET_MS);
  const [slow, setSlow] = useState(false);
  const [midiName, setMidiName] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // The mic callbacks run ~60x a second, so live values go through refs.
  // `armed` goes true only on a fresh strike, so the last key still ringing can never pass for this one.
  const live = useRef({ stage, idx, plan, noise: 0.008, quietStart: 0, lockedUntil: 0, armed: false, floor: Infinity });
  live.current.stage = stage;
  live.current.idx = idx;
  live.current.plan = plan;
  const ambient = useRef<number[]>([]);
  const frames = useRef<Frame[]>([]);
  const listenRef = useRef<ListenHandle | null>(null);
  const listening = stage === "quiet" || stage === "play";

  function rearm(ms: number) {
    frames.current = [];
    live.current.lockedUntil = performance.now() + ms;
    live.current.armed = false;
    live.current.floor = Infinity;
  }

  function record(point: CalibrationPoint) {
    rearm(700);
    setResults((r) => [...r.filter((p) => p.midi !== point.midi), point]);
    setFeedback(point.heard === null ? null : { text: "Got it", wrong: null, good: true });
    window.setTimeout(() => {
      setFeedback(null);
      setSlow(false);
      setIdx((i) => {
        const next = i + 1;
        if (next >= live.current.plan.length) setStage("done");
        return next;
      });
    }, point.heard === null ? 0 : 700);
  }

  function judge() {
    const step = live.current.plan[live.current.idx];
    if (!step) return;
    const recent = frames.current.slice(-WINDOW);
    const counts = new Map<number, number>();
    for (const f of recent) counts.set(f.midi, (counts.get(f.midi) ?? 0) + 1);
    const [mode, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    if (count < NEEDED) return;
    const same = recent.filter((f) => f.midi === mode);
    const shift = mode - step.midi;
    const extreme = step.midi < 48 || step.midi > 84;
    // Mics often read the deepest and highest keys an octave off. Only trust that at the
    // extremes; in the middle an octave miss almost always means a different C was pressed.
    if (shift === 0 || (extreme && shift % 12 === 0 && Math.abs(shift) <= 24)) {
      record({
        midi: step.midi,
        heard: mode,
        cents: shift === 0 ? median(same.map((f) => f.cents)) : null,
        rms: median(same.map((f) => f.rms)),
      });
      return;
    }
    rearm(300);
    const dir = mode < step.midi ? "left" : "right";
    setFeedback({
      text: Math.abs(shift) % 12 === 0 ? `That's a ${step.label.includes("C") ? "C" : "key"} in a different spot — the gold one is further ${dir}.` : `That key is a little to the ${mode < step.midi ? "left" : "right"} of the gold one.`,
      wrong: mode,
    });
  }

  useEffect(() => {
    if (!listening) return;
    let cancelled = false;
    live.current.quietStart = performance.now();
    ambient.current = [];
    void startListening(
      null,
      (note) => {
        const step = live.current.plan[live.current.idx];
        if (note.source !== "midi" || live.current.stage !== "play" || !step) return;
        if (note.midi === step.midi) record({ midi: step.midi, heard: step.midi, cents: null, rms: null });
      },
      (rms) => {
        const l = live.current;
        if (l.stage !== "quiet") return;
        const elapsed = performance.now() - l.quietStart;
        ambient.current.push(rms);
        setQuietLeft(Math.max(0, QUIET_MS - elapsed));
        if (elapsed >= QUIET_MS) {
          const sorted = [...ambient.current].sort((a, b) => a - b);
          l.noise = Math.max(0.002, Math.min(0.05, sorted[Math.floor(sorted.length * 0.9)] ?? 0.008));
          l.stage = "play";
          setStage("play");
        }
      },
      (name) => setMidiName(name),
      (reading) => {
        setTuner(reading);
        const l = live.current;
        if (l.stage !== "play" || performance.now() < l.lockedUntil) return;
        l.floor = Math.min(l.floor, reading.rms);
        if (!l.armed && reading.rms > Math.max(l.floor * 1.8, l.noise * 3)) {
          l.armed = true;
          frames.current = [];
        }
        if (!l.armed || reading.status !== "pitch" || !reading.hz || reading.rms < l.noise * 2) return;
        const f = hzToMidi(reading.hz);
        const midi = Math.round(f);
        frames.current.push({ midi, cents: (f - midi) * 100, rms: reading.rms });
        if (frames.current.length > 60) frames.current.shift();
        judge();
      },
    ).then((h) => {
      if (cancelled) return h.stop();
      listenRef.current = h;
      if (!h.micReady) setMicError(COPY.micDenied);
    });
    return () => {
      cancelled = true;
      listenRef.current?.stop();
      listenRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening]);

  useEffect(() => {
    if (stage !== "play") return;
    setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 9000);
    return () => window.clearTimeout(t);
  }, [stage, idx]);

  async function finish(skipAll = false) {
    const cal = skipAll ? [] : results;
    const loud = cal.map((p) => p.rms).filter((r): r is number => r !== null);
    const noise = live.current.noise;
    const next: DeviceProfile = {
      instrument: "acoustic",
      brand: "Other",
      keyCount,
      centsOffset: tuningOffset(cal),
      noiseFloorRms: noise,
      // Clear the room noise, but let soft playing (a fifth of the check's loudness) still count.
      minHitRms: Math.min(0.05, Math.max(noise * 2.5, (loud.length ? median(loud) : 0) * 0.2, 0.006)),
      confirmedOctaves: Object.fromEntries(cal.filter((p) => p.heard !== null).map((p) => [String(p.midi), p.heard as number])),
      preferMidi: Boolean(midiName),
      lastMidiId: null,
      yinThreshold: 0.15,
      matchWindowCents: 50,
      calibratedAt: new Date().toISOString(),
      calibration: cal,
    };
    const api = getPiano();
    const nextSettings = { ...settings, onboardingComplete: true, placementComplete: true };
    await api.saveProfile(next);
    await api.saveSettings(nextSettings);
    setProfile(next);
    setSettings(nextSettings);
    setScreen("home");
  }

  const step = plan[idx];
  const doneMidis = results.filter((r) => r.heard !== null).map((r) => r.midi);

  return (
    <div className="page">
      <div className="stack calibrate">
        {stage === "keys" && (
          <>
            <div className="muted">One-time setup · about a minute</div>
            <h1>Let's tune in to your piano.</h1>
            <p className="muted">
              Put this phone or laptop where it will sit when you practise — on the music stand is perfect. You'll play a
              handful of keys, from middle C out to the lowest and highest ones, so it knows what your piano sounds like
              through this mic.
            </p>
            <h3>How many keys does your piano have?</h3>
            <div className="row">
              {([88, 76, 61] as KeyCount[]).map((n) => (
                <button key={n} className={`choice ${keyCount === n ? "selected" : ""}`} onClick={() => setKeyCount(n)}>
                  {n}
                  {n === 88 ? " · full piano" : ""}
                </button>
              ))}
            </div>
            <p className="muted">Not sure? Most pianos have 88. Keyboards are often 61.</p>
            <div className="row">
              <button className="primary big" onClick={() => setStage("quiet")}>
                Start the mic check
              </button>
              {profile && (
                <button className="ghost" onClick={() => setScreen("home")}>
                  Cancel
                </button>
              )}
            </div>
            {!profile && (
              <button className="ghost" onClick={() => void finish(true)}>
                Skip — I'll tap keys on screen
              </button>
            )}
          </>
        )}

        {stage === "quiet" && (
          <>
            <div className="muted">Step 1 of 2</div>
            <h1>Stay quiet for a moment…</h1>
            <p className="muted">Measuring the room so background noise isn't mistaken for a note.</p>
            <div className="level">
              <span style={{ width: `${100 - (quietLeft / QUIET_MS) * 100}%` }} />
            </div>
            {micError && <p className="warn-line">{micError}</p>}
            <MicTuner tuner={tuner} onEnable={() => void listenRef.current?.resumeMic()} />
            {(micError || quietLeft === QUIET_MS) && (
              <button className="ghost" onClick={() => void finish(true)}>
                No mic — skip, I'll tap keys on screen
              </button>
            )}
          </>
        )}

        {stage === "play" && step && (
          <>
            <div className="muted">
              Step 2 of 2 · key {idx + 1} of {plan.length}
            </div>
            <h1>
              Play <span className="accent">{step.label}</span> and hold it
            </h1>
            <p className="muted">{step.hint}</p>
            <KeyboardMap keyCount={keyCount} target={step.midi} wrong={feedback?.wrong ?? null} done={doneMidis} />
            <div className={`cal-feedback ${feedback?.good ? "good" : feedback ? "bad" : ""}`}>
              {feedback?.text ?? (tuner.status === "pitch" ? "Listening…" : "Waiting for the key…")}
            </div>
            <PianoKeyboard keyCount={keyCount} targets={[step.midi]} showNames={false} showFingering={false} />
            <MicTuner tuner={tuner} onEnable={() => void listenRef.current?.resumeMic()} />
            {micError && <p className="warn-line">{micError}</p>}
            <div className="row">
              <button className={slow ? "primary" : "ghost"} onClick={() => record({ midi: step.midi, heard: null, cents: null, rms: null })}>
                {slow ? "It can't hear this one — skip" : "Skip this key"}
              </button>
            </div>
          </>
        )}

        {stage === "done" && (
          <>
            <div className="muted">All set</div>
            <h1>Here's what this device hears.</h1>
            <div className="cal-results">
              {plan.map((s) => {
                const p = results.find((r) => r.midi === s.midi);
                const d = p ? describePoint(p) : { ok: false, text: "Skipped" };
                return (
                  <div key={s.midi} className={`cal-row ${d.ok ? "ok" : "no"}`}>
                    <span className="cal-mark">{d.ok ? "✓" : "–"}</span>
                    <strong>{s.label}</strong>
                    <span className="muted">{d.text}</span>
                  </div>
                );
              })}
            </div>
            {results.length > 0 && Math.abs(tuningOffset(results)) >= 10 && (
              <p className="muted">
                Your piano sits about {Math.abs(tuningOffset(results))} cents {tuningOffset(results) > 0 ? "flat" : "sharp"}. That's
                fine — it's been accounted for.
              </p>
            )}
            {midiName && <p className="muted">Also found {midiName} over MIDI — that will be used when connected.</p>}
            <div className="row">
              <button className="primary big" onClick={() => void finish()}>
                Start playing
              </button>
              <button
                className="ghost"
                onClick={() => {
                  setResults([]);
                  setIdx(0);
                  setStage("quiet");
                }}
              >
                Run it again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
