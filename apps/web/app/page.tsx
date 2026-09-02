export default function Page() {
  return (
    <main>
      <section className="hero">
        <h1>A studio that waits for the right note.</h1>
        <p>
          Piano Helper is a free, open-source Windows app. It listens through the mic or MIDI, shows which finger to
          use, waits until you play the note, and imports the music you already own. No subscription.
        </p>
        <div className="keys" aria-hidden>
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
        <div className="cta">
          <a className="btn primary" href="/download">
            Download for Windows
          </a>
          <a className="btn" href="/docs/claude">
            Connect Claude Code
          </a>
        </div>
      </section>
      <section className="grid">
        <article className="card">
          <h3>Listen</h3>
          <p className="muted">Microphone after a short play-along. USB MIDI when you want it exact.</p>
        </article>
        <article className="card">
          <h3>Wait mode</h3>
          <p className="muted">The keyboard holds the next note. No rush. Advance only when it is right.</p>
        </article>
        <article className="card">
          <h3>Your music</h3>
          <p className="muted">Snap a page, drop a PDF, or import MusicXML. Not a locked catalog of 5,000 hits we cannot license.</p>
        </article>
        <article className="card">
          <h3>Hands and tuner</h3>
          <p className="muted">Finger numbers, stretch coaching, and a live mic tuner. Muscle-memory mode fades the hints after clean hits.</p>
        </article>
      </section>
      <p className="muted" style={{ marginTop: "2.5rem" }}>
        Mixer and metronome included. Quiet studio UI. Optional account for a stats dashboard. Keys never leave your machine.
      </p>
    </main>
  );
}
