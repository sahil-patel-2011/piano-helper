import type { TunerReading } from "../../audio/capture";
import { isDesktopApp } from "../../lib/piano-api";

type Props = {
  tuner: TunerReading;
  targetPitch?: string | null;
  targetMidi?: number | null;
  onEnable?: () => void;
};

export function MicTuner({ tuner, targetPitch, targetMidi, onEnable }: Props) {
  if (tuner.status === "denied") {
    return (
      <div className="tuner card">
        <div className="muted">Microphone</div>
        <p>{isDesktopApp() ? "Windows is blocking the mic." : "The browser is blocking the mic. Allow microphone for this site, then tap below."}</p>
        <button className="primary" onClick={() => void onEnable?.()}>
          Enable microphone
        </button>
      </div>
    );
  }
  if (tuner.status === "suspended") {
    return (
      <div className="tuner card">
        <div className="muted">Microphone paused</div>
        <button className="primary" onClick={() => void onEnable?.()}>
          Start listening
        </button>
      </div>
    );
  }

  const cents = tuner.cents ?? 0;
  const needle = Math.max(-45, Math.min(45, cents));
  const inTune = tuner.status === "pitch" && Math.abs(cents) <= 12;
  const vsTarget =
    tuner.midi != null && targetMidi != null ? (tuner.midi - targetMidi) * 100 + (tuner.cents ?? 0) : null;
  const level = Math.min(100, tuner.rms * 900);

  return (
    <div className={`tuner card ${inTune ? "in-tune" : ""}`}>
      <div className="muted">Mic tuner</div>
      <div className={`tuner-note ${tuner.status === "pitch" ? "live" : ""}`}>
        {tuner.pitch ?? (tuner.status === "silent" ? "quiet" : "listening")}
      </div>
      <div className="tuner-dial">
        <span className="tuner-mark flat">♭</span>
        <span className="tuner-track">
          <i style={{ transform: `translateX(${needle}%)` }} />
        </span>
        <span className="tuner-mark sharp">♯</span>
      </div>
      <div className="muted">
        {tuner.status === "pitch"
          ? inTune
            ? "In tune"
            : cents > 0
              ? `${Math.round(cents)} cents sharp`
              : `${Math.round(Math.abs(cents))} cents flat`
          : "Play a note — the needle should jump"}
      </div>
      {targetPitch && (
        <div className="muted">
          Waiting for {targetPitch}
          {vsTarget != null && tuner.status === "pitch"
            ? Math.abs(vsTarget) <= 20
              ? " · that's it"
              : vsTarget > 0
                ? " · too high"
                : " · too low"
            : ""}
        </div>
      )}
      <div className="level">
        <span style={{ width: `${level}%` }} />
      </div>
    </div>
  );
}
