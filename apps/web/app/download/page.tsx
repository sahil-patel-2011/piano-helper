const latest = process.env.NEXT_PUBLIC_DOWNLOAD_URL ?? "https://github.com/sahil-patel-2011/piano-helper";

export default function DownloadPage() {
  return (
    <main>
      <h1>Download Piano Helper</h1>
      <p className="muted">Windows installer from GitHub Releases. This page is only a link — the .exe does not live on Vercel.</p>
      <p>
        <a className="btn primary" href={latest}>
          Get PianoHelper-Setup
        </a>
      </p>
      <ol className="muted">
        <li>Install and allow the microphone in Windows Privacy settings.</li>
        <li>Calibrate with a few glowing keys.</li>
        <li>Settings → Connect Claude Code (Max subscription — no API key).</li>
      </ol>
    </main>
  );
}
