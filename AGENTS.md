# Piano Helper — notes for coding agents (Codex, Claude Code)

## Start the studio (phone + any browser)

```
npm install          # once
npm run studio       # builds the web app, then serves it
```

It prints a localhost URL, a phone URL with `?key=…`, and a QR code. Phones need the HTTPS URL for the microphone; the first visit shows a self-signed certificate warning (Advanced → Proceed).

Score photos uploaded from any device are read on this computer by `claude -p` or `codex exec` (whichever is installed; choose in Settings → Score reader). API-key env vars are stripped so the signed-in subscription is used.

## AI boundary

The only AI call in the app is `readScore` (`packages/bridge/src/studio/engines.ts`), run once per new photo. Its raw answer, the parsed lesson and a `reading.json` are kept in `%APPDATA%\Piano Helper\imports\<id>\`. `studio/photos.json` maps each photo's SHA-256 to its lesson, so a repeat upload never calls the AI. Everything else (practice, Learn mode, tempo following, fingering display, mic scoring) is deterministic code. Keep it that way.

Tests: `npm test` (stand-in CLIs) and `npm run test:live` (real subscription, two reads).

## When the user gives you a sheet-music photo directly

Read it yourself and produce lesson JSON (schema: `packages/shared/src/omr-prompt.ts`, every event needs `hand` and `fingering`). Then either:
- call the `piano-helper` MCP tool `push_lesson` (registered in `.mcp.json` for Claude Code; for Codex add the same server to `~/.codex/config.toml`), or
- `PUT` it to the studio: `curl -X PUT -H "x-piano-key: $(cat "$APPDATA/Piano Helper/studio/pair-key.txt")" -H "Content-Type: application/json" --data @lesson.json http://localhost:5080/api/lessons`

## Layout

- `apps/desktop/src` — React UI (runs in Electron and in any browser via studio mode)
- `packages/bridge/src/studio` — studio server: static app, device API, HTTPS cert, Claude/Codex runner
- `packages/shared` — lesson schema, pitch math, fingering planner (`npm test`)
- Data lives in `%APPDATA%\Piano Helper\` (Windows), shared by the desktop app and the studio.
