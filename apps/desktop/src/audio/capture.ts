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

// A0 is 27.5 Hz: one cycle is 36 ms, so the deepest keys need the long window.
const LONG = 4096;
const SHORT = 2048;
const MIN_HZ = 26;
const MAX_HZ = 4400;
/** After a note starts, wait this long before a louder re-strike of the same key can count. */
const RESTRIKE_GUARD_MS = 110;
const RESTRIKE_SETTLE_MS = 35;

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
  // Let the device pick its native rate: forcing 48 kHz breaks Firefox and some phones.
  const context = new AudioContext();
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = LONG;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const buffer = new Float32Array(LONG);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const recent = buffer.subarray(LONG - SHORT);
  const shortDetector = PitchDetector.forFloat32Array(SHORT);
  const longDetector = PitchDetector.forFloat32Array(LONG);
  const offset = profile?.centsOffset ?? 0;
  const threshold = profile?.yinThreshold ?? 0.18;
  const minHit = profile?.minHitRms ?? 0.012;
  let noiseFloor = profile?.noiseFloorRms ?? 0.008;
  let noiseSamples = 0;

  let lastMidi: number | null = null;
  let agree = 0;
  let held = false;
  let onsetAt = 0;
  let rearmedAt = 0;
  // Strike detection for chords: a jump in loudness, then a spectrum once the attack settles.
  const levels: { t: number; rms: number }[] = [];
  let lastStrikeAt = 0;
  let spectrumDueAt = 0;
  let trough = Infinity;
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
    // Loudness of the newest 43 ms only, so a fresh strike shows up immediately.
    let sum = 0;
    for (const s of recent) sum += s * s;
    const rms = Math.sqrt(sum / recent.length);

    const now = performance.now();
    levels.push({ t: now, rms });
    while (levels.length && now - levels[0].t > 160) levels.shift();
    const recentLow = Math.min(...levels.map((l) => l.rms));
    if (now - lastStrikeAt > 120 && rms >= minHit && rms > recentLow * 1.8) {
      lastStrikeAt = now;
      spectrumDueAt = now + 90; // past the hammer thump, while the strings ring clearly
    }
    if (spectrumDueAt && now >= spectrumDueAt) {
      spectrumDueAt = 0;
      analyser.getFloatFrequencyData(spectrum);
      onNote({
        midi: lastMidi === null ? 0 : Math.round(lastMidi),
        centsError: 0,
        rms,
        source: "mic",
        t: now,
        kind: "strike",
        spectrum: { db: spectrum.slice(), binHz: context.sampleRate / LONG },
      });
    }

    // Same key struck again while it still rings: the level dips, then jumps.
    // Re-arm so repeated notes (E-E in Ode to Joy) each count.
    if (held && performance.now() - onsetAt > RESTRIKE_GUARD_MS) {
      trough = Math.min(trough, rms);
      if (rms > trough * 1.6 && rms - trough > minHit * 0.5) {
        held = false;
        agree = 0;
        lastMidi = null;
        rearmedAt = performance.now();
      }
    }

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

    let [hz, clarity] = shortDetector.findPitch(recent, context.sampleRate);
    if (!hz || clarity < 1 - threshold) {
      // Nothing clear in the short window: maybe a bass note with too few cycles. Try the long one.
      const [lhz, lclarity] = longDetector.findPitch(buffer, context.sampleRate);
      if (lhz && lhz < 140 && lclarity >= clarity) [hz, clarity] = [lhz, lclarity];
    }
    if (!hz || hz < MIN_HZ || hz > MAX_HZ || clarity < 1 - threshold) {
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
    // Right after a new strike the 43 ms window still holds mostly the previous key.
    // Wait for it to fill with the new sound before naming the note.
    if (performance.now() - rearmedAt < RESTRIKE_SETTLE_MS) agree = Math.min(agree, 1);
    if (agree >= need && !held && rms >= minHit) {
      held = true;
      onsetAt = performance.now();
      trough = Infinity;
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
