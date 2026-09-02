import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Piano Helper",
  description: "A quiet desktop studio that listens, waits, and practices your music. Free. Local. No subscription.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Serif:wght@500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="wrap">
          <nav className="nav">
            <a className="brand" href="/">
              Piano Helper
            </a>
            <div>
              <a href="/download">Download</a>
              {" · "}
              <a href="/docs/claude">Claude Code</a>
              {" · "}
              <a href="/dashboard">Dashboard</a>
            </div>
          </nav>
          {children}
          <p className="muted" style={{ marginTop: "3rem" }}>
            <a href="/privacy">Privacy</a>
            {" · "}
            <a href="https://github.com/sahil-patel-2011/piano-helper">GitHub</a>
            {" · "}
            <a href="/sign-in">Sign in</a>
          </p>
        </div>
      </body>
    </html>
  );
}
