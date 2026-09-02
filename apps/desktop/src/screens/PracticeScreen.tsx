import { useEffect, useMemo, useRef, useState } from "react";
import {
  COPY,
  adviceAt,
  localDateKey,
  nextMastery,
  type PracticeMode,
} from "@piano-helper/shared";
import { PianoKeyboard } from "../components/keyboard/PianoKeyboard";
import { StaffBoard } from "../components/staff/StaffBoard";
import { HandCoach } from "../components/coach/HandCoach";
import { MicTuner } from "../components/tuner/MicTuner";
import { silentTuner, type TunerReading } from "../audio/capture";
import { createMetronome } from "../audio/metronome";
import { startListening, type ListenHandle } from "../audio/listen";
import { PracticeEngine, type EngineSnapshot } from "../engine/practice-engine";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";
import type { LiveState } from "../../electron/app-state";

export function PracticeScreen() {
  const lesson = useAppStore((s) => s.lesson);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const hands = useAppStore((s) => s.hands);
  const setHands = useAppStore((s) => s.setHands);
  const profile = useAppStore((s) => s.profile);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const stats = useAppStore((s) => s.stats);
  const measures = useAppStore((s) => s.measures);
  const setProgress = useAppStore((s) => s.setProgress);
  const showToast = useAppStore((s) => s.showToast);
  const setScreen = useAppStore((s) => s.setScreen);
  const loopMeasures = useAppStore((s) => s.loopMeasures);
  const setLoopMeasures = useAppStore((s) => s.setLoopMeasures);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [beatOn, setBeatOn] = useState(false);
  const [tuner, setTuner] = useState<TunerReading>(silentTuner("silent"));
  const engineRef = useRef<PracticeEngine | null>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const metro = useRef(createMetronome());

  const advice = useMemo(
    () => (snap ? adviceAt(snap.events, snap.cursor) : null),
    [snap],
  );
  const fingerings = useMemo(() => {
    const map: Record<number, number> = {};
    if (advice) map[advice.midi] = advice.finger;
    const ev = snap?.events[snap.cursor];
    ev?.fingering?.forEach((f, i) => {
      const midi = ev.expectedMidi[i];
      if (midi) map[midi] = f;
    });
    return map;
  }, [advice, snap]);

  const memoryLevel = snap && snap.consecutiveHits >= 6 ? 2 : snap && snap.consecutiveHits >= 3 ? 1 : 0;

  useEffect(() => {
    if (!lesson) return;
    const engine = new PracticeEngine({
      lesson,
      mode,
      hands,
      measures: mode === "loop" ? loopMeasures ?? [snap?.measure ?? 1, snap?.measure ?? 1] : undefined,
      matchWindowCents: profile?.matchWindowCents ?? 45,
      preferMidi: Boolean(profile?.preferMidi && useAppStore.getState().midiName),
      targetRepeats: 4,
    });
    engine.onChange = setSnap;
    engine.onMeasureClean = (measure) => {
      const piece = { ...(useAppStore.getState().measures[lesson.id] ?? {}) };
      const prev = piece[String(measure)] ?? { state: "needs_work" as const, cleanWaits: 0 };
      piece[String(measure)] = nextMastery(prev.cleanWaits + 1);
      const nextMeasures = { ...useAppStore.getState().measures, [lesson.id]: piece };
      const cur = useAppStore.getState().stats;
      useAppStore.getState().setProgress(cur, nextMeasures);
      void getPiano().saveProgress(cur, nextMeasures);
    };
    engineRef.current = engine;
    engine.start();
    const m = metro.current;
    m.setBeats(lesson.timeSignature.num);
    m.setBpm(mode === "slow" ? lesson.tempoBpm * settings.slowFactor : lesson.tempoBpm);
    m.setVolume(mode === "wait" ? 0 : settings.mixer.metronome);
    m.onBeat = () => {
      setBeatOn(true);
      window.setTimeout(() => setBeatOn(false), 80);
    };
    if (mode === "slow" || mode === "play") m.start();
    return () => {
      engine.stop();
      m.stop();
    };
  }, [lesson, mode, hands, loopMeasures, profile, settings.slowFactor, settings.mixer.metronome]);

  useEffect(() => {
    const map: Record<string, number> = { a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72, w: 61, e: 63, t: 66, y: 68, u: 70 };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const midi = map[e.key.toLowerCase()];
      if (midi === undefined) return;
      engineRef.current?.ingest({
        midi,
        centsError: 0,
        rms: 0.2,
        source: "midi",
        t: performance.now(),
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void startListening(
      profile,
      (note) => engineRef.current?.ingest(note),
      (rms) => useAppStore.getState().setMicLevel(rms),
      (name) => {
        if (useAppStore.getState().midiName && !name) showToast(COPY.midiUnplug);
        useAppStore.getState().setMidi(name, Boolean(name && profile?.preferMidi));
      },
      (reading) => setTuner(reading),
    )
      .then((h) => {
        listenRef.current = h;
        stop = h.stop;
        if (!h.micReady) setTuner(silentTuner("denied"));
      })
      .catch(() => {
        setTuner(silentTuner("denied"));
        showToast(COPY.micDenied);
      });
    return () => stop?.();
  }, [profile, showToast]);

  useEffect(() => {
    const s = snap;
    if (!s || !lesson) return;
    const live: LiveState = {
      calibrated: Boolean(profile),
      input: useAppStore.getState().midiName ? "midi" : "mic",
      midiName: useAppStore.getState().midiName,
      pieceId: lesson.id,
      pieceTitle: lesson.title,
      mode,
      measure: s.measure,
      measureCount: s.measureCount,
      expected: s.expected,
      elapsedMs: s.elapsedMs,
      accuracy: s.accuracy,
      lastHit: s.lastHit,
      lastMiss: s.lastMiss,
      mixer: settings.mixer,
      screen: "practice",
    };
    getPiano().pushLive(live);
  }, [snap, lesson, mode, profile, settings.mixer]);

  useEffect(() => {
    if (snap?.state !== "finished" || !lesson) return;
    const date = localDateKey();
    const added = Math.round((snap.elapsedMs ?? 0) / 1000);
    const nextStats = {
      ...stats,
      dailySeconds: { ...stats.dailySeconds, [date]: (stats.dailySeconds[date] ?? 0) + added },
      lastActiveDate: date,
      sessions: [
        {
          id: `${lesson.id}-${Date.now()}`,
          startedAt: new Date().toISOString(),
          durationSec: added,
          pieceId: lesson.id,
          pieceTitle: lesson.title,
          accuracy: snap.accuracy,
          stars: snap.stars,
          source: lesson.source,
        },
        ...stats.sessions,
      ],
    };
    setProgress(nextStats, measures);
    void getPiano().saveProgress(nextStats, measures);
  }, [snap?.state]);

  if (!lesson) {
    return (
      <div className="page">
        <p>Pick a piece from the library.</p>
        <button onClick={() => setScreen("library")}>Library</button>
      </div>
    );
  }

  const ev = snap?.events[snap.cursor];
  const next = snap?.events[snap.cursor + 1];
  const next2 = snap?.events[snap.cursor + 2];
  const total = snap?.events.length || 1;
  const done = Math.min(snap?.cursor ?? 0, total);
  const finished = snap?.state === "finished";
  const pieceMastery = measures[lesson.id] ?? {};
  const acc = Math.round((snap?.accuracy ?? 0) * 100);

  return (
    <div className="practice-shell">
      <div className="page practice-page">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="serif" style={{ fontSize: "1.35rem" }}>{lesson.title}</div>
            <div className="muted">
              Measure {snap?.measure ?? 1} / {snap?.measureCount ?? lesson.measures.length}
              {useAppStore.getState().midiName ? ` · MIDI ${useAppStore.getState().midiName}` : " · mic + click"}
              {snap ? ` · ${acc}% clean` : ""}
              {snap && snap.consecutiveHits >= 3 ? ` · ${snap.consecutiveHits} in a row` : ""}
            </div>
          </div>
          <div className="muted">
            {formatTime(snap?.elapsedMs ?? 0)}
            {beatOn ? " ·" : ""}
          </div>
        </div>
        <div className="measure-dots">
          {lesson.measures.map((m) => {
            const state = pieceMastery[String(m.n)]?.state ?? "needs_work";
            return (
              <button
                key={m.n}
                className={`dot ${state} ${snap?.measure === m.n ? "here" : ""}`}
                title={`Measure ${m.n} · ${state}`}
                onClick={() => {
                  setLoopMeasures([m.n, m.n]);
                  setMode("loop");
                }}
              />
            );
          })}
        </div>
        <div className="coach-row">
          <HandCoach advice={finished ? null : advice} fade={memoryLevel >= 2} />
          <div className="play-hero">
            <div className="play-label">{finished ? "Finished" : advice ? `${advice.hand === "rh" ? "RH" : "LH"} finger ${advice.finger}` : "Play this"}</div>
            <div className="play-note">{finished ? "✓" : snap?.expected.join(" ") || "—"}</div>
            {!finished && (snap?.expected?.length ?? 0) > 0 && memoryLevel < 2 && (
              <StaffBoard pitches={snap?.expected ?? ev?.pitches ?? []} compact />
            )}
            {memoryLevel >= 1 && !finished && (
              <div className="memory-banner">Look at your hand, not the screen. Same fingers.</div>
            )}
            {memoryLevel < 2 && (
              <div className="upcoming">
                {next && <span className="soon">then {next.pitches.join(" ")}</span>}
                {next2 && <span>then {next2.pitches.join(" ")}</span>}
              </div>
            )}
            <div className="progress-track">
              <span style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <div className="muted">{done} / {total} notes</div>
          </div>
          <MicTuner
            tuner={tuner}
            targetPitch={finished ? null : snap?.expected[0]}
            targetMidi={finished ? null : snap?.expectedMidi[0]}
            onEnable={() => {
              void listenRef.current?.resumeMic().then(() => setTuner(silentTuner("listening")));
            }}
          />
        </div>
        {!finished && advice && <p className="coach-line">{advice.coach}</p>}
        {finished && (
          <p className="coach-line">
            {acc >= 80
              ? "This pattern is sticking. Loop the weakest measure next."
              : "Slow it down and loop one measure until the hand finds it without looking."}
          </p>
        )}
        <div className="row" style={{ justifyContent: "center" }}>
          {(["wait", "slow", "loop", "play"] as PracticeMode[]).map((m) => (
            <button
              key={m}
              className={mode === m ? "primary" : ""}
              onClick={() => {
                if (m === "loop") setLoopMeasures([snap?.measure ?? 1, snap?.measure ?? 1]);
                setMode(m);
              }}
            >
              {m === "wait" ? "Wait" : m === "slow" ? "Slow" : m === "loop" ? "Loop bar" : "Play through"}
            </button>
          ))}
          <button onClick={() => setDrawer((d) => !d)}>Mixer</button>
          {finished && (
            <span>
              {settings.quiet ? `${snap?.stars} stars` : `${"★".repeat(snap?.stars ?? 0)}${"☆".repeat(3 - (snap?.stars ?? 0))}`}
            </span>
          )}
        </div>
        {drawer && (
          <div className="card mixer">
            {(["metronome", "preview", "backing", "ui"] as const).map((k) => (
              <label key={k}>
                {k}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.mixer[k]}
                  onChange={(e) => {
                    const mixer = { ...settings.mixer, [k]: Number(e.target.value) };
                    const nextS = { ...settings, mixer };
                    setSettings(nextS);
                    void getPiano().saveSettings(nextS);
                    if (k === "metronome") metro.current.setVolume(mixer.metronome);
                  }}
                />
              </label>
            ))}
            <span>Hands</span>
            <div className="row">
              {(["all", "rh", "lh"] as const).map((h) => (
                <button key={h} className={hands === h ? "primary" : ""} onClick={() => setHands(h)}>
                  {h === "all" ? "both" : h}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <p className="muted" style={{ textAlign: "center", margin: "0.4rem 0 0" }}>
        Gold key = play now with the numbered finger. Mic is live — or click the key / A S D F G.
      </p>
      <PianoKeyboard
        keyCount={profile?.keyCount ?? 88}
        targets={snap?.expectedMidi ?? ev?.expectedMidi ?? []}
        hitMidi={snap?.hitMidi ?? null}
        missMidi={snap?.missMidi ?? null}
        fingerings={fingerings}
        shape={advice?.shape ?? {}}
        showFingering={settings.showFingering !== false}
        memoryLevel={memoryLevel}
        onPlay={(midi) =>
          engineRef.current?.ingest({
            midi,
            centsError: 0,
            rms: 0.2,
            source: "midi",
            t: performance.now(),
          })
        }
      />
    </div>
  );
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
