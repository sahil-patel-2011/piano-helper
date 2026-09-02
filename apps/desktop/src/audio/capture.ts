import { PitchDetector } from "pitchy";
import { centsErrorHz, hzToMidi, midiToPitch, type DeviceProfile, type HeardNote } from "@piano-helper/shared";

export type TunerReading = {
  rms: number;
  hz: number | null;
  midi: number | null;
  pitch: string | null;
  cents: number | null;
  clarity: number;
  status: "silent" | "listening" | "pitch" | "denied" | "suspended";
};

export const silentTuner = (status: TunerReading["status"] = "silent"): TunerReading => ({
  rms: 0,
  hz: null,
  midi: null,
  pitch: null,
  cents: null,
  clarity: 0,
  status,
});

export type MicHandle = {
  stop: () => void;
  context: AudioContext;
  resume: () => Promise<void>;
};

export async function startMic(
  profile: DeviceProfile | null,
  onNote: (note: HeardNote) => void,
  onLevel: (rms: number) => void,
  onTuner?: (reading: TunerReading) => void,
): Promise<MicHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  const context = new AudioContext({ sampleRate: 48000 });
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  const detector = PitchDetector.forFloat32Array(analyser.fftSize);
  const offset = profile?.centsOffset ?? 0;
  const threshold = profile?.yinThreshold ?? 0.18;
  const minHit = profile?.minHitRms ?? 0.012;
  let noiseFloor = profile?.noiseFloorRms ?? 0.008;
  let noiseSamples = 0;

  let lastMidi: number | null = null;
  let agree = 0;
  let held = false;
  let timer = 0;
  let alive = true;

  const publish = (reading: TunerReading) => {
    onLevel(reading.rms);
    onTuner?.(reading);
  };

  const tick = () => {
    if (!alive) return;
    if (context.state === "suspended") {
      publish(silentTuner("suspended"));
      timer = window.setTimeout(tick, 80);
      return;
    }
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (const s of buffer) sum += s * s;
    const rms = Math.sqrt(sum / buffer.length);

    if (noiseSamples < 40 && rms < 0.02) {
      noiseFloor = (noiseFloor * noiseSamples + rms) / (noiseSamples + 1);
      noiseSamples += 1;
    }

    if (rms < Math.max(noiseFloor + 0.004, minHit * 0.45)) {
      held = false;
      agree = 0;
      lastMidi = null;
      publish({ rms, hz: null, midi: null, pitch: null, cents: null, clarity: 0, status: "silent" });
      timer = window.setTimeout(tick, 16);
      return;
    }

    const [hz, clarity] = detector.findPitch(buffer, context.sampleRate);
    if (!hz || hz < 55 || hz > 2000 || clarity < 1 - threshold) {
      publish({ rms, hz: null, midi: null, pitch: null, cents: null, clarity, status: "listening" });
      timer = window.setTimeout(tick, 16);
      return;
    }

    const midiFloat = hzToMidi(hz) + offset / 100;
    const midi = Math.round(midiFloat);
    const cents = (midiFloat - midi) * 100;
    publish({
      rms,
      hz,
      midi,
      pitch: midiToPitch(midi),
      cents,
      clarity,
      status: "pitch",
    });

    const stable = lastMidi !== null && Math.abs(midiFloat - lastMidi) * 100 <= 28;
    if (stable) agree += 1;
    else {
      agree = 1;
      lastMidi = midiFloat;
      held = false;
    }
    const need = clarity > 0.92 ? 2 : 3;
    if (agree >= need && !held && rms >= minHit) {
      held = true;
      onNote({
        midi,
        centsError: centsErrorHz(hz, midi, offset),
        rms,
        source: "mic",
        t: performance.now(),
      });
    }
    timer = window.setTimeout(tick, 16);
  };
  tick();

  return {
    context,
    async resume() {
      if (context.state === "suspended") await context.resume();
    },
    stop() {
      alive = false;
      window.clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      void context.close();
    },
  };
}
