import type { PianoAPI } from "../electron/preload";

declare global {
  interface Window {
    piano?: PianoAPI;
  }
}

export {};
