# Security

Piano Helper is local-first. Do not commit secrets.

Never add:

- `.env`, `.env.local`, or provider API keys
- `secrets.bin` or Electron `safeStorage` dumps
- Claude / Anthropic tokens, `~/.claude.json`, or MCP desktop configs
- Supabase service-role keys (anon keys belong only in your own deploy env)
- Installer signing certificates

Optional website env lives in `apps/web/.env.local` (gitignored). Copy `apps/web/.env.example`.

If you find a leaked key in this repository, rotate it and open an issue.
