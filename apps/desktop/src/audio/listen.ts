import type { DeviceProfile, HeardNote } from "@piano-helper/shared";
import { startMic, silentTuner, type MicHandle, type TunerReading } from "./capture";
import { startMidi, type MidiHandle } from "../midi/midi";

export type ListenHandle = {
  stop: () => void;
  resumeMic: () => Promise<void>;
  micReady: boolean;
};

export async function startListening(
  profile: DeviceProfile | null,
  onNote: (n: HeardNote) => void,
  onLevel: (rms: number) => void,
  onMidi: (name: string | null) => void,
  onTuner?: (reading: TunerReading) => void,
): Promise<ListenHandle> {
  let mic: MicHandle | null = null;
  let midi: MidiHandle | null = null;
  let micReady = false;
  try {
    mic = await startMic(profile, onNote, onLevel, onTuner);
    micReady = true;
    await mic.resume();
  } catch {
    onTuner?.(silentTuner("denied"));
  }
  midi = await startMidi(profile?.lastMidiId ?? null, onNote, (name) => onMidi(name));
  return {
    micReady,
    async resumeMic() {
      if (mic) {
        await mic.resume();
        return;
      }
      mic = await startMic(profile, onNote, onLevel, onTuner);
      micReady = true;
      await mic.resume();
    },
    stop() {
      mic?.stop();
      midi?.stop();
    },
  };
}
