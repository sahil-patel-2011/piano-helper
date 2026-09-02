export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy</h1>
      <p>Piano Helper is local-first. Practice data and API keys stay in %APPDATA%\\Piano Helper\\.</p>
      <p>Keys are stored with the OS keychain (Electron safeStorage). They are never sent to this website or to Vercel.</p>
      <p>If you enable Sync stats, only session minutes, piece titles, accuracy, and stars are uploaded to your Supabase account.</p>
      <p>Photos and audio never leave the desktop unless you ask a local model or Claude Code to read a file you named.</p>
    </main>
  );
}
