import { useEffect, useState } from "react";
import type { ProviderId } from "@piano-helper/shared";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

const API_PROVIDERS: ProviderId[] = ["anthropic", "openai", "mistral", "openrouter"];

type ClaudeStatus = Awaited<ReturnType<ReturnType<typeof getPiano>["claudeStatus"]>>;

function Dot({ on }: { on: boolean }) {
  return <span className={`dot ${on ? "mastered" : ""}`} />;
}

export function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const setScreen = useAppStore((s) => s.setScreen);
  const [keyDraft, setKeyDraft] = useState("");
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [bridge, setBridge] = useState<{ enabled: boolean; port: number | null; connected: boolean }>({
    enabled: false,
    port: null,
    connected: false,
  });
  const [mcp, setMcp] = useState("");
  const [bridgeMsg, setBridgeMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);
  const [showApi, setShowApi] = useState(settings.providerId !== "claude-cli" && settings.providerId !== "none");

  async function refresh() {
    const api = getPiano();
    setBridge(await api.getBridgeStatus());
    setMcp(await api.mcpConfig());
    setClaude(await api.claudeStatus());
    const flags: Record<string, boolean> = {};
    for (const p of API_PROVIDERS) flags[p] = await api.getSecretExists(p);
    setSaved(flags);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function persist(next: typeof settings) {
    setSettings(next);
    await getPiano().saveSettings(next);
  }

  return (
    <div className="page">
      <div className="stack">
        <div className="page-head">
          <h1>Settings</h1>
        </div>

        <div className="card">
          <h3>Claude Desktop · Max subscription</h3>
          <p className="muted">
            Uses the Claude Desktop app you are already signed into. Piano Helper sends scores to that app and
            Claude can push lessons back here. No API key. No usage credits.
          </p>
          <div className="status-list">
            <div>
              <Dot on={Boolean(claude?.desktopAppFound)} /> Claude Desktop installed
            </div>
            <div>
              <Dot on={Boolean(claude?.desktopSignedIn || claude?.desktopRunning)} /> Signed in on this PC
            </div>
            <div>
              <Dot on={Boolean(claude?.mcpRegistered)} /> Piano Helper listed in Claude Desktop
            </div>
            <div>
              <Dot on={bridge.enabled} /> App listening
              {bridge.connected ? " · Claude is connected" : bridge.enabled ? " · waiting for Claude" : ""}
              {bridge.port ? ` · 127.0.0.1:${bridge.port}` : ""}
            </div>
            <div>
              <Dot on={Boolean(claude?.cliLoggedIn)} /> Terminal Claude Code (optional)
            </div>
          </div>
          {claude?.apiKeyInEnv && (
            <p>Windows has ANTHROPIC_API_KEY set. Piano Helper clears it so your Max login is used.</p>
          )}
          <p className="muted">{claude?.message}</p>
          <div className="row">
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await getPiano().connectClaude();
                setBridgeMsg(r.message);
                setSettings({ ...settings, providerId: "claude-cli", bridgeEnabled: true });
                await refresh();
                setBusy(false);
              }}
            >
              {busy ? "Connecting…" : "Connect Claude Desktop"}
            </button>
            <button
              onClick={async () => {
                await getPiano().openClaudeDesktop();
                setBridgeMsg("Opened Claude Desktop.");
              }}
            >
              Open Claude Desktop
            </button>
            <button
              onClick={async () => {
                const r = await getPiano().copyClaudePrompt();
                setBridgeMsg("Prompt copied. Paste it in a new Claude Desktop chat.");
                if (r.prompt) await navigator.clipboard.writeText(r.prompt);
              }}
            >
              Copy ask-Claude prompt
            </button>
          </div>
          {bridgeMsg && <p>{bridgeMsg}</p>}
          <ol className="muted">
            <li>Click Connect Claude Desktop. Claude will reopen so Piano Helper shows up as a tool.</li>
            <li>Keep Piano Helper open. Drop a score on Import, or paste a photo in Claude Desktop.</li>
            <li>Ask Claude to push the lesson into Piano Helper.</li>
          </ol>
          <pre className="muted" style={{ whiteSpace: "pre-wrap" }}>
            {mcp}
          </pre>
          <button
            className="ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(mcp);
              setBridgeMsg("MCP config copied.");
            }}
          >
            Copy MCP config
          </button>
        </div>

        <div className="card">
          <h3>Studio</h3>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.quiet}
              onChange={(e) => void persist({ ...settings, quiet: e.target.checked })}
            />
            Quiet mode
          </label>
          <label className="row">
            Show finger numbers and hand shape
            <input
              type="checkbox"
              checked={settings.showFingering}
              onChange={(e) => void persist({ ...settings, showFingering: e.target.checked })}
            />
          </label>
          <label className="row">
            Daily goal (minutes)
            <input
              type="number"
              min={5}
              max={60}
              value={settings.dailyGoalMinutes}
              onChange={(e) => void persist({ ...settings, dailyGoalMinutes: Number(e.target.value) })}
            />
          </label>
          <button onClick={() => setScreen("onboarding")}>Recalibrate this device</button>
        </div>

        <div className="card">
          <button className="ghost" onClick={() => setShowApi((v) => !v)}>
            {showApi ? "Hide API keys" : "Other providers (these use paid API credits)"}
          </button>
          {showApi && (
            <>
              <p className="muted">Only if you want OpenAI / Mistral / an Anthropic API key. Max users should skip this.</p>
              <select
                value={settings.providerId}
                onChange={(e) => void persist({ ...settings, providerId: e.target.value as ProviderId })}
              >
                <option value="claude-cli">Claude Code (subscription)</option>
                <option value="none">none — built-ins only</option>
                {API_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p} · API credits
                  </option>
                ))}
              </select>
              {settings.providerId !== "none" && settings.providerId !== "claude-cli" && (
                <div className="row">
                  <input
                    type="password"
                    placeholder={saved[settings.providerId] ? `${settings.providerId} · saved` : "Paste API key"}
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                  />
                  <button
                    onClick={async () => {
                      if (!keyDraft) return;
                      await getPiano().storeSecret(settings.providerId, keyDraft);
                      setKeyDraft("");
                      setSaved((s) => ({ ...s, [settings.providerId]: true }));
                    }}
                  >
                    Save key
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h3>Account sync</h3>
          <label className="row">
            <input
              type="checkbox"
              checked={settings.syncStats}
              onChange={(e) => void persist({ ...settings, syncStats: e.target.checked })}
            />
            Sync stats to the web dashboard (minutes, streak, accuracy only)
          </label>
        </div>
      </div>
    </div>
  );
}
