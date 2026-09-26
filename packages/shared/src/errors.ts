export const COPY = {
  micDenied:
    "The mic is blocked. On a phone or browser, allow microphone for this site. On Windows, allow Piano Helper in Privacy > Microphone.",
  noPitch:
    "Play a bit louder, or recalibrate. Digital piano? Plug USB and pick MIDI.",
  claudeMissing: "Install Claude Code and sign in with your Max plan (run: claude). No API key needed.",
  badJson: "Could not read that page. Edit notes or try a flatter photo.",
  bridgeOff: "Open Piano Helper → Settings → Connect Claude Code.",
  midiUnplug: "MIDI disconnected. Switching to the microphone.",
  syncFail: "Could not sync. Practice is still saved on this computer.",
  noProvider: "Connect Claude Code in Settings (Max subscription). Built-in pieces work without it.",
} as const;
