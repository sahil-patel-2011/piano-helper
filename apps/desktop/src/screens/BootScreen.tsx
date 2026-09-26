import { useEffect, useState } from "react";
import { getPiano, isStudio, studioPaired } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

export function BootScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const setSettings = useAppStore((s) => s.setSettings);
  const setProfile = useAppStore((s) => s.setProfile);
  const setProgress = useAppStore((s) => s.setProgress);
  const setLibrary = useAppStore((s) => s.setLibrary);
  const setLoaded = useAppStore((s) => s.setLoaded);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        if (isStudio()) {
          const paired = await studioPaired().catch(() => null);
          if (paired === null) {
            setProblem("Can't reach the studio computer. Is `npm run studio` still running, and are you on the same Wi-Fi?");
            return;
          }
          if (!paired) {
            setProblem("This device isn't paired yet. Scan the QR code shown in the studio terminal (it carries the pairing key).");
            return;
          }
        }
        const api = getPiano();
        const [settings, profile, progress, library] = await Promise.all([
          api.getSettings(),
          api.getProfile(),
          api.getProgress(),
          api.listLibrary(),
        ]);
        setSettings(settings);
        setProfile(profile);
        setProgress(progress.stats, progress.measures);
        setLibrary(library);
        setLoaded(true);
        if (!settings.onboardingComplete || !profile) setScreen("onboarding");
        else setScreen("home");
      })();
    }, 300);
    return () => window.clearTimeout(t);
  }, [setLibrary, setLoaded, setProfile, setProgress, setScreen, setSettings]);

  return (
    <div className="page" style={{ display: "grid", placeItems: "center" }}>
      <div style={{ textAlign: "center" }}>
        <img src="/icon.png" width={72} height={72} alt="" style={{ borderRadius: 16 }} />
        <div className="serif" style={{ fontSize: "2rem", marginTop: 14 }}>
          Piano Helper
        </div>
        {problem && (
          <p className="muted" style={{ maxWidth: 360, margin: "1rem auto 0" }}>
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
