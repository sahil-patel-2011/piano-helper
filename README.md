# Piano Helper

Open-source Windows studio for adult pianists. It listens (mic or MIDI), waits for the correct note, shows which finger to use, and imports your own sheet music. Practice data stays on your machine.

**License:** [MIT](./LICENSE)

## Apps

| Path | What it is |
|------|------------|
| `apps/desktop` | Electron + Vite studio (the product) |
| `apps/web` | Optional marketing / dashboard site |
| `packages/shared` | Lesson schema, pitch math, fingering, matcher |
| `packages/bridge` | `piano-helper` CLI + MCP tools |
| `packages/starters` | Public-domain starter lessons |

## Studio: practise on your phone or any browser

Run one command on your computer. Every phone, tablet or laptop on the same Wi-Fi can then use the app in its browser, with its own microphone.

```bash
npm install
npm run studio
```

On Windows you can instead double-click **`Piano Helper.cmd`**: it installs and builds on first run, starts the app and opens your browser. Double-clicking again while it's running just opens the browser. Tests: `npm test` uses stand-in CLIs, so no sign-in is needed. `npm run test:live` runs the real app on your signed-in Claude Code or Codex against two sample scores (one hand, and two hands with chords). It checks every note and finger, that the AI's answer was saved, and that a repeat photo makes no AI call. It uses two reads from your plan and a throwaway data folder.

The terminal prints a QR code. Scan it with your phone. On the first visit the phone warns about the certificate (it is self-made so the phone allows the mic): tap **Advanced → Proceed / Visit website**. Tip: add it to your home screen.

- **One-minute mic check, once per device.** It measures room noise, then asks for middle C, a few keys around it, then the lowest and highest keys (a map shows where they are). It learns how loud your piano is, how in tune it is, and whether this mic hears the extreme keys an octave off, then corrects all of that while you play.
- **The AI reads each photo once; everything after that is plain code.** Its answer is kept word for word next to the photo (`imports/<id>/ai-output.txt`, plus the parsed `lesson.json`). Practising, Learn mode, reopening a piece and restarting the app all load that saved copy. Uploading the same photo again reuses it instantly with no AI call.
- **Photo → lesson.** Tap *Snap*. The computer runs Codex (`codex exec`) or Claude Code (`claude -p`) to read the page: notes, rhythm, which hand, fingering for someone who memorises by position, where to start, and a short memory tip per bar. On *Automatic*, if one of them is signed out it uses the other. API keys are stripped so it always bills your ChatGPT or Claude plan.
- **Learn mode, no note reading.** A hand is drawn over the keys with each fingertip on its key, colour-coded by finger, and the finger to press glows. For each bar: *Watch & play* (it plays the bar, then you play it twice with the hand showing) → *From memory* (nothing on screen; a wrong key reveals the right one) → *Join it up* (play it onto the bars before). Then the whole piece. The mic follows along, including repeated notes and chords.
- **Real music, both hands.** Notes the hands play together are one step, and every key shows its finger (both hands drawn; the idle hand rests where it plays next). Chords are checked from the mic's spectrum, so a wrong chord doesn't pass. *Play along* follows your tempo: it never runs ahead, it tracks your pace (shown live), and the metronome and *Hear it* follow you.
- **Library and progress** live on the computer and are shared by every device (and by the desktop app).
- From Claude Code in this folder, type `/piano` to start it. The `piano-helper` MCP tools (`push_lesson`, `open_piece`, `get_session`…) drive whichever device you're practising on. Codex reads `AGENTS.md` for the same workflow.

Options: `npm run studio:dev -- --port 6080`, `--engine claude|codex`, `--no-https` (computer only). Pairing key: `%APPDATA%\Piano Helper\studio\pair-key.txt` (delete it to un-pair every device).

## Develop

```bash
npm install
npm test
npm run dev
```

Desktop UI: http://localhost:5173  
Electron opens with Vite. If you only want the renderer: `PIANO_SKIP_ELECTRON=1 npm run dev`

```bash
npm run dev:web
```

Website: http://localhost:3000

## Practice

- Gold key = play now. Click it, or press A S D F G.
- Mic tuner shows the heard pitch and cents sharp/flat.
- Hand coach assigns fingers (thumb-under, stretch, shift) and fades cues after clean hits so the pattern sticks.
- Loop a measure from the dots under the title.

## Claude Desktop / Claude Code

Uses a Max (or Pro) login. No API key required.

1. Sign in to Claude Desktop or run `claude` once.
2. Open Piano Helper → Settings → **Connect Claude Desktop**.
3. Keep Piano Helper open. Drop a score on Import, or ask Claude to `push_lesson`.

## Website (optional)

`apps/web` can be deployed anywhere. It does **not** run OMR or store API keys. Copy `apps/web/.env.example` if you want the optional Supabase dashboard.

## Privacy

Keys, lessons, and progress live in `%APPDATA%\Piano Helper\` on your PC. This repository contains no credentials.
