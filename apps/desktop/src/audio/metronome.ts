export type MetroHandle = {
  setBpm: (bpm: number) => void;
  setVolume: (v0to100: number) => void;
  setBeats: (n: number) => void;
  start: () => void;
  stop: () => void;
  onBeat?: (beat: number) => void;
};

export function createMetronome(): MetroHandle {
  let ctx: AudioContext | null = null;
  let timer: number | null = null;
  let bpm = 80;
  let volume = 0;
  let beats = 4;
  let beat = 0;
  let tick: (() => void) | null = null;
  const handle: MetroHandle = {
    onBeat: undefined,
    setBpm(next) {
      // Follow the player live: re-time a running click without restarting the bar.
      if (Math.abs(next - bpm) < 1) return;
      bpm = next;
      if (timer && tick) {
        window.clearInterval(timer);
        timer = window.setInterval(tick, (60 / bpm) * 1000);
      }
    },
    setVolume(v) {
      volume = v;
    },
    setBeats(n) {
      beats = n;
    },
    start() {
      handle.stop();
      ctx = new AudioContext();
      const click = () => {
        if (!ctx || volume <= 0) {
          beat = (beat + 1) % beats;
          handle.onBeat?.(beat);
          return;
        }
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const accent = beat === 0;
        osc.frequency.value = accent ? 1200 : 900;
        gain.gain.value = (volume / 100) * (accent ? 0.18 : 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
        handle.onBeat?.(beat);
        beat = (beat + 1) % beats;
      };
      tick = click;
      click();
      timer = window.setInterval(click, (60 / bpm) * 1000);
    },
    stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
      tick = null;
      beat = 0;
      void ctx?.close();
      ctx = null;
    },
  };
  return handle;
}
