import { useEffect, useState } from "react";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, type ProviderId } from "@piano-helper/shared";
import { getPiano, isStudio, studioStatus, type StudioStatus } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

const API_PROVIDERS: ProviderId[] = ["anthropic", "openai", "mistral", "openrouter"];

type ClaudeStatus = Awaited<ReturnType<ReturnType<typeof getPiano>["claudeStatus"]>>;

function Dot({ on }: { on: boolean }) {
  return <span className={`dot ${on ? "mastered" : ""}`} />;
}

function StudioReaderCard() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    studioStatus().then(setStatus, (e: unknown) => setErr(e instanceof Error ? e.message : "Studio unreachable"));
  }, [settings.omrEngine]);

  async function persist(next: typeof settings) {
    setSettings(next);
    await getPiano().saveSettings(next);
  }

  const activeLabel = status?.engines.find((e) => e.id === status.active)?.label;
  return (
    <div className="card">
      <h3>Score reader</h3>
      <p className="muted">
        Photos you import are read on the studio computer by Claude Code or Codex, using the plan you already pay for.
        No API keys, no usage credits.
      </p>
      {err && <p className="warn-line">{err}</p>}
      <div className="status-list">
        {(status?.engines ?? []).map((e) => (
          <div key={e.id}>
            <Dot on={e.found} /> {e.label} {e.found ? "installed" : "not found"}
            {status?.active === e.id ? " · reading your photos" : ""}
          </div>
        ))}
      </div>
      {status && !status.active && (
        <p className="warn-line">
          Install one on the studio computer, sign in once, then restart the studio: <code>npm i -g @anthropic-ai/claude-code</code> then{" "}
          <code>claude</code>, or <code>npm i -g @openai/codex</code> then <code>codex login</code>.
        </p>
      )}
      <label className="row">
        Reader
        <select value={settings.omrEngine} onChange={(e) => void persist({ ...settings, omrEngine: e.target.value as typeof settings.omrEngine })}>
          <option value="auto">Automatic{activeLabel ? ` (${activeLabel})` : ""}</option>
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
      </label>
      {status?.active !== "codex" ? (
        <label className="row">
          Claude model
          <select value={settings.claudeModel} onChange={(e) => void persist({ ...settings, claudeModel: e.target.value })}>
            {CLAUDE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="row">
          Codex model
          <input
            type="text"
            placeholder="blank = your Codex default"
            value={settings.codexModel}
            onChange={(e) => void persist({ ...settings, codexModel: e.target.value.trim() })}
          />
        </label>
      )}
      <label className="row">
        Reasoning
        <select
          value={settings.claudeEffort}
          onChange={(e) => void persist({ ...settings, claudeEffort: e.target.value as typeof settings.claudeEffort })}
        >
          {CLAUDE_EFFORTS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Add to every request
        <textarea
          rows={3}
          style={{ width: "100%", marginTop: "0.35rem" }}
          placeholder="e.g. Right hand only. Keep stretches small. Mark anything you're unsure of."
          value={settings.extraPrompt}
          onChange={(e) => void persist({ ...settings, extraPrompt: e.target.value })}
        />
      </label>
    </div>
  );
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
  const studio = isStudio();

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
    if (!studio) void refresh();
  }, [studio]);

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

        {studio && <StudioReaderCard />}
        {!studio && (
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
          <label className="row" style={{ marginTop: "1rem" }}>
            Model
            <select
              value={settings.claudeModel}
              onChange={(e) => void persist({ ...settings, claudeModel: e.target.value })}
            >
              {CLAUDE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{CLAUDE_MODELS.find((m) => m.id === settings.claudeModel)?.hint}</p>
          <label className="row">
            Reasoning
            <select
              value={settings.claudeEffort}
              onChange={(e) => void persist({ ...settings, claudeEffort: e.target.value as typeof settings.claudeEffort })}
            >
              {CLAUDE_EFFORTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">{CLAUDE_EFFORTS.find((e) => e.id === settings.claudeEffort)?.hint}</p>
          <label>
            Add to every Claude request
            <textarea
              rows={4}
              style={{ width: "100%", marginTop: "0.35rem" }}
              placeholder="e.g. Prefer left-hand fingering for bass, keep stretches under an octave, mark uncertain notes."
              value={settings.extraPrompt}
              onChange={(e) => void persist({ ...settings, extraPrompt: e.target.value })}
            />
          </label>
          <p className="muted">
            Latest aliases (Opus / Sonnet / Haiku / Fable) follow new models on your Max plan. No API credits.
            Pick the same model in Claude Desktop's model menu before you send.
          </p>
          <ol className="muted">
            <li>Click Connect Claude Desktop. Claude will reopen so Piano Helper shows up as a tool.</li>
            <li>Choose model + reasoning above. Drop a score on Import, or paste a photo in Claude Desktop.</li>
            <li>Ask Claude to push the lesson. Fingering comes back into the hand coach.</li>
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
        )}

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
            <input
              type="checkbox"
              checked={settings.simpleView}
              onChange={(e) => void persist({ ...settings, simpleView: e.target.checked })}
            />
            Simple view — keys and finger numbers only, no note names or staff
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

        {!studio && (
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

        )}

        {!studio && (
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
        )}
      </div>
    </div>
  );
}
