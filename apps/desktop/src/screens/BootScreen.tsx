import { useEffect } from "react";
import { getPiano } from "../lib/piano-api";
import { useAppStore } from "../store/app-store";

export function BootScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const setSettings = useAppStore((s) => s.setSettings);
  const setProfile = useAppStore((s) => s.setProfile);
  const setProgress = useAppStore((s) => s.setProgress);
  const setLibrary = useAppStore((s) => s.setLibrary);
  const setLoaded = useAppStore((s) => s.setLoaded);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
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
      </div>
    </div>
  );
}
