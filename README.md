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
