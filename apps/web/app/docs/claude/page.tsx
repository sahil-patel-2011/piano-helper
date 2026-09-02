export default function ClaudeDocs() {
  return (
    <main>
      <h1>Connect Claude Code</h1>
      <p className="muted">
        Piano Helper uses your Claude Max subscription through Claude Code — terminal or the Claude Code
        desktop app. It does not use Anthropic API usage credits.
      </p>
      <ol>
        <li>Install Claude Code and run <code>claude</code> once. Sign in with Max (not an API key).</li>
        <li>Open Piano Helper → Settings → Connect Claude Code.</li>
        <li>Restart Claude Code (terminal or desktop). Keep Piano Helper open.</li>
      </ol>
      <p>Example prompts:</p>
      <pre>{`Import C:\\Sheets\\minuet.pdf and open it in wait mode.
What note is Piano Helper waiting for?
Start Twinkle, measures 1-2, slow.`}</pre>
    </main>
  );
}
