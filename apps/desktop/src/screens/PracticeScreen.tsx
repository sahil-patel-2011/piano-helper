import { useEffect, useMemo, useRef, useState } from "react";
import {
  COPY,
  adviceAt,
  localDateKey,
  nextMastery,
  octaveShiftNear,
  type FlatEvent,
  type PracticeMode,
} from "@piano-helper/shared";
import { PianoKeyboard, type HandOverlay } from "../components/keyboard/PianoKeyboard";
import { StaffBoard } from "../components/staff/StaffBoard";
import { HandCoach } from "../components/coach/HandCoach";
import { MicTuner } from "../components/tuner/MicTuner";
import { silentTuner, type TunerReading } from "../audio/capture";
import { createMetronome } from "../audio/metronome";
import { playPreview, type PreviewHandle } from "../audio/preview";
import { startListening, type ListenHandle } from "../audio/listen";
import { PracticeEngine, type EngineSnapshot } from "../engine/practice-engine";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";
import type { LiveState } from "../../electron/app-state";

/**
 * Learn mode walks one bar at a time:
 *   guided — hear it, then play it twice with the hand and gold key showing
 *   memory — play it twice with nothing showing (tap "Show me" or miss to peek)
 *   chain  — play it joined onto the bars before it, with faint cues
 * then the next bar, and finally the whole piece from memory.
 */
type LearnStage = "guided" | "memory" | "chain" | "whole";
type Learn = { bar: number; stage: LearnStage };

const STAGE_COPY: Record<LearnStage, { title: string; help: string }> = {
  guided: { title: "Watch & play", help: "Listen, then play it with the hand showing. Twice clean to move on." },
  memory: { title: "From memory", help: "Same bar, nothing on screen. Miss a key and it will show you." },
  chain: { title: "Join it up", help: "Play from the earlier bars straight into this one." },
  whole: { title: "Whole piece", help: "Start to finish, cues faded. You know this now." },
};

