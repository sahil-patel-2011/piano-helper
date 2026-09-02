import { useEffect, useMemo, useState } from "react";
import {
  calibrationSequence,
  matchWindowForInstrument,
  pitchToMidi,
  type Brand,
  type DeviceProfile,
  type Instrument,
  type KeyCount,
} from "@piano-helper/shared";
import { COPY } from "@piano-helper/shared";
import { PianoKeyboard } from "../components/keyboard/PianoKeyboard";
import { startListening } from "../audio/listen";
import { silentTuner, type TunerReading } from "../audio/capture";
import { MicTuner } from "../components/tuner/MicTuner";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

const BRANDS: Brand[] = ["Yamaha", "Steinway", "Casio", "Roland", "Kawai", "Other"];

export function OnboardingScreen({ recalibrate = false }: { recalibrate?: boolean }) {
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const setProfile = useAppStore((s) => s.setProfile);
  const setSettings = useAppStore((s) => s.setSettings);
  const setScreen = useAppStore((s) => s.setScreen);
  const setMicLevel = useAppStore((s) => s.setMicLevel);
  const micLevel = useAppStore((s) => s.micLevel);

  const [step, setStep] = useState(0);
  const [instrument, setInstrument] = useState<Instrument>(profile?.instrument ?? "acoustic");
  const [brand, setBrand] = useState<Brand>(profile?.brand ?? "Other");
  const [keyCount, setKeyCount] = useState<KeyCount>(profile?.keyCount ?? 88);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [midiName, setMidiName] = useState<string | null>(null);
  const [tuner, setTuner] = useState<TunerReading>(silentTuner("silent"));
  const [heardCents, setHeardCents] = useState<number[]>([]);
  const [doneNotes, setDoneNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sequence = useMemo(() => calibrationSequence(keyCount), [keyCount]);
  const current = sequence[doneNotes.length];

  useEffect(() => {
    if (step < 4) return;
    let stop: (() => void) | undefined;
    void startListening(
      null,
      (note) => {
        if (step === 4) {
          setMicOk(true);
          return;
        }
        if (step !== 5 || !current) return;
        const target = pitchToMidi(current);
        if (Math.abs(note.midi - target) <= 1) {
          setHeardCents((c) => [...c, note.centsError]);
          setDoneNotes((d) => (d.includes(current) ? d : [...d, current]));
        }
      },
      (rms) => setMicLevel(rms),
      (name) => setMidiName(name),
      (reading) => setTuner(reading),
    )
      .then((h) => {
        stop = h.stop;
        setMicOk(true);
      })
      .catch(() => {
        setMicOk(false);
        setError(COPY.micDenied);
      });
    return () => stop?.();
  }, [step, current, setMicLevel]);

  async function finish() {
    const offset =
      heardCents.length > 0 ? heardCents.reduce((a, b) => a + b, 0) / heardCents.length : 0;
    const next: DeviceProfile = {
      instrument,
      brand,
      keyCount,
      centsOffset: offset,
      noiseFloorRms: 0.01,
      minHitRms: 0.02,
      confirmedOctaves: Object.fromEntries(doneNotes.map((p) => [p, pitchToMidi(p)])),
      preferMidi: Boolean(midiName),
      lastMidiId: null,
      yinThreshold: 0.15,
      matchWindowCents: matchWindowForInstrument(instrument),
      calibratedAt: new Date().toISOString(),
    };
    const api = getPiano();
    await api.saveProfile(next);
    const nextSettings = { ...settings, onboardingComplete: true };
    await api.saveSettings(nextSettings);
    setProfile(next);
    setSettings(nextSettings);
    if (recalibrate || settings.placementComplete) setScreen("home");
    else setScreen("placement");
  }

  const titles = [
    "Welcome",
    "Instrument",
    "Brand",
    "Keys",
    "Input",
    "Play along",
  ];

  return (
    <div className="page">
      <div className="stack">
        <div className="muted">{titles[step]}</div>
        {step === 0 && (
          <>
            <h1>Piano Helper listens and waits.</h1>
            <p className="muted">No subscription. Your music. A quiet studio for adults who outgrew the cartoon apps.</p>
            <div className="row">
              <button className="primary" onClick={() => setStep(1)}>
                Continue
              </button>
              <button className="ghost" onClick={() => void finish()}>
                Skip setup — open studio
              </button>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2>What are you playing?</h2>
            <div className="row">
              {(["acoustic", "digital", "keyboard"] as Instrument[]).map((i) => (
                <button key={i} className={`choice ${instrument === i ? "selected" : ""}`} onClick={() => setInstrument(i)}>
                  {i}
                </button>
              ))}
            </div>
            <button className="primary" onClick={() => setStep(2)}>
              Next
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <h2>Brand</h2>
            <p className="muted">This only sets a timbre preset. You do not need the exact model.</p>
            <div className="row">
              {BRANDS.map((b) => (
                <button key={b} className={`choice ${brand === b ? "selected" : ""}`} onClick={() => setBrand(b)}>
                  {b}
                </button>
              ))}
            </div>
            <button className="primary" onClick={() => setStep(3)}>
              Next
            </button>
          </>
        )}
        {step === 3 && (
          <>
            <h2>How many keys?</h2>
            <div className="row">
              {([61, 76, 88] as KeyCount[]).map((n) => (
                <button key={n} className={`choice ${keyCount === n ? "selected" : ""}`} onClick={() => setKeyCount(n)}>
                  {n}
                </button>
              ))}
            </div>
            <p className="muted">61-key range is C2–C7. 88 is A0–C8.</p>
            <button className="primary" onClick={() => setStep(4)}>
              Next
            </button>
          </>
        )}
        {step === 4 && (
          <>
            <h2>Input check</h2>
            {micOk === false && <p>{COPY.micDenied}</p>}
            {micOk && <p className="muted">Microphone is open.</p>}
            {midiName && <p>MIDI: {midiName}</p>}
            <MicTuner tuner={tuner} />
            <div className="level">
              <span style={{ width: `${Math.min(100, micLevel * 800)}%` }} />
            </div>
            <button className="primary" onClick={() => setStep(5)}>
              Start play-along
            </button>
          </>
        )}
        {step === 5 && (
          <>
            <h2>Play the glowing key. Hold ~1 second.</h2>
            <p className="muted">
              {doneNotes.length} / {sequence.length}
              {current ? ` — now ${current}` : ""}
            </p>
            {error && <p>{error}</p>}
            <MicTuner tuner={tuner} targetPitch={current} targetMidi={current ? pitchToMidi(current) : null} />
            <p className="muted">Play the glowing key and hold. The tuner should name that note. No mic? Click the key.</p>
            <PianoKeyboard
              keyCount={keyCount}
              targets={current ? [pitchToMidi(current)] : []}
              onPlay={(midi) => {
                if (!current) return;
                const target = pitchToMidi(current);
                if (Math.abs(midi - target) <= 1) {
                  setHeardCents((c) => [...c, 0]);
                  setDoneNotes((d) => (d.includes(current) ? d : [...d, current]));
                }
              }}
            />
            <div className="row">
              <button
                className="primary"
                disabled={doneNotes.length < 3}
                onClick={() => void finish()}
              >
                Save calibration
              </button>
              <button className="ghost" onClick={() => void finish()}>
                Skip remaining
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