const MODES: { id: PracticeMode; label: string }[] = [
  { id: "learn", label: "Learn" },
  { id: "wait", label: "Practice" },
  { id: "loop", label: "Loop bar" },
  { id: "play", label: "Play along" },
];

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
  const [tuner, setTuner] = useState<TunerReading>(silentTuner("silent"));
  const engineRef = useRef<PracticeEngine | null>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const metro = useRef(createMetronome());
  const previewRef = useRef<PreviewHandle | null>(null);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [learn, setLearn] = useState<Learn | null>(null);
  const [peekAt, setPeekAt] = useState(-1);
  const [learnDone, setLearnDone] = useState(false);
  const autoPreview = useRef(false);
  const simple = settings.simpleView !== false;

  const bars = useMemo(() => lesson?.measures.map((m) => m.n) ?? [], [lesson]);

  // Learn mode resumes at the first bar that isn't solid yet.
  useEffect(() => {
    if (mode !== "learn" || !lesson) {
      autoPreview.current = false;
      setLearn(null);
      return;
    }
    const mastery = useAppStore.getState().measures[lesson.id] ?? {};
    const start = bars.find((n) => mastery[String(n)]?.state !== "mastered") ?? bars[0];
    setLearn({ bar: start, stage: "guided" });
    setLearnDone(false);
    autoPreview.current = true;
  }, [mode, lesson, bars]);

  // What the engine runs: learn stages become short loops over the right bars.
  const spec = useMemo(() => {
    if (mode === "learn") {
      if (!learn) return null;
      const first = bars[0];
      if (learn.stage === "whole") return { mode: "wait" as PracticeMode, measures: undefined, repeats: 1 };
      if (learn.stage === "chain") {
        const from = bars[Math.max(0, bars.indexOf(learn.bar) - 3)] ?? first;
        return { mode: "loop" as PracticeMode, measures: [from, learn.bar] as [number, number], repeats: 1 };
      }
      return { mode: "loop" as PracticeMode, measures: [learn.bar, learn.bar] as [number, number], repeats: 2 };
    }
    return {
      mode,
      measures: mode === "loop" ? (loopMeasures ?? [bars[0] ?? 1, bars[0] ?? 1]) : undefined,
      repeats: 4,
    };
  }, [mode, learn, bars, loopMeasures]);

  const shiftFor = useMemo(() => {
    const cal = profile?.calibration ?? [];
    return cal.length ? (midi: number) => octaveShiftNear(cal, midi) : undefined;
  }, [profile]);

  useEffect(() => {
    if (!lesson || !spec) return;
    const engine = new PracticeEngine({
      lesson,
      mode: spec.mode,
      hands,
      measures: spec.measures,
      matchWindowCents: profile?.matchWindowCents ?? 50,
      preferMidi: Boolean(profile?.preferMidi && useAppStore.getState().midiName),
      targetRepeats: spec.repeats,
      shiftFor,
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
    setPeekAt(-1);
    engine.start();
    const m = metro.current;
    m.setBeats(lesson.timeSignature.num);
    m.setBpm(spec.mode === "slow" ? lesson.tempoBpm * settings.slowFactor : lesson.tempoBpm);
    m.setVolume(settings.mixer.metronome);
    if (spec.mode === "play") m.start();
    return () => {
      engine.stop();
      m.stop();
    };
  }, [lesson, spec, hands, profile, shiftFor, settings.slowFactor, settings.mixer.metronome]);

  // Computer keyboard fallback: A S D F G H J K = C D E F G A B C.
  useEffect(() => {
    const map: Record<string, number> = { a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72, w: 61, e: 63, t: 66, y: 68, u: 70 };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      const midi = map[e.key.toLowerCase()];
      if (midi === undefined) return;
      engineRef.current?.ingest({ midi, centsError: 0, rms: 0.2, source: "midi", t: performance.now() });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    void startListening(
      profile,
      (note) => {
        // While "Hear it" plays through the speaker, the mic would score the demo as the player.
        if (note.source === "mic" && previewRef.current) return;
        engineRef.current?.ingest(note);
      },
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
      mode: spec?.mode ?? mode,
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
  }, [snap, lesson, mode, spec, profile, settings.mixer]);

  // In "from memory", a wrong key reveals the right one until it is played.
  useEffect(() => {
    if (snap?.missMidi != null) setPeekAt(snap.cursor);
  }, [snap?.missMidi, snap?.cursor]);

  function logSession(s: EngineSnapshot) {
    if (!lesson) return;
    const date = localDateKey();
    const added = Math.round((s.elapsedMs ?? 0) / 1000);
    const cur = useAppStore.getState().stats;
    const nextStats = {
      ...cur,
      dailySeconds: { ...cur.dailySeconds, [date]: (cur.dailySeconds[date] ?? 0) + added },
      lastActiveDate: date,
      sessions: [
        {
          id: `${lesson.id}-${Date.now()}`,
          startedAt: new Date().toISOString(),
          durationSec: added,
          pieceId: lesson.id,
          pieceTitle: lesson.title,
          accuracy: s.accuracy,
          stars: s.stars,
          source: lesson.source,
        },
        ...cur.sessions,
      ],
    };
    setProgress(nextStats, useAppStore.getState().measures);
    void getPiano().saveProgress(nextStats, useAppStore.getState().measures);
  }

  // Finishing a chunk: log it, and in Learn mode step to the next stage.
  useEffect(() => {
    if (snap?.state !== "finished" || !lesson) return;
    if (mode !== "learn" || !learn) {
      logSession(snap);
      return;
    }
    const i = bars.indexOf(learn.bar);
    const isLast = i === bars.length - 1;
    const next: Learn | null =
      learn.stage === "guided"
        ? { bar: learn.bar, stage: "memory" }
        : learn.stage === "memory"
          ? i > 0
            ? { bar: learn.bar, stage: "chain" }
            : isLast
              ? { bar: learn.bar, stage: "whole" }
              : { bar: bars[i + 1], stage: "guided" }
          : learn.stage === "chain"
            ? isLast
              ? bars.length > 1
                ? { bar: learn.bar, stage: "whole" }
                : null
              : { bar: bars[i + 1], stage: "guided" }
            : null;
    if (!next) {
      logSession(snap);
      setLearnDone(true);
      return;
    }
    if (next.stage === "guided") autoPreview.current = true;
    showToast(next.stage === "memory" ? "Nice. Now the same bar from memory." : next.stage === "chain" ? "Got it. Now join it to the bars before." : next.stage === "whole" ? "Every bar learned. Whole piece now." : `Bar ${next.bar} next.`);
    const t = window.setTimeout(() => setLearn(next), 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.state]);

  // New bar in Learn mode: play it once before asking for it.
  useEffect(() => {
    if (!autoPreview.current || !snap || !learn || learn.stage !== "guided") return;
    if (snap.events[0]?.measure !== learn.bar || snap.cursor !== 0) return;
    autoPreview.current = false;
    const t = window.setTimeout(() => hearIt(snap.events, 0), 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, learn]);

  useEffect(() => () => previewRef.current?.stop(), []);

  function hearIt(events?: FlatEvent[], offset?: number) {
    if (previewRef.current) {
      previewRef.current.stop();
      return;
    }
    if (!snap || !lesson) return;
    const here = snap.events[snap.cursor];
    const start = offset ?? snap.cursor;
    // Default: the rest of this bar, and at least a short phrase so there is something to remember.
    const phrase =
      events ??
      (here ? snap.events.slice(snap.cursor).filter((e, i) => e.measure === here.measure || i < 6).slice(0, 12) : []);
    if (!phrase.length) return;
    const handle = playPreview(phrase, lesson.tempoBpm * 0.8, Math.max(35, settings.mixer.preview), (i) =>
      setPreviewIdx(i === null ? null : start + i),
    );
    previewRef.current = handle;
    void handle.done.then(() => {
      if (previewRef.current === handle) previewRef.current = null;
      setPreviewIdx(null);
    });
  }

  const advice = useMemo(() => (snap ? adviceAt(snap.events, snap.cursor) : null), [snap]);
  const previewAdvice = useMemo(
    () => (snap && previewIdx !== null ? adviceAt(snap.events, previewIdx) : null),
    [snap, previewIdx],
  );
  const nextAdvice = useMemo(
    () => (snap && snap.cursor + 1 < snap.events.length ? adviceAt(snap.events, snap.cursor + 1) : null),
    [snap],
  );
  const next2Advice = useMemo(
    () => (snap && snap.cursor + 2 < snap.events.length ? adviceAt(snap.events, snap.cursor + 2) : null),
    [snap],
  );

  if (!lesson) {
    return (
      <div className="page">
        <p>Pick a piece from the library, or snap a photo of your music.</p>
        <div className="row">
          <button className="primary" onClick={() => setScreen("import")}>
            Snap music
          </button>
          <button onClick={() => setScreen("library")}>Library</button>
        </div>
      </div>
    );
  }

  const ev = snap?.events[snap.cursor];
  const next = snap?.events[snap.cursor + 1];
  const next2 = snap?.events[snap.cursor + 2];
  const total = snap?.events.length || 1;
  const done = Math.min(snap?.cursor ?? 0, total);
  const finished = snap?.state === "finished" && (mode !== "learn" || learnDone);
  const pieceMastery = measures[lesson.id] ?? {};
  const acc = Math.round((snap?.accuracy ?? 0) * 100);
  const previewEvent = previewIdx !== null ? snap?.events[previewIdx] : undefined;

  // How much help is on screen.
  const hidden = learn?.stage === "memory" && peekAt !== snap?.cursor && !previewEvent;
  const streakFade = mode === "learn" ? 0 : snap && snap.consecutiveHits >= 6 ? 2 : snap && snap.consecutiveHits >= 3 ? 1 : 0;
  const memoryLevel = learn?.stage === "chain" || learn?.stage === "whole" ? 1 : streakFade;
  const shown = previewAdvice ?? advice;
  const hand: HandOverlay | null =
    settings.showFingering && shown && !hidden && !finished
      ? { side: shown.hand, shape: shown.shape, active: shown.finger, faded: memoryLevel >= 1 && !previewEvent }
      : null;
  const targets = hidden || finished ? [] : previewEvent ? previewEvent.expectedMidi : (snap?.expectedMidi ?? ev?.expectedMidi ?? []);
  const barTip = lesson.measures.find((m) => m.n === (previewEvent?.measure ?? snap?.measure))?.tip;
  const handName = (h?: string) => (h === "lh" ? "Left hand" : "Right hand");
  const fingerWord = (a: typeof advice) => (a ? `${a.hand === "lh" ? "L" : "R"}${a.finger}` : "");

  return (
    <div className="practice-shell">
      <div className="page practice-page">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="serif" style={{ fontSize: "1.35rem" }}>{lesson.title}</div>
            <div className="muted">
              Bar {snap?.measure ?? 1} of {lesson.measures.length}
              {useAppStore.getState().midiName ? ` · MIDI ${useAppStore.getState().midiName}` : " · listening"}
              {snap && mode !== "learn" ? ` · ${acc}% clean` : ""}
              {snap && snap.consecutiveHits >= 3 ? ` · ${snap.consecutiveHits} in a row` : ""}
            </div>
          </div>
          <div className="muted">{formatTime(snap?.elapsedMs ?? 0)}</div>
        </div>

        <div className="measure-dots">
          {lesson.measures.map((m) => {
            const state = pieceMastery[String(m.n)]?.state ?? "needs_work";
            return (
              <button
                key={m.n}
                className={`dot ${state} ${snap?.measure === m.n ? "here" : ""}`}
                title={`Bar ${m.n} · ${state.replace("_", " ")}`}
                onClick={() => {
                  if (mode === "learn") {
                    autoPreview.current = true;
                    setLearnDone(false);
                    setLearn({ bar: m.n, stage: "guided" });
                    return;
                  }
                  setLoopMeasures([m.n, m.n]);
                  setMode("loop");
                }}
              />
            );
          })}
        </div>

        {learn && !learnDone && (
          <div className="learn-bar">
            <div className="learn-steps">
              {(["guided", "memory", "chain"] as const)
                .filter((s) => s !== "chain" || bars.indexOf(learn.bar) > 0)
                .map((s, i) => (
                  <span key={s} className={learn.stage === s ? "on" : learnOrder(learn.stage) > learnOrder(s) ? "done" : ""}>
                    {i + 1}. {STAGE_COPY[s].title}
                  </span>
                ))}
              {learn.stage === "whole" && <span className="on">{STAGE_COPY.whole.title}</span>}
            </div>
            <div className="muted">
              {learn.stage === "whole" ? "All bars" : `Bar ${learn.bar} of ${bars.length}`} · {STAGE_COPY[learn.stage].help}
              {learn.stage !== "chain" && learn.stage !== "whole" && snap ? ` · clean runs ${snap.cleanRepeats}/2` : ""}
            </div>
          </div>
        )}

        {lesson.summary && (snap?.cursor ?? 0) === 0 && (snap?.measure ?? 1) === bars[0] && !finished && (
          <p className="summary-line">{lesson.summary}</p>
        )}

        <div className="coach-row">
          <HandCoach advice={finished || hidden ? null : shown} fade={memoryLevel >= 2} />
          <div className="play-hero">
            {finished ? (
              <>
                <div className="play-label">{mode === "learn" ? "Learned" : "Finished"}</div>
                <div className="play-note finger-note">✓</div>
              </>
            ) : hidden ? (
              <>
                <div className="play-label">From memory</div>
                <div className="play-note finger-note">?</div>
                <div className="muted">Play the next key — or tap Show me</div>
              </>
            ) : simple ? (
              <>
                <div className="play-label">{previewEvent ? "Listen" : shown ? handName(shown.hand) : "Play the gold key"}</div>
                <div className={`play-note finger-note ${shown ? `fc${shown.finger}` : ""}`}>{shown ? shown.finger : "●"}</div>
                <div className="muted">{shown ? `${shown.name} finger · gold key` : "gold key"}</div>
              </>
            ) : (
              <>
                <div className="play-label">{advice ? `${advice.hand === "rh" ? "RH" : "LH"} finger ${advice.finger}` : "Play this"}</div>
                <div className="play-note">{snap?.expected.join(" ") || "—"}</div>
                {(snap?.expected?.length ?? 0) > 0 && memoryLevel < 2 && (
                  <StaffBoard pitches={snap?.expected ?? ev?.pitches ?? []} compact />
                )}
              </>
            )}
            {!finished && !hidden && memoryLevel < 2 && (
              <div className="upcoming">
                {next && <span className="soon">then {simple ? fingerWord(nextAdvice) || "·" : next.pitches.join(" ")}</span>}
                {next2 && <span>then {simple ? fingerWord(next2Advice) || "·" : next2.pitches.join(" ")}</span>}
              </div>
            )}
            <div className="progress-track">
              <span style={{ width: `${(done / total) * 100}%` }} />
            </div>
          </div>
          <MicTuner
            tuner={tuner}
            targetPitch={finished || hidden || simple ? null : snap?.expected[0]}
            targetMidi={finished || hidden ? null : snap?.expectedMidi[0]}
            onEnable={() => {
              void listenRef.current?.resumeMic().then(() => setTuner(silentTuner("listening")));
            }}
          />
        </div>

        {!finished && barTip && <p className="coach-line tip-line">{barTip}</p>}
        {!finished && !barTip && shown && !hidden && <p className="coach-line">{shown.coach}</p>}
        {finished && (
          <div className="finish-card">
            <p className="coach-line">
              {mode === "learn"
                ? "Every bar learned and joined up. Play it from memory tomorrow — that's when it sticks."
                : acc >= 80
                  ? "This is sticking. Try Learn mode's “From memory” on the weakest bar."
                  : "Slow down and loop one bar until your hand finds it without looking."}
            </p>
            <div className="row" style={{ justifyContent: "center" }}>
              <button
                className="primary"
                onClick={() => {
                  setLearnDone(false);
                  if (mode === "learn") setLearn({ bar: bars[0], stage: "whole" });
                  else engineRef.current?.start();
                }}
              >
                {mode === "learn" ? "Play it from memory" : "Again"}
              </button>
            </div>
          </div>
        )}

        <div className="row mode-row" style={{ justifyContent: "center" }}>
          {MODES.map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? "primary" : ""}
              onClick={() => {
                if (m.id === "loop") setLoopMeasures([snap?.measure ?? bars[0], snap?.measure ?? bars[0]]);
                setMode(m.id);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className={previewIdx !== null ? "primary" : ""} disabled={finished} onClick={() => hearIt()}>
            {previewIdx !== null ? "Stop" : "Hear it"}
          </button>
          {hidden && <button onClick={() => setPeekAt(snap?.cursor ?? -1)}>Show me</button>}
          <button onClick={() => setDrawer((d) => !d)}>More</button>
        </div>

        {drawer && (
          <div className="card mixer">
            <span>Hands</span>
            <div className="row">
              {(["all", "rh", "lh"] as const).map((h) => (
                <button key={h} className={hands === h ? "primary" : ""} onClick={() => setHands(h)}>
                  {h === "all" ? "Both" : h === "rh" ? "Right only" : "Left only"}
                </button>
              ))}
            </div>
            <span>View</span>
            <div className="row">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  className={simple === v ? "primary" : ""}
                  onClick={() => {
                    const nextS = { ...settings, simpleView: v };
                    setSettings(nextS);
                    void getPiano().saveSettings(nextS);
                  }}
                >
                  {v ? "Keys + fingers" : "Note names + staff"}
                </button>
              ))}
            </div>
            {(["preview", "metronome"] as const).map((k) => (
              <label key={k} style={{ display: "contents" }}>
                <span>{k === "preview" ? "Hear-it volume" : "Metronome"}</span>
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
          </div>
        )}
      </div>

      <p className="muted keyboard-hint">
        {previewEvent
          ? "Watch the hand — then play it back."
          : hidden
            ? "Your turn, from memory."
            : "Gold key = play now, with the glowing finger. Outlined key = next."}
      </p>
      <PianoKeyboard
        keyCount={profile?.keyCount ?? 88}
        targets={targets}
        upcoming={previewEvent || finished || hidden || memoryLevel >= 1 ? [] : (next?.expectedMidi ?? [])}
        showNames={!simple}
        hand={hand}
        hitMidi={snap?.hitMidi ?? null}
        missMidi={snap?.missMidi ?? null}
        fingerings={advice ? { [advice.midi]: advice.finger } : {}}
        shape={advice?.shape ?? {}}
        showFingering={settings.showFingering !== false && !hidden}
        memoryLevel={memoryLevel}
        onPlay={(midi) => engineRef.current?.ingest({ midi, centsError: 0, rms: 0.2, source: "midi", t: performance.now() })}
      />
    </div>
  );
}

function learnOrder(s: LearnStage) {
  return ["guided", "memory", "chain", "whole"].indexOf(s);
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
